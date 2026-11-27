// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MIGRATION_ORDER } from "./migration-order.mjs";

const name = "add-video-generation-jobs.sql";
const sql = readFileSync(new URL("../../src/lib/db/migrations/" + name, import.meta.url), "utf8");

it("adds durable paid video orders after the existing core tables and enforces scoped UUID replay", () => {
  expect(MIGRATION_ORDER).toContain(name);
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS video_generation_jobs");
  expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS video_generation_jobs_user_request_unique\s+ON video_generation_jobs\(user_id, request_id\)/);
  expect(sql).toContain("CHECK (credits > 0)");
  expect(sql).toContain("REFERENCES media_library(id) ON DELETE SET NULL");
});

it("keeps video order inputs and provider references out of the public Data API", () => {
  expect(sql).toContain("ALTER TABLE video_generation_jobs ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("REVOKE ALL ON TABLE video_generation_jobs FROM PUBLIC");
  expect(sql).toContain("REVOKE ALL ON TABLE video_generation_jobs FROM anon");
  expect(sql).toContain("REVOKE ALL ON TABLE video_generation_jobs FROM authenticated");
  expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE video_generation_jobs TO service_role");
});
