import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPin, readOverlayRoles } from "../../src/pin";
import { withDaemon } from "../../src/ao-transport";

test("overlay roles parse from a private fixture", () => {
  const dir = mkdtempSync(join(tmpdir(), "jfm-overlay-"));
  const path = join(dir, "config.yml");
  writeFileSync(path, "modelRoles:\n  default: poolside/laguna-s-2.1:high\n  task: poolside/laguna-s-2.1:high\n");
  const roles = readOverlayRoles(path);
  expect(roles).not.toBeNull();
  expect(roles?.default).toContain("laguna");
  expect(roles?.task).toContain("laguna");
});

test("assertPin names a missing profile and a forbidden port never fetches", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jfm-pin-"));
  const overlay = join(dir, "config.yml");
  writeFileSync(overlay, "modelRoles:\n  default: poolside/laguna-s-2.1:high\n  task: poolside/laguna-s-2.1:high\n");
  const prev = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("no", { status: 500 });
  }) as unknown as typeof fetch;
  try {
    const refused = await withDaemon("http://127.0.0.1:8090", () => assertPin("p1", overlay));
    expect(refused.ok).toBe(false);
    expect(refused.problems.some((p) => p.includes("PORT-FORBIDDEN:8090"))).toBe(true);
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = prev;
  }
});
