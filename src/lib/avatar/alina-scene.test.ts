// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

it("retries a temporary job-read 503 without submitting or paying for a new speech job", async () => {
  const source = readFileSync(path.join(process.cwd(), "public/video/aida/presenter-v2/SCEN/studio.js"), "utf8");
  const parsed = ts.createSourceFile("studio.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  // Execute the shipped request and queue functions, with only scene/media effects stubbed.
  const functions = ["api", "queueSpeech"].map(name => {
    const node = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    if (!node) throw Error(`Missing scene function: ${name}`);
    return node.getText(parsed);
  }).join("\n");
  const job = "a".repeat(32);
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({id: job, status: "pending", text: "Hej!"}))
    .mockResolvedValueOnce(Response.json({error: "Tillfälligt avbrott"}, {status: 503}))
    .mockResolvedValueOnce(Response.json({status: "ready", timings: {method: "visemes"}}));
  const readySpeech: Array<{url: string; text: string}> = [];
  const sleep = vi.fn().mockResolvedValue(undefined);
  const speakReady = vi.fn();
  const queueSpeech = runInNewContext(functions + "\nqueueSpeech;", {
    fetch, config: {enabled: true, method: "visemes"}, connected: true,
    epoch: 0, answerPending: true, speechInFlight: null, readySpeech,
    speechParts: (text: string) => [text], phase: "A-IDLE", editing: false,
    el: () => ({textContent: ""}), sleep, speakReady,
  }) as (body: {kind: string; text: string}) => Promise<boolean>;

  expect(await queueSpeech({kind: "reply", text: "Hej!"})).toBe(true);
  expect(fetch.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
    ["/api/alina/speech", "POST"],
    ["/api/alina/jobs/" + job + "?wait=1", "GET"],
    ["/api/alina/jobs/" + job + "?wait=1", "GET"],
  ]);
  expect(sleep).toHaveBeenCalledWith(500);
  expect(readySpeech).toMatchObject([{url: "/api/alina/media/" + job, text: "Hej!"}]);
  expect(speakReady).toHaveBeenCalledTimes(1);
});
