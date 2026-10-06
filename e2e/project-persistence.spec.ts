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

async function openEditor(page: Page, assertFilesReady: () => Promise<void>) {
  // Natural app data may arrive before the code-view hook runs. Prove the
  // data first, then require the real view/file/editor through ordinary actions.
  await assertFilesReady();
  await page.getByRole("button", { name: "Kod", exact: true }).click();
  await page.getByRole("menuitem", { name: "Kodvy", exact: true }).click();
  await page.getByRole("button", { name: "page.tsx", exact: true }).click();
  const pane = page.getByText("app/page.tsx", { exact: true }).locator("xpath=../..");
  await pane.getByRole("button", { name: "Redigera fil", exact: true }).click();
  // PreviewPanelCode owns the header and its direct editor sections. The raw
  // CodeSectionEditorsCodeView textarea is one wrapper deep; Hero/other form
  // fields are nested within their sections. Keep strictness and assert the
  // code value separately, so missing/duplicate/wrong-content editors fail.
  return { pane, editor: pane.locator(':scope > div > textarea[data-slot="textarea"]') };
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
  const responseKey = (method: string, path: string) => `${method} ${path}`;
  const observedKeys = [
    ...[...loadPaths, filePath].map((path) => responseKey("GET", path)),
    responseKey("PATCH", filePath),
    responseKey("POST", savePath),
  ];
  const outcomes = new Map<string, Response | Error>();
  const responseFloors = new Map<string, number>();
  let navigationGeneration = 0;
  const requestGeneration = new WeakMap<Request, number>();
  const diagnosticStartedAt = Date.now();
  const apiRequests = new WeakMap<Request, { id: number; atMs: number; generation: number }>();
  const apiTimeline: Array<Record<string, string | number>> = [];
  let nextRequestId = 0;
  let initialReadyBy = 0;
  const remainingStartup = () => {
    const remaining = initialReadyBy - Date.now();
    expect(remaining, "Shared initial app-data deadline exhausted").toBeGreaterThan(0);
    return remaining; // Never pass timeout: 0 (unbounded in Playwright).
  };
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
  const recordOutcome = (request: Request, outcome: Response | Error) => {
    const key = responseKey(request.method(), new URL(request.url()).pathname);
    const start = apiRequests.get(request);
    if (
      requestGeneration.get(request) === navigationGeneration &&
      start && start.id > (responseFloors.get(key) ?? 0) && !outcomes.has(key)
    ) {
      outcomes.set(key, outcome);
    }
  };
  const waitForAppResponse = async (method: string, path: string, timeout?: number) => {
    const key = responseKey(method, path);
    await expect.poll(() => outcomes.has(key), {
      message: `App response ${key}`,
      ...(timeout === undefined ? {} : { timeout }),
    }).toBe(true);
    const outcome = outcomes.get(key)!;
    if (outcome instanceof Error) throw outcome;
    expect(outcome.status(), key).toBe(200);
    return outcome;
  };
  const beginActionResponse = (method: string, path: string) => {
    const key = responseKey(method, path);
    // An earlier post-PATCH refetch cannot stand in for Save project's GET.
    responseFloors.set(key, nextRequestId);
    outcomes.delete(key);
  };
  const assertBuilderLoaded = async (initialStartup = false) => {
    const readinessStartedAt = Date.now();
    // Observe the app's own GETs, not APIRequestContext calls that bypass hydration.
    // Metadata and first files share ONE existing navigation-sized deadline.
    // Reload and ordinary actions keep the configured 15-second limit.
    // This proves functionality, not a 15-second cold-start performance SLA.
    const [project] = await Promise.all(loadPaths.map(async (path) => {
      const response = await waitForAppResponse("GET", path, initialStartup ? remainingStartup() : undefined);
      const body = await response.json();
      if (path === projectPath) {
        expect(body).toMatchObject({ success: true, project: { id: fixture.projectId } });
      } else if (path === chatPath) {
        expect(body).toMatchObject({
          id: fixture.chatId, chatId: fixture.chatId, projectId: fixture.projectId,
          latestVersion: { id: fixture.versionId, versionId: fixture.versionId },
        });
      } else {
        expect(body.versions).toHaveLength(1);
        expect(body.versions[0]).toMatchObject({ id: fixture.versionId, versionId: fixture.versionId });
      }
      return body;
    }));
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
  const assertFileResponse = async (response: Response, expected: Array<{ name: string; content: string }>) => {
    expect(new URL(response.request().url()).searchParams.get("versionId")).toBe(fixture.versionId);
    const body = await response.json();
    expect(body.versionId).toBe(fixture.versionId);
    expect(body.files.map((file: { name: string; content: string }) => ({ name: file.name, content: file.content }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)))
      .toEqual([...expected].sort((a, b) => a.name.localeCompare(b.name)));
  };
  const assertFilesLoaded = async (expected: Array<{ name: string; content: string }>, initialStartup = false) => {
    const response = await waitForAppResponse("GET", filePath, initialStartup ? remainingStartup() : undefined);
    await assertFileResponse(response, expected);
    if (initialStartup) {
      console.info("[project-persistence] initial files ready", {
        remainingBudgetMs: remainingStartup(), generation: navigationGeneration,
      });
    }
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
      recordOutcome(request, new Error(`App request failed: ${request.method()} ${path}`));
    });
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page!.mainFrame()) {
        navigationGeneration += 1;
        outcomes.clear();
        responseFloors.clear();
      }
      recordApiEvent("start", request);
      const url = new URL(request.url());
      if (
        navigationGeneration > 0 &&
        url.origin === BASE_URL &&
        observedKeys.includes(responseKey(request.method(), url.pathname))
      ) {
        requestGeneration.set(request, navigationGeneration);
      }
    });
    page.on("response", (response) => {
      recordApiEvent("response", response.request(), response.status());
      // File save can leave a versions refetch in flight across reload. Only
      // requests STARTED in this navigation may prove this navigation hydrated.
      recordOutcome(response.request(), response);
    });
    expect(await data()).toEqual([]);
    const before = await version();
    expect(JSON.parse(before.files_json)).toEqual(fixture.files);
    const navigation = await page.goto(
      `/builder?project=${fixture.projectId}&chatId=${fixture.chatId}`,
      { waitUntil: "domcontentloaded" },
    );
    expect(navigation?.status(), "Builder must render before editing").toBe(200);
    initialReadyBy = Date.now() + testInfo.project.use.navigationTimeout!;
    await assertBuilderLoaded(true);
    const { pane, editor } = await openEditor(page, () => assertFilesLoaded(
      fixture.files.map((file) => ({ name: file.path, content: file.content })), true,
    ));
    const original = fixture.files.find((file) => file.path === "app/page.tsx")!.content;
    const changed = original.replace("A4_INITIAL_MARKER", "A4_SAVED_MARKER");
    expect(changed).not.toBe(original);
    await expect(editor).toHaveValue(original);
    await editor.fill(changed);
    beginActionResponse("PATCH", filePath);
    await pane.getByRole("button", { name: "Spara fil", exact: true }).click();
    // Responses arriving during the click are already retained by the observer.
    // Start the separate response budget only after the UI action completes.
    const patchResponse = await waitForAppResponse("PATCH", filePath);
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
    beginActionResponse("GET", filePath);
    beginActionResponse("POST", savePath);
    await page.getByRole("menuitem", { name: "Spara projekt", exact: true }).click();
    const fetchedResponse = await waitForAppResponse("GET", filePath);
    expect(fetchedResponse.status()).toBe(200);
    await assertFileResponse(fetchedResponse, expectedFiles);
    // Only this first POST introduces a cold route. Its response budget starts
    // after the click and warm GET; neither consumes this separate 120s budget.
    // Every UI action and the GET stay at 15s; the total ceiling stays at 240s.
    const savedResponse = await waitForAppResponse("POST", savePath, testInfo.project.use.navigationTimeout);
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
    await expect((await openEditor(page, () => assertFilesLoaded(expectedFiles))).editor).toHaveValue(changed);
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
      appResponses: [...outcomes].map(([key, outcome]) => [key, outcome instanceof Error ? "request failed" : outcome.status()]),
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
