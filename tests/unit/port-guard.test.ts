// Port guard: 8090 and 18090 are refused before any socket.
// Mocks listen on port 0. fetch is replaced in-process so a red run
// cannot open those ports either.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { health, withDaemon } from "../../src/ao-transport";
import { assertFetchAllowed, FORBIDDEN_PORTS } from "../../src/port-guard";

const SRC = new URL("../../src/", import.meta.url).pathname;

describe.serial("port guard", () => {
  test("a forbidden daemon URL is refused and fetch is not called", async () => {
    const prev = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    }) as unknown as typeof fetch;
    try {
      for (const port of FORBIDDEN_PORTS) {
        await expect(withDaemon(`http://127.0.0.1:${port}`, () => health())).rejects.toThrow(
          `PORT-FORBIDDEN:${port}`,
        );
      }
      await expect(withDaemon("http://[::1]:8090", () => health())).rejects.toThrow("PORT-FORBIDDEN:8090");
      await expect(withDaemon("http://localhost:18090/healthz", () => health())).rejects.toThrow(
        "PORT-FORBIDDEN:18090",
      );
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = prev;
    }
  });

  test("assertFetchAllowed names the port and allows the AO default", () => {
    expect(() => assertFetchAllowed("http://127.0.0.1:8090/health")).toThrow("PORT-FORBIDDEN:8090");
    expect(() => assertFetchAllowed("http://127.0.0.1:08090/health")).toThrow("PORT-FORBIDDEN:8090");
    expect(() => assertFetchAllowed("http://127.0.0.1:18090/")).toThrow("PORT-FORBIDDEN:18090");
    expect(() => assertFetchAllowed("http://127.0.0.1:3001/healthz")).not.toThrow();
    expect(() => assertFetchAllowed("http://127.0.0.1/healthz")).not.toThrow();
  });

  test("a mock bound with port 0 answers health and is not a forbidden port", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response("ok", { status: 200 });
      },
    });
    try {
      expect(server.port).toBeGreaterThan(0);
      expect(FORBIDDEN_PORTS as readonly number[]).not.toContain(server.port);
      const status = await withDaemon(`http://127.0.0.1:${server.port}`, () => health());
      expect(status).toBe(200);
    } finally {
      await server.stop(true);
    }
  });

  test("src hardcodes a forbidden port only inside the guard", () => {
    const offenders: string[] = [];
    for (const name of readdirSync(SRC)) {
      if (!name.endsWith(".ts") || name === "port-guard.ts") continue;
      const text = readFileSync(join(SRC, name), "utf8");
      if (/\b8090\b/.test(text) || /\b18090\b/.test(text)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
