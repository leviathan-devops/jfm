import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VERBS } from "../../src/cli";
import { watchDeskAo } from "../../src/watch-ao";
import { withDaemon } from "../../src/ao-transport";

const ROOT = new URL("../..", import.meta.url).pathname;

function serve(handler: (req: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  if (server.port === 8090 || server.port === 18090) {
    void server.stop(true);
    throw new Error("OS assigned a forbidden port");
  }
  return server;
}

describe.serial("verbs against a port-0 mock", () => {
  test("dispatch refuses an unreadable job before fetch", async () => {
    const prev = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    }) as unknown as typeof fetch;
    try {
      const missing = join(tmpdir(), `jfm-missing-job-${crypto.randomUUID()}.md`);
      const refused = await VERBS.dispatch(ROOT, ["--project", "p", "--desk", "d", "--job", missing]);
      expect(refused.code).toBe(2);
      expect(String(refused.out.refused)).toContain("JOB-UNREADABLE");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = prev;
    }
  });

  test("a merge without --confirm is refused before fetch", async () => {
    const prev = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    }) as unknown as typeof fetch;
    try {
      const refused = await VERBS.pr(ROOT, ["--session", "s1", "--merge", "1"]);
      expect(refused.code).toBe(2);
      expect(String(refused.out.refused)).toContain("MERGE-REQUIRES-CONFIRM");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = prev;
    }
  });

  test("health, a bad harness, and a dead session stay on the mock", async () => {
    const scope = mkdtempSync(join(tmpdir(), "jfm-scope-"));
    const job = join(scope, "job.md");
    writeFileSync(job, "# probe\n");
    const server = serve(async (req) => {
      const url = new URL(req.url);
      if (url.pathname === "/healthz") return new Response("ok", { status: 200 });
      if (req.method === "POST" && url.pathname === "/api/v1/sessions") {
        const body = (await req.json()) as { harness?: string };
        if (body.harness === "NOT_A_HARNESS") {
          return Response.json({ code: "UNKNOWN_HARNESS" }, { status: 400 });
        }
        return Response.json({ session: { id: "sess-1", projectId: "p" } }, { status: 201 });
      }
      if (url.pathname === "/api/v1/sessions/dead") {
        return Response.json({ code: "NOT_FOUND" }, { status: 404 });
      }
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const health = await withDaemon(base, () => VERBS.health(ROOT, []));
      expect(health.code).toBe(0);
      expect(health.out.http).toBe(200);
      expect(String(health.out.ao)).toBe(base);

      const bad = await withDaemon(base, () =>
        VERBS.dispatch(ROOT, ["--project", "p", "--desk", "d", "--job", job, "--harness", "NOT_A_HARNESS", "--scope", scope]),
      );
      expect(bad.code).toBe(1);
      expect(String(bad.out.error)).toContain("AO_HARNESS_UNKNOWN");

      const dead = await withDaemon(base, () =>
        VERBS.watch(ROOT, ["--session", "dead", "--project", "p", "--desk", "d"]),
      );
      expect(dead.code).toBe(1);
      expect(dead.out.verdict).toBe("FAILED");
      expect(JSON.stringify(dead.out.reasons)).toContain("SESSION-MISSING");
    } finally {
      await server.stop(true);
    }
  });

  test("health refuses a forbidden port with JSON, and fetch is not called", async () => {
    const prev = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    }) as unknown as typeof fetch;
    try {
      const refused = await withDaemon("http://127.0.0.1:18090", () => VERBS.health(ROOT, []));
      expect(refused.code).toBe(2);
      expect(String(refused.out.refused)).toBe("PORT-FORBIDDEN:18090");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = prev;
    }
  });

  test("watch reports WORK-ON-DISK from a private worktree", async () => {
    const home = mkdtempSync(join(tmpdir(), "jfm-home-"));
    const project = "proj";
    const session = "sess";
    const wt = join(home, ".ao", "data", "worktrees", project, session);
    mkdirSync(wt, { recursive: true });
    const git = (args: string[]) => {
      const proc = Bun.spawnSync(["git", "-C", wt, ...args], {
        env: { ...process.env, GIT_AUTHOR_NAME: "jfm-test", GIT_AUTHOR_EMAIL: "jfm-test@example.com", GIT_COMMITTER_NAME: "jfm-test", GIT_COMMITTER_EMAIL: "jfm-test@example.com" },
      });
      if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
    };
    git(["init"]);
    git(["config", "user.email", "jfm-test@example.com"]);
    git(["config", "user.name", "jfm-test"]);
    writeFileSync(join(wt, "f.txt"), "a\n");
    git(["add", "f.txt"]);
    git(["commit", "-m", "a"]);
    writeFileSync(join(wt, "f.txt"), "b\n");
    git(["add", "f.txt"]);
    git(["commit", "-m", "b"]);

    const server = serve((req) => {
      const url = new URL(req.url);
      if (url.pathname === `/api/v1/sessions/${session}`) {
        return Response.json({ session: { id: session, activity: { state: "active" }, isTerminated: false } });
      }
      if (url.pathname === `/api/v1/sessions/${session}/pr`) return Response.json({ prs: [] });
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    });
    try {
      const watched = await withDaemon(`http://127.0.0.1:${server.port}`, () =>
        watchDeskAo("desk", session, project, home),
      );
      expect(watched.verdict).toBe("WORKING");
      expect(watched.reasons).toContain("WORK-ON-DISK");
      expect(watched.signals.commits).toBeGreaterThan(1);
    } finally {
      await server.stop(true);
    }
  });
});
