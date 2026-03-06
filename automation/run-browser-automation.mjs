#!/usr/bin/env node

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const eqIdx = token.indexOf("=");
    if (eqIdx > -1) {
      const key = token.slice(2, eqIdx);
      const value = token.slice(eqIdx + 1);
      args[key] = value;
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function parseConfig(text) {
  const config = {};
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx < 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    config[key] = value;
  }
  return config;
}

function cfg(config, key, fallback = "") {
  if (Object.prototype.hasOwnProperty.call(config, key)) {
    return String(config[key]);
  }
  return fallback;
}

function cfgBool(config, key, fallback = false) {
  if (!Object.prototype.hasOwnProperty.call(config, key)) {
    return fallback;
  }
  const value = String(config[key]).trim().toLowerCase();
  return ["1", "true", "y", "yes", "on"].includes(value);
}

function cfgInt(config, key, fallback = 0) {
  const value = Number.parseInt(cfg(config, key, String(fallback)), 10);
  if (Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

function asAbsolute(root, maybeRelative) {
  if (!maybeRelative) {
    return root;
  }
  if (path.isAbsolute(maybeRelative)) {
    return maybeRelative;
  }
  return path.join(root, maybeRelative);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function randomDelay(baseMs, jitterMs) {
  if (jitterMs <= 0) {
    return Math.max(0, baseMs);
  }
  const delta = Math.round((Math.random() * 2 - 1) * jitterMs);
  return Math.max(0, baseMs + delta);
}

async function isVisible(locator) {
  try {
    return await locator.first().isVisible();
  } catch {
    return false;
  }
}

async function requireVisible(locator, label, timeoutMs = 15000) {
  const count = await locator.count();
  if (count < 1) {
    fail(`${label} was not found.`);
  }
  await locator.first().waitFor({ state: "visible", timeout: timeoutMs });
  return locator.first();
}

async function clickAndWait(locator, label, timings, { longStep = false } = {}) {
  const target = await requireVisible(locator, label);
  await target.click();
  if (longStep) {
    await sleep(timings.longDelayMs);
    return;
  }
  await sleep(randomDelay(timings.clickDelayMs, timings.clickDelayJitterMs));
}

function parseIteration(value) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n) || n < 1) {
    fail(`Invalid iteration number: ${value}`);
  }
  return n;
}

function outputFileName(prefix, iteration, ext) {
  if (iteration <= 1) {
    return `${prefix}${ext}`;
  }
  return `${prefix} (${iteration})${ext}`;
}

function runGit(repoPath, args) {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolvePromptPath(root, config, iteration, explicitPromptPath) {
  if (explicitPromptPath) {
    return asAbsolute(root, explicitPromptPath);
  }

  const promptDir = asAbsolute(root, cfg(config, "ITERATION_PROMPT_DIR", "automation/runtime"));
  const promptPrefix = cfg(config, "ITERATION_PROMPT_FILE_PREFIX", "browser-input-");
  const promptExt = cfg(config, "ITERATION_PROMPT_FILE_EXTENSION", ".md");
  const fileName = `${promptPrefix}${String(iteration).padStart(2, "0")}${promptExt}`;
  return path.join(promptDir, fileName);
}

function resolveRepositoryTarget(config, cliRepoName) {
  const allowAnyOwner = cfgBool(config, "ALLOW_ANY_REPOSITORY_OWNER", true);
  const repoName = cliRepoName || cfg(config, "REPOSITORY_REPO_NAME", "");
  const matchText = cfg(config, "REPOSITORY_MATCH_TEXT", "");
  const matchMode = cfg(config, "REPOSITORY_MATCH_MODE", "contains").toLowerCase();

  if (allowAnyOwner && repoName) {
    return {
      type: "repo-name",
      repoName,
      allowAnyOwner: true,
    };
  }

  if (matchText) {
    return {
      type: "match-text",
      matchText,
      matchMode,
    };
  }

  fail("Repository target is not configured. Set REPOSITORY_REPO_NAME or REPOSITORY_MATCH_TEXT.");
}

function repositoryMatch(text, target) {
  if (target.type === "repo-name") {
    const pattern = new RegExp(`(^|\\s)[^\\s/]+/${escapeRegex(target.repoName)}(\\s|$)`, "i");
    return pattern.test(text);
  }

  if (target.type === "match-text") {
    if (target.matchMode === "exact") {
      return text === target.matchText;
    }
    return text.toLowerCase().includes(target.matchText.toLowerCase());
  }

  return false;
}

async function findRepositoryMenuItem(page, role, target) {
  const items = page.locator(`[role="${role}"]`);
  const count = await items.count();

  for (let i = 0; i < count; i += 1) {
    const row = items.nth(i);
    const visible = await isVisible(row);
    if (!visible) {
      continue;
    }
    const text = normalizeWhitespace(await row.innerText());
    if (!text) {
      continue;
    }
    if (repositoryMatch(text, target)) {
      return row;
    }
  }

  return null;
}

async function pickHighestNumberModel(page) {
  const rows = page.locator('[role="menuitemradio"]');
  const count = await rows.count();
  let bestIndex = -1;
  let bestNumber = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const text = normalizeWhitespace(await row.innerText());
    const match = text.match(/(\d+(\.\d+)?)/);
    if (!match) {
      continue;
    }
    const value = Number.parseFloat(match[1]);
    if (!Number.isNaN(value) && value > bestNumber) {
      bestNumber = value;
      bestIndex = i;
    }
  }

  if (bestIndex < 0) {
    return null;
  }

  return rows.nth(bestIndex);
}

async function assertAppsAndSitesState(page, config, shouldExist) {
  const appsText = cfg(config, "EXPECT_APPS_BUTTON_TEXT", "Apps");
  const sitesText = cfg(config, "EXPECT_SITES_BUTTON_TEXT", "Sites");

  const appsLocator = page.getByRole("button", { name: new RegExp(escapeRegex(appsText), "i") });
  const sitesLocator = page.getByRole("button", { name: new RegExp(escapeRegex(sitesText), "i") });

  const appsVisible = await isVisible(appsLocator);
  const sitesVisible = await isVisible(sitesLocator);

  if (shouldExist && (!appsVisible || !sitesVisible)) {
    fail(`Expected both "${appsText}" and "${sitesText}" buttons to exist, but they do not.`);
  }

  if (!shouldExist && (appsVisible || sitesVisible)) {
    fail(`Expected "${appsText}" and "${sitesText}" to be absent at this stage, but at least one is visible.`);
  }
}

async function reportReady(page, config) {
  const copyText = cfg(config, "REPORT_COPY_BUTTON_TEXT", "Copy contents");
  const downloadAria = cfg(config, "REPORT_DOWNLOAD_BUTTON_ARIA", "Download");
  const headingText = cfg(config, "REPORT_MODE_HEADING_TEXT", "Summary");

  const copyVisible = await isVisible(
    page.getByRole("button", { name: new RegExp(escapeRegex(copyText), "i") }),
  );
  if (copyVisible) {
    return true;
  }

  const downloadVisible = await isVisible(
    page.locator(`[aria-label="${downloadAria}"]`),
  );
  if (downloadVisible) {
    return true;
  }

  const headingVisible = await isVisible(
    page.getByRole("heading", { name: new RegExp(escapeRegex(headingText), "i") }),
  );
  return headingVisible;
}

async function waitForReport(page, config) {
  const maxWaitMinutes = cfgInt(config, "REPORT_MAX_WAIT_MINUTES", 50);
  const pollRunningMs = cfgInt(config, "REPORT_POLL_WHILE_RUNNING_SECONDS", 10) * 1000;
  const pollWaitingMs = cfgInt(config, "REPORT_POLL_WHILE_WAITING_SECONDS", 60) * 1000;
  const start = Date.now();
  let started = false;

  const runningHints = ["Running", "Searching", "Gathering", "Analyzing", "Deep research"];

  while (Date.now() - start < maxWaitMinutes * 60_000) {
    if (await reportReady(page, config)) {
      return;
    }

    if (!started) {
      for (const hint of runningHints) {
        const hintVisible = await isVisible(page.getByText(hint, { exact: false }));
        if (hintVisible) {
          started = true;
          break;
        }
      }
    }

    await sleep(started ? pollRunningMs : pollWaitingMs);
  }

  fail(`Timed out waiting for report output after ${maxWaitMinutes} minutes.`);
}

async function tryCopyReport(page, config, timings) {
  const copyText = cfg(config, "REPORT_COPY_BUTTON_TEXT", "Copy contents");
  const copyButton = page.getByRole("button", { name: new RegExp(escapeRegex(copyText), "i") });
  if (!(await isVisible(copyButton))) {
    return null;
  }

  await clickAndWait(copyButton, "Copy contents button", timings);
  await sleep(cfgInt(config, "WAIT_AFTER_COPY_MS", 500));

  try {
    const text = await page.evaluate(async () => navigator.clipboard.readText());
    if (text && text.trim().length > 0) {
      return text;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryDownloadReport(page, config, timings, outputDir) {
  const downloadAria = cfg(config, "REPORT_DOWNLOAD_BUTTON_ARIA", "Download");
  const downloadButton = page.locator(`[aria-label="${downloadAria}"]`);
  if (!(await isVisible(downloadButton))) {
    return null;
  }

  const target = await requireVisible(downloadButton, "Report download button");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    target.click(),
  ]);
  await sleep(cfgInt(config, "WAIT_AFTER_DOWNLOAD_MS", 1500));

  const suggestedName = download.suggestedFilename() || "report-download";
  const tempPath = path.join(outputDir, `tmp-${Date.now()}-${suggestedName}`);
  await download.saveAs(tempPath);
  await sleep(timings.longDelayMs);
  return tempPath;
}

async function readDownloadedText(downloadPath) {
  const ext = path.extname(downloadPath).toLowerCase();
  if (![".md", ".markdown", ".txt"].includes(ext)) {
    return null;
  }
  return fs.readFile(downloadPath, "utf8");
}

async function collectManualReportFromTerminal(config, promptPath) {
  const endMarker = cfg(config, "MANUAL_REPORT_END_MARKER", "EOF");
  console.log("");
  console.log("[browser-automation] Cursor manual mode is active.");
  console.log(`[browser-automation] Prompt file: ${promptPath}`);
  console.log("[browser-automation] Complete the flow in Cursor browser, then copy the final markdown output.");
  console.log(`[browser-automation] Paste report text below. End by typing ${endMarker} on its own line.`);
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const lines = [];
  try {
    for await (const line of rl) {
      if (line.trim() === endMarker) {
        break;
      }
      lines.push(line);
    }
  } finally {
    rl.close();
  }

  const text = lines.join("\n").trim();
  if (!text) {
    fail("No report text was captured in cursor-manual mode.");
  }
  return `${text}\n`;
}

async function writeRunMetadata(root, iteration, payload) {
  const metadataPath = path.join(
    asAbsolute(root, "automation/reports"),
    `browser-run-iteration-${String(iteration).padStart(2, "0")}.json`,
  );
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify(payload, null, 2), "utf8");
  return metadataPath;
}

async function askForManualLoginCheckpoint(config, page) {
  if (!cfgBool(config, "MANUAL_LOGIN_CHECKPOINT", true)) {
    return;
  }

  const promptText = cfg(
    config,
    "LOGIN_READY_PROMPT",
    "Type OK when logged in and on the ChatGPT chat page",
  );
  const confirmText = cfg(config, "LOGIN_READY_CONFIRM_TEXT", "OK");

  console.log("");
  console.log("[browser-automation] Manual login checkpoint is enabled.");
  console.log(`[browser-automation] Current page URL: ${page.url()}`);
  console.log("[browser-automation] Log in and open the ChatGPT chat page, then confirm below.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (await rl.question(`${promptText}\n> `)).trim();
    if (answer.toLowerCase() !== confirmText.toLowerCase()) {
      fail(`Confirmation mismatch. Expected "${confirmText}".`);
    }
  } finally {
    rl.close();
  }
}

function selectChatPage(context, chatUrl, fallbackPage) {
  const chatOrigin = new URL(chatUrl).origin.toLowerCase();
  const pages = context.pages();
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    const candidateUrl = String(pages[i].url() || "").toLowerCase();
    if (candidateUrl.startsWith(chatOrigin)) {
      return pages[i];
    }
  }
  return fallbackPage;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage:");
    console.log("  node automation/run-browser-automation.mjs --iteration 1");
    console.log("Optional flags:");
    console.log("  --root <path>");
    console.log("  --config <path>");
    console.log("  --repo-path <path>");
    console.log("  --repo-name <name>");
    console.log("  --prompt-file <path>");
    console.log("  --runtime <playwright|cursor-manual>");
    console.log("  --headless true|false");
    return;
  }

  const root = path.resolve(args.root || process.cwd());
  const configPath = asAbsolute(root, args.config || "config.browser.txt");
  if (!existsSync(configPath)) {
    fail(`Missing config file: ${configPath}`);
  }

  const configRaw = await fs.readFile(configPath, "utf8");
  const config = parseConfig(configRaw);
  const strictMode = cfgBool(config, "STRICT_MODE", true);
  const iteration = parseIteration(args.iteration || "1");
  const runtimeMode = String(args.runtime || cfg(config, "BROWSER_RUNTIME", "playwright")).trim().toLowerCase();
  if (!["playwright", "cursor-manual"].includes(runtimeMode)) {
    fail(`Unsupported runtime mode: ${runtimeMode}`);
  }
  const repoPathInput = args["repo-path"] || cfg(config, "REPO_PATH", ".");
  const repoPath = path.isAbsolute(repoPathInput)
    ? repoPathInput
    : path.resolve(process.cwd(), repoPathInput);
  const useGitHubRepo = cfgBool(config, "USE_GIT_HUB_REPO", true);
  const promptPath = resolvePromptPath(root, config, iteration, args["prompt-file"]);
  const outputDir = asAbsolute(root, cfg(config, "REPORT_OUTPUT_DIR", cfg(config, "OUTPUT_DIR", "automation/inbox")));
  const outputExt = cfg(config, "REPORT_SAVE_EXTENSION", ".md");
  const outputPrefix = cfg(config, "OUTPUT_FILE_PREFIX", "deep-research-report");
  const outputPath = path.join(outputDir, outputFileName(outputPrefix, iteration, outputExt));
  await fs.mkdir(outputDir, { recursive: true });

  if (!existsSync(promptPath)) {
    fail(`Missing prompt file for iteration ${iteration}: ${promptPath}`);
  }

  const promptText = await fs.readFile(promptPath, "utf8");
  if (!promptText.trim()) {
    fail(`Prompt file is empty: ${promptPath}`);
  }

  const verifyBranch = cfgBool(config, "VERIFY_GIT_BRANCH", true);
  let currentBranch = "";
  if (verifyBranch) {
    if (!existsSync(repoPath)) {
      fail(`Repo path does not exist: ${repoPath}`);
    }
    currentBranch = runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const expectedBranch = cfg(config, "EXPECTED_GIT_BRANCH", "");
    if (expectedBranch && currentBranch !== expectedBranch) {
      fail(`Branch mismatch. Expected "${expectedBranch}" but found "${currentBranch}".`);
    }
  }

  const timings = {
    clickDelayMs: cfgInt(config, "RANDOM_CLICK_DELAY_MS", 4000),
    clickDelayJitterMs: cfgInt(config, "RANDOM_CLICK_JITTER_MS", 600),
    longDelayMs: cfgInt(config, "LONG_STEP_DELAY_MS", 12000),
  };

  if (runtimeMode === "cursor-manual") {
    const manualReportText = await collectManualReportFromTerminal(config, promptPath);
    await fs.writeFile(outputPath, manualReportText, "utf8");

    const metadataPath = await writeRunMetadata(root, iteration, {
      success: true,
      runtime: runtimeMode,
      iteration,
      promptPath,
      outputPath,
      repoPath,
      currentBranch,
      capturedAt: new Date().toISOString(),
    });

    console.log(`Saved report to: ${outputPath}`);
    console.log(`Wrote run metadata to: ${metadataPath}`);
    return;
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    fail("Missing dependency 'playwright'. Install with: npm install --save-dev playwright");
  }

  const browserProfileDir = asAbsolute(root, cfg(config, "BROWSER_PROFILE_DIR", ".automation/browser-profile"));
  await fs.mkdir(browserProfileDir, { recursive: true });

  const headlessArg = String(args.headless || "false").toLowerCase();
  const headless = ["1", "true", "yes", "y", "on"].includes(headlessArg);

  const context = await playwright.chromium.launchPersistentContext(browserProfileDir, {
    channel: "chrome",
    headless,
  });

  try {
    let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    const chatUrl = cfg(config, "CHATGPT_URL", "https://chatgpt.com");
    await page.goto(chatUrl, { waitUntil: "domcontentloaded" });
    await sleep(cfgInt(config, "WAIT_AFTER_PAGE_LOAD_MS", 2000));
    await askForManualLoginCheckpoint(config, page);
    page = selectChatPage(context, chatUrl, page);

    // Step 1: prompt field + model not Auto.
    const promptSelector = cfg(config, "PROMPT_SELECTOR", "#prompt-textarea");
    await requireVisible(page.locator(promptSelector), "Prompt input");

    const modelButtonSelector = cfg(config, "MODEL_BUTTON_SELECTOR", 'button[data-testid="model-switcher-dropdown-button"]');
    const modelButton = await requireVisible(page.locator(modelButtonSelector), "Model selector button");
    const autoText = cfg(config, "MODEL_BUTTON_TEXT_MUST_NOT_CONTAIN", cfg(config, "MODEL_AUTO_TEXT", "Auto"));
    let modelText = normalizeWhitespace(await modelButton.innerText());

    if (autoText && modelText.includes(autoText)) {
      await clickAndWait(page.locator(modelButtonSelector), "Model selector button", timings);
      await sleep(cfgInt(config, "WAIT_AFTER_MODEL_MENU_OPEN_MS", 800));

      const preferredModelText = cfg(config, "MODEL_PREFERRED_TEXT", "GPT-5");
      const modelFallbackRule = cfg(config, "MODEL_FALLBACK_RULE", "none").toLowerCase();
      let modelItem = page.locator('[role="menuitemradio"]').filter({ hasText: preferredModelText });

      if ((await modelItem.count()) < 1) {
        if (strictMode || modelFallbackRule !== "highest-number") {
          fail(`Preferred model "${preferredModelText}" was not found.`);
        }
        modelItem = await pickHighestNumberModel(page);
        if (!modelItem) {
          fail("Could not find any numeric model option in the model menu.");
        }
      } else {
        modelItem = modelItem.first();
      }

      await modelItem.click();
      await sleep(cfgInt(config, "WAIT_AFTER_MODEL_SELECT_MS", 1200));
      await sleep(randomDelay(timings.clickDelayMs, timings.clickDelayJitterMs));
      modelText = normalizeWhitespace(await modelButton.innerText());
    }

    if (cfgBool(config, "REQUIRE_NON_AUTO_MODEL", true) && autoText && modelText.includes(autoText)) {
      fail(`Model selector still shows "${autoText}".`);
    }

    // Step 2: enable Deep research and Web search.
    const expectBefore = cfgBool(config, "EXPECT_APPS_AND_SITES_BEFORE", false);
    await assertAppsAndSitesState(page, config, expectBefore);

    const plusSelector = cfg(config, "PLUS_BUTTON_SELECTOR", "#composer-plus-btn");
    await clickAndWait(page.locator(plusSelector), "Composer plus button", timings);
    await sleep(cfgInt(config, "WAIT_AFTER_PLUS_CLICK_MS", 800));

    const deepText = cfg(config, "DEEP_RESEARCH_MENU_TEXT", "Deep research");
    const deepItem = page.locator('[role="menuitemradio"]').filter({ hasText: deepText });
    await clickAndWait(deepItem, "Deep research menu item", timings);
    await sleep(cfgInt(config, "WAIT_AFTER_DEEP_RESEARCH_CLICK_MS", 1200));

    await clickAndWait(page.locator(plusSelector), "Composer plus button", timings);
    await sleep(cfgInt(config, "WAIT_AFTER_PLUS_CLICK_MS", 800));

    const webText = cfg(config, "WEB_SEARCH_MENU_TEXT", "Web search");
    const webItem = page.locator('[role="menuitemradio"]').filter({ hasText: webText });
    await clickAndWait(webItem, "Web search menu item", timings);
    await sleep(cfgInt(config, "WAIT_AFTER_WEB_SEARCH_CLICK_MS", 1200));

    const expectAfter = cfgBool(config, "EXPECT_APPS_AND_SITES_AFTER", true);
    await assertAppsAndSitesState(page, config, expectAfter);

    // Step 3: Apps -> GitHub repository.
    if (useGitHubRepo) {
      const appsButtonText = cfg(config, "APPS_BUTTON_TEXT", "Apps");
      const appsButton = page.getByRole("button", { name: new RegExp(`^${escapeRegex(appsButtonText)}$`, "i") });
      await clickAndWait(appsButton, "Apps button", timings, { longStep: true });
      await sleep(cfgInt(config, "WAIT_AFTER_APPS_CLICK_MS", 800));

      const providerRole = cfg(config, "APPS_PROVIDER_ROW_ROLE", "menuitemcheckbox");
      const providerText = cfg(config, "APPS_PROVIDER_TEXT", "GitHub");
      const providerRow = page.locator(`[role="${providerRole}"]`).filter({ hasText: providerText });
      const provider = await requireVisible(providerRow, "GitHub provider row");

      const wantOn = cfg(config, "GITHUB_SWITCH_STATE", "on").toLowerCase() === "on";
      const checkedNow = (await provider.getAttribute("aria-checked")) === "true";
      if (wantOn && !checkedNow) {
        await provider.click();
        await sleep(cfgInt(config, "WAIT_AFTER_GITHUB_SWITCH_MS", 1200));
        await sleep(timings.longDelayMs);
      }

      if (wantOn) {
        const checkedAfter = (await provider.getAttribute("aria-checked")) === "true";
        if (!checkedAfter) {
          fail("GitHub app switch is still off after clicking.");
        }
      }

      const repoMenuText = cfg(config, "REPOSITORY_MENU_TEXT", "Repositories");
      const repoMenu = page.locator('[role="menuitem"]').filter({ hasText: repoMenuText });
      await clickAndWait(repoMenu, "Repositories menu item", timings, { longStep: true });
      await sleep(cfgInt(config, "WAIT_AFTER_REPOSITORY_SEARCH_MS", 800));

      const placeholder = cfg(config, "REPOSITORY_SEARCH_PLACEHOLDER", "Search repositories...");
      const repoSearch = await requireVisible(page.getByPlaceholder(placeholder), "Repository search input");
      const repoQuery = cfg(config, "REPOSITORY_QUERY", "");
      if (!repoQuery) {
        fail("REPOSITORY_QUERY is empty.");
      }
      await repoSearch.fill(repoQuery);
      await sleep(timings.longDelayMs);

      const repoTarget = resolveRepositoryTarget(config, args["repo-name"]);
      const repoRole = cfg(config, "REPOSITORY_SEARCH_ROLE", "menuitem");
      const repoItem = await findRepositoryMenuItem(page, repoRole, repoTarget);
      if (!repoItem) {
        fail("No repository option matched the configured target.");
      }
      await repoItem.click();
      await sleep(cfgInt(config, "WAIT_AFTER_REPOSITORY_SELECT_MS", 1200));
      await sleep(timings.longDelayMs);
    }

    // Step 4: paste prompt and submit.
    const promptTextareaSelector = cfg(config, "PROMPT_TEXTAREA_SELECTOR", "#prompt-textarea");
    const promptTextarea = await requireVisible(page.locator(promptTextareaSelector), "Prompt textarea");
    await promptTextarea.click();
    await promptTextarea.fill(promptText);
    await sleep(cfgInt(config, "WAIT_AFTER_PROMPT_PASTE_MS", 500));

    if (cfgBool(config, "SUBMIT_AFTER_PASTE", true) || cfgBool(config, "SUBMIT_WITH_ENTER", true)) {
      await page.keyboard.press(cfg(config, "SUBMIT_KEY", "Enter"));
      await sleep(cfgInt(config, "WAIT_AFTER_SUBMIT_MS", 800));
    }

    // Step 5: wait and capture output.
    if (cfgBool(config, "WAIT_FOR_REPORT_MODE", true)) {
      await waitForReport(page, config);
    }

    const outputMode = cfg(config, "REPORT_MODE_DOWNLOAD_MODE", "prefer-copy-then-download").toLowerCase();
    let reportText = null;
    if (outputMode === "prefer-copy-then-download") {
      reportText = await tryCopyReport(page, config, timings);
      if (!reportText) {
        const downloadPath = await tryDownloadReport(page, config, timings, outputDir);
        if (downloadPath) {
          reportText = await readDownloadedText(downloadPath);
        }
      }
    } else if (outputMode === "copy-only") {
      reportText = await tryCopyReport(page, config, timings);
    } else if (outputMode === "download-only") {
      const downloadPath = await tryDownloadReport(page, config, timings, outputDir);
      if (downloadPath) {
        reportText = await readDownloadedText(downloadPath);
      }
    } else {
      fail(`Unsupported REPORT_MODE_DOWNLOAD_MODE: ${outputMode}`);
    }

    if (!reportText || !reportText.trim()) {
      fail("Report capture did not return markdown text. Use Copy contents or adjust report export.");
    }

    await fs.writeFile(outputPath, reportText, "utf8");
    const metadataPath = await writeRunMetadata(root, iteration, {
      success: true,
      runtime: runtimeMode,
      iteration,
      promptPath,
      outputPath,
      repoPath,
      currentBranch,
      capturedAt: new Date().toISOString(),
    });

    console.log(`Saved report to: ${outputPath}`);
    console.log(`Wrote run metadata to: ${metadataPath}`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(`[browser-automation] ${error.message}`);
  process.exitCode = 1;
});
