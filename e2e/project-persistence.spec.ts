import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import {
  assertRuntimeIsolation,
  BASE_URL,
  databaseConfig,
} from "../scripts/e2e/project-persistence-env.mjs";

type File = { path: string; content: string; language: string };
type Fixture = {
  projectId: string;
  chatId: string;
  versionId: string;
  sessionA: string;
  sessionB: string;
  files: File[];
};

// No DB/env validation at import: discovery --list must be side-effect-free.
// This hook runs before the test's browser fixture is requested.
test.beforeAll(() => assertRuntimeIsolation(process.cwd()));

async function openEditor(page: Page) {
  await page.getByRole("button", { name: "Kod", exact: true }).click();
  await page.getByRole("menuitem", { name: "Kodvy", exact: true }).click();
  await page.getByRole("button", { name: "page.tsx", exact: true }).click();
  const pane = page.getByText("app/page.tsx", { exact: true }).locator("xpath=../..");
  await pane.getByRole("button", { name: "Redigera fil", exact: true }).click();
  return { pane, editor: pane.locator('textarea[data-slot="textarea"]') };
}

test("real file edit + Save project survives reload; another guest cannot read or overwrite it", async ({
  browser,
}) => {
  const fixture: Fixture = JSON.parse(process.env.A4_FIXTURE!);
  const pool = new Pool(databaseConfig(process.env.A4_POSTGRES_URL));
  const context = await browser.newContext({ baseURL: BASE_URL });
  const other = await browser.newContext({ baseURL: BASE_URL });
  const unexpectedMutations: string[] = [];
  const filePath = `/api/engine/chats/${fixture.chatId}/files`;
  const projectPath = `/api/projects/${fixture.projectId}`;
  const savePath = `${projectPath}/save`;
  await context.addCookies([
    { name: "sajtmaskin_session", value: fixture.sessionA, url: BASE_URL },
  ]);
  await other.addCookies([{ name: "sajtmaskin_session", value: fixture.sessionB, url: BASE_URL }]);
  // Additional browser diagnostics, NOT the server's egress boundary (the kernel is).
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== BASE_URL) {
      await route.abort();
      return;
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      !(
        (request.method() === "PATCH" && url.pathname === filePath) ||
        (request.method() === "POST" && [savePath, "/api/analytics"].includes(url.pathname))
      )
    ) {
      unexpectedMutations.push(`${request.method()} ${url.pathname}`);
      await route.abort();
      return;
    }
    await route.continue();
  });
  const version = async () =>
    (
      await pool.query(
        "SELECT files_json, files_revision, release_state, verification_state, verification_summary, promoted_at, preview_url, edit_kind FROM engine_versions WHERE id=$1",
        [fixture.versionId],
      )
    ).rows[0];
  const data = async () =>
    (await pool.query("SELECT * FROM project_data WHERE project_id=$1", [fixture.projectId])).rows;
  const fileRows = async () =>
    (
      await pool.query(
        "SELECT path, size_bytes FROM project_files WHERE project_id=$1 ORDER BY path",
        [fixture.projectId],
      )
    ).rows;
  let primaryFailure = false;
  try {
    expect(await data()).toEqual([]);
    const before = await version();
    expect(JSON.parse(before.files_json)).toEqual(fixture.files);
    const page = await context.newPage();
    const navigation = await page.goto(
      `/builder?project=${fixture.projectId}&chatId=${fixture.chatId}`,
      { waitUntil: "domcontentloaded" },
    );
    expect(navigation?.status(), "Builder must render before editing").toBe(200);
    const { pane, editor } = await openEditor(page);
    const original = fixture.files.find((file) => file.path === "app/page.tsx")!.content;
    const changed = original.replace("A4_INITIAL_MARKER", "A4_SAVED_MARKER");
    expect(changed).not.toBe(original);
    await expect(editor).toHaveValue(original);
    await editor.fill(changed);
    const patched = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === filePath && response.request().method() === "PATCH",
    );
    await pane.getByRole("button", { name: "Spara fil", exact: true }).click();
    const patchResponse = await patched;
    expect(patchResponse.status()).toBe(200);
    expect(patchResponse.request().postDataJSON()).toEqual({
      versionId: fixture.versionId,
      fileName: "app/page.tsx",
      content: changed,
    });
    expect(await patchResponse.json()).toMatchObject({
      success: true,
      versionId: fixture.versionId,
      file: { name: "app/page.tsx", content: changed, locked: false },
      previewUrl: null,
    });
    const after = await version();
    const expectedFiles = fixture.files
      .map((file) => ({
        name: file.path,
        content: file.path === "app/page.tsx" ? changed : file.content,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(
      JSON.parse(after.files_json)
        .map((file: File) => ({ name: file.path, content: file.content }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)),
    ).toEqual(expectedFiles);
    expect(after.files_revision).not.toBe(before.files_revision);
    expect(after).toMatchObject({
      release_state: "draft",
      verification_state: "pending",
      verification_summary: null,
      promoted_at: null,
      preview_url: null,
      edit_kind: "quick_edit",
    });

    await page
      .getByRole("button", { name: "Mer — spara, inställningar, import och export", exact: true })
      .click();
    const fetched = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === filePath && response.request().method() === "GET",
    );
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === savePath && response.request().method() === "POST",
    );
    await page.getByRole("menuitem", { name: "Spara projekt", exact: true }).click();
    const fetchedResponse = await fetched;
    expect(fetchedResponse.status()).toBe(200);
    expect((await fetchedResponse.json()).files).toEqual(
      expect.arrayContaining(expectedFiles.map((file) => expect.objectContaining(file))),
    );
    const savedResponse = await saved;
    expect(savedResponse.status()).toBe(200);
    expect(await savedResponse.json()).toEqual({ success: true });
    const savedBody = savedResponse.request().postDataJSON();
    expect(savedBody.chatId).toBe(fixture.chatId);
    expect(
      savedBody.files
        .map((file: { name: string; content: string }) => ({
          name: file.name,
          content: file.content,
        }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)),
    ).toEqual(expectedFiles);
    expect(savedBody).not.toHaveProperty("previewUrl");
    expect(savedBody).not.toHaveProperty("currentCode");
    await expect(page.getByText("Projekt sparat.", { exact: true })).toBeVisible();
    const stored = await data();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      chat_id: fixture.chatId,
      files: savedBody.files,
      messages: savedBody.messages,
      demo_url: null,
      current_code: null,
    });
    expect(stored[0].meta.palette).toEqual(savedBody.meta.palette);
    expect(await fileRows()).toEqual(
      expectedFiles.map((file) => ({ path: file.name, size_bytes: file.content.length })),
    );

    const reloaded = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === projectPath && response.request().method() === "GET",
    );
    const reloadNavigation = await page.reload({ waitUntil: "domcontentloaded" });
    expect(reloadNavigation?.status(), "Builder must render after reload").toBe(200);
    const reloadResponse = await reloaded;
    expect(reloadResponse.status()).toBe(200);
    expect((await reloadResponse.json()).data).toMatchObject({
      chat_id: fixture.chatId,
      files: savedBody.files,
      messages: savedBody.messages,
    });
    await expect((await openEditor(page)).editor).toHaveValue(changed);
    expect(
      unexpectedMutations,
      "Unexpected generation, preview, provider or mutation route",
    ).toEqual([]);
    await context.close();

    const snapshot = { version: await version(), data: await data(), files: await fileRows() };
    expect((await other.request.get(projectPath)).status()).toBe(404);
    expect((await other.request.get(`${filePath}?versionId=${fixture.versionId}`)).status()).toBe(
      404,
    );
    expect(
      (
        await other.request.patch(filePath, {
          data: {
            versionId: fixture.versionId,
            fileName: "app/page.tsx",
            content: "unauthorized overwrite",
          },
        })
      ).status(),
    ).toBe(404);
    const denied = await other.request.post(savePath, { data: savedBody });
    expect(denied.status()).toBe(404);
    expect(await denied.json()).toEqual({ success: false, error: "Project not found" });
    expect({ version: await version(), data: await data(), files: await fileRows() }).toEqual(
      snapshot,
    );
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    // A timed-out browser can already be gone. Attempt every cleanup without
    // replacing the original HTTP/assertion failure with a context-close error.
    const cleanup = await Promise.allSettled([context.close(), other.close(), pool.end()]);
    const failures = cleanup.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length > 0) {
      if (!primaryFailure) throw new AggregateError(failures, "Persistence test cleanup failed");
      console.error("[project-persistence] cleanup also failed", failures);
    }
  }
});
