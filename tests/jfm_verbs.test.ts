// W2 gate — `bun test -t jfm_verbs`
// JFM's operator surface against the LIVE AO substrate. Adversarial first:
// a bad harness must be REFUSED (naming the token) and a DEAD session must be
// reported as FAILED — never guessed. Substrate-down fails the test (no hatch).
import { test, expect } from "bun:test";
import { VERBS } from "../src/cli";
import { aoTransport, health } from "../src/ao-transport";

const R = new URL("..", import.meta.url).pathname;
const PROJECT = "jarvis-upper";
const LIVE = "jarvis-upper-2";
const DEAD = "jarvis-upper-does-not-exist-999";
// test isolation: unique paths per run (a persisted file made the first case flaky)
const PROBE_SPEC = `/tmp/jfm-probe-spec-${process.pid}.md`;
const MISSING_SPEC = `/tmp/jfm-missing-spec-${process.pid}.md`;

test("jfm_verbs: ADVERSARIAL — a bad harness is REFUSED with the token named", async () => {
  const r = await VERBS.dispatch(R, ["--project", PROJECT, "--desk", "jfm-bad-harness", "--job", `${MISSING_SPEC}`, "--harness", "NOT_A_HARNESS"]);
  expect(r.code).toBe(2);
  expect(String(r.out.refused)).toContain("JOB-UNREADABLE");
  // with a real spec, the harness refusal must come from AO and carry the token
  await Bun.write(PROBE_SPEC, "# probe job\nfor the harness-refusal check\n");
  const r2 = await VERBS.dispatch(R, ["--project", PROJECT, "--desk", "jfm-bad-harness", "--job", `${PROBE_SPEC}`, "--harness", "NOT_A_HARNESS"]);
  expect(r2.code).toBe(1);
  expect(String(r2.out.error)).toContain("AO_HARNESS_UNKNOWN");
});

test("jfm_verbs: ADVERSARIAL — a DEAD session reports FAILED, never guessed", async () => {
  const r = await VERBS.watch(R, ["--session", DEAD, "--project", PROJECT, "--desk", "jfm-dead"]);
  expect(r.code).toBe(1);
  expect(String(r.out.verdict)).toBe("FAILED");
  expect(String(JSON.stringify(r.out.reasons))).toContain("SESSION-MISSING");
});

test("jfm_verbs: health reads the live daemon", async () => {
  const r = await VERBS.health(R, []);
  const http = await health();
  if (http !== 200) throw new Error(`substrate down (http=${http}) — the daemon is required for this gate`);
  expect(r.code).toBe(0);
  expect(r.out.http).toBe(200);
});

test("jfm_verbs: status + board answer from live AO rows", async () => {
  const s = await VERBS.status(R, ["--session", LIVE]);
  expect(s.code).toBe(0);
  expect(s.out.harness).toBe("omp");
  expect(s.out.mode).toBe("tui");
  const b = await VERBS.board(R, ["--project", PROJECT]);
  expect(b.code).toBe(0);
  expect(Number(b.out.sessions)).toBeGreaterThanOrEqual(1);
  expect(Array.isArray(b.out.worktrees)).toBe(true);
});

test("jfm_verbs: pin asserts the project env + the overlay roles", async () => {
  const r = await VERBS.pin(R, ["--project", PROJECT]);
  expect(r.code).toBe(0);
  expect((r.out.projectEnv as Record<string, string>).OMP_PROFILE).toBe("jarvis-worker");
  const roles = r.out.overlayRoles as Record<string, string>;
  expect(roles.default).toContain("laguna");
  expect(roles.task).toContain("laguna");
});

test("jfm_verbs: pr lists the real PR #1; a merge without --confirm refuses", async () => {
  const r = await VERBS.pr(R, ["--session", LIVE]);
  expect(r.code).toBe(0);
  const prs = r.out.prs as { number: number }[];
  expect(prs.length).toBeGreaterThanOrEqual(1);
  expect(prs.map((p) => p.number)).toContain(1);
  const m = await VERBS.pr(R, ["--session", LIVE, "--merge", "1"]);
  expect(m.code).toBe(2);
  expect(String(m.out.refused)).toContain("MERGE-REQUIRES-CONFIRM");
});

test("jfm_verbs: gate returns UNVERIFIED for the real PR #1 (the two-source law in the CLI)", async () => {
  const sha = "732083e1e7890000000000000000000000000000";
  const r = await VERBS.gate(R, ["--job", "/home/leviathan/JARVIS_WORKSPACE/jarvis-upper/jobs/upper-tier-dt-shapes", "--sha", sha, "--session", LIVE]);
  expect(r.code).toBe(1);
  expect(String(r.out.verdict)).toBe("UNVERIFIED");
  const reasons = r.out.reasons as string[];
  expect(reasons.some((x) => x.startsWith("FENCE-"))).toBe(true);
  expect(reasons.some((x) => x.startsWith("REVIEW-"))).toBe(true);
});

test("jfm_verbs: the transport's listPanes is the AO session list", async () => {
  const panes = await aoTransport.listPanes(PROJECT);
  expect(panes.length).toBeGreaterThanOrEqual(1);
  expect(panes.every((p) => p.pane_id.length > 0 && p.session === PROJECT)).toBe(true);
});
