import { expect, test, type Page, type Request, type Response } from "@playwright/test";
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
}, testInfo) => {
  const fixture: Fixture = JSON.parse(process.env.A4_FIXTURE!);
  const isolatedDatabase = databaseConfig(process.env.A4_POSTGRES_URL);
  const pool = new Pool(isolatedDatabase);
  const context = await browser.newContext({ baseURL: BASE_URL });
  const other = await browser.newContext({ baseURL: BASE_URL });
  const unexpectedMutations: string[] = [];
  const chatPath = `/api/engine/chats/${fixture.chatId}`;
  const filePath = `${chatPath}/files`;
  const projectPath = `/api/projects/${fixture.projectId}`;
  const versionsPath = `${chatPath}/versions`;
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
  let page: Page | undefined;
  // HTTP 200 alone does not prove the client hydrated. Keep bounded, failure-only
  // diagnostics in the CI log: the isolated fixture has no real user/provider data.
  // Do not log cookies, request headers/bodies or the generated database URL.
  const browserFailures: string[] = [];
  const redact = (message: string) =>
    [isolatedDatabase.password, fixture.sessionA, fixture.sessionB].reduce(
      (value, secret) => value.replaceAll(secret, "[disposable credential]"),
      message,
    );
  const recordFailure = (message: string) => {
    if (browserFailures.length < 20) browserFailures.push(redact(message).slice(0, 2_000));
  };
  const loadPaths = [projectPath, chatPath, versionsPath];
  const loaded = new Map<string, Response>();
  let navigationGeneration = 0;
  const requestGeneration = new WeakMap<Request, number>();
  const diagnosticStartedAt = Date.now();
  const apiRequests = new WeakMap<Request, { id: number; atMs: number; generation: number }>();
  const apiTimeline: Array<Record<string, string | number>> = [];
  let nextRequestId = 0;
  const recordApiEvent = (
    event: "start" | "response" | "failed",
    request: Request,
    status?: number,
  ) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_URL || !url.pathname.startsWith("/api/")) return;
    const atMs = Date.now() - diagnosticStartedAt;
    if (event === "start") {
      apiRequests.set(request, { id: ++nextRequestId, atMs, generation: navigationGeneration });
    }
    const start = apiRequests.get(request);
    if (!start || apiTimeline.length >= 80) return;
    apiTimeline.push({
      event,
      requestId: start.id,
      generation: start.generation,
      method: request.method(),
      path: redact(url.pathname).slice(0, 300),
      atMs,
      ...(event === "start" ? {} : { durationMs: atMs - start.atMs }),
      ...(status === undefined ? {} : { status }),
    });
  };
  const assertBuilderLoaded = async (initialStartup = false) => {
    const readinessStartedAt = Date.now();
    // Observe the app's own GETs, not APIRequestContext calls that bypass hydration.
    // Cold webpack/client/API startup uses the existing navigation budget.
    // Reload and all ordinary actions keep the configured 15-second limit.
    // This proves functionality, not a 15-second cold-start performance SLA.
    await expect
      .poll(() => [...loaded.keys()].sort(), {
        message: "Builder hydration GETs",
        ...(initialStartup ? { timeout: testInfo.project.use.navigationTimeout } : {}),
      })
      .toEqual([...loadPaths].sort());
    for (const path of loadPaths) {
      expect(loaded.get(path)!.status(), `Builder hydration GET ${path}`).toBe(200);
    }
    const [project, chat, versions] = await Promise.all(
      loadPaths.map((path) => loaded.get(path)!.json()),
    );
    expect(project).toMatchObject({ success: true, project: { id: fixture.projectId } });
    expect(chat).toMatchObject({
      id: fixture.chatId,
      chatId: fixture.chatId,
      projectId: fixture.projectId,
      latestVersion: { id: fixture.versionId, versionId: fixture.versionId },
    });
    expect(versions.versions).toHaveLength(1);
    expect(versions.versions[0]).toMatchObject({
      id: fixture.versionId,
      versionId: fixture.versionId,
    });
    if (initialStartup) {
      console.info("[project-persistence] initial hydration ready", {
        budgetMs: testInfo.project.use.navigationTimeout,
        waitMs: Date.now() - readinessStartedAt,
        generation: navigationGeneration,
        apiTimeline: apiTimeline.filter(
          (event) =>
            event.generation === navigationGeneration &&
            event.method === "GET" &&
            loadPaths.includes(String(event.path)),
        ),
      });
    }
    return project;
  };
  let primaryFailure = false;
  try {
    page = await context.newPage();
    page.on("pageerror", (error) => recordFailure(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") recordFailure(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      recordApiEvent("failed", request);
      const path = new URL(request.url()).pathname;
      recordFailure(`${request.method()} ${path}: ${request.failure()?.errorText}`);
    });
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page!.mainFrame()) {
        navigationGeneration += 1;
        loaded.clear();
      }
      recordApiEvent("start", request);
      const url = new URL(request.url());
      if (
        navigationGeneration > 0 &&
        url.origin === BASE_URL &&
        request.method() === "GET" &&
        loadPaths.includes(url.pathname)
      ) {
        requestGeneration.set(request, navigationGeneration);
      }
    });
    page.on("response", (response) => {
      recordApiEvent("response", response.request(), response.status());
      const url = new URL(response.url());
      // File save can leave a versions refetch in flight across reload. Only
      // requests STARTED in this navigation may prove this navigation hydrated.
      if (
        requestGeneration.get(response.request()) === navigationGeneration &&
        !loaded.has(url.pathname)
      ) {
        loaded.set(url.pathname, response);
      }
    });
    expect(await data()).toEqual([]);
    const before = await version();
    expect(JSON.parse(before.files_json)).toEqual(fixture.files);
    const navigation = await page.goto(
      `/builder?project=${fixture.projectId}&chatId=${fixture.chatId}`,
      { waitUntil: "domcontentloaded" },
    );
    expect(navigation?.status(), "Builder must render before editing").toBe(200);
    await assertBuilderLoaded(true);
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

    const reloadNavigation = await page.reload({ waitUntil: "domcontentloaded" });
    expect(reloadNavigation?.status(), "Builder must render after reload").toBe(200);
    const reloaded = await assertBuilderLoaded();
    expect(reloaded.data).toMatchObject({
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
    const visibleText = page
      ? await page
          .locator("body")
          .innerText({ timeout: 1_000 })
          .catch(() => "[page unavailable]")
      : "[page was not created]";
    console.error("[project-persistence] browser failure", {
      path: page ? new URL(page.url(), BASE_URL).pathname : null,
      browserFailures,
      unexpectedMutations,
      apiTimeline,
      hydrationResponses: [...loaded].map(([path, response]) => [path, response.status()]),
      visibleText: redact(visibleText).slice(0, 8_000),
    });
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
