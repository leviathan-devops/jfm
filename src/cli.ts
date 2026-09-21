// cli.ts — THE JFM OPERATOR SURFACE. One JSON object per verb on stdout;
// exit 0 ok / 1 negative verdict / 2 refused. The verbs are the vocabulary.
import { aoTransport, health, listPanes, prList, prMerge, sessionRow, copilotKey, AO_DAEMON } from "./ao-transport";
import { assertPin } from "./pin";
import { watchDeskAo, listWorktrees } from "./watch-ao";
import { gateDesk } from "./gate";
import { insertDeskRow, listDesks, setDeskState } from "./desk";

export interface VerbResult { code: number; out: Record<string, unknown> }
const emit = (code: number, out: Record<string, unknown>): VerbResult => ({ code, out });

function arg(name: string, argv: string[]): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function verbHealth(_root: string, _argv: string[]): Promise<VerbResult> {
  const code = await health();
  return emit(code === 200 ? 0 : 1, { ok: code === 200, ao: AO_DAEMON, http: code });
}

export async function verbStatus(_root: string, argv: string[]): Promise<VerbResult> {
  const session = arg("session", argv);
  if (!session) return emit(2, { ok: false, refused: "NEED --session <id>" });
  try {
    const s = await sessionRow(session);
    return emit(0, { ok: true, session: s.id, kind: s.kind, harness: s.harness, mode: s.mode, activity: s.activity?.state, terminated: s.isTerminated });
  } catch (e) { return emit(1, { ok: false, error: String(e).slice(0, 120) }); }
}

export async function verbWatch(_root: string, argv: string[]): Promise<VerbResult> {
  const session = arg("session", argv); const project = arg("project", argv) ?? "";
  if (!session) return emit(2, { ok: false, refused: "NEED --session <id> [--project <p>]" });
  const r = await watchDeskAo(arg("desk", argv) ?? session, session, project);
  return emit(r.verdict === "COMPLETE" || r.verdict === "AWAITING-PR" ? 0 : r.verdict === "FAILED" ? 1 : 0, { ok: r.verdict !== "FAILED", ...r });
}

export async function verbPin(_root: string, argv: string[]): Promise<VerbResult> {
  const project = arg("project", argv);
  if (!project) return emit(2, { ok: false, refused: "NEED --project <id>" });
  const p = await assertPin(project, arg("overlay", argv));
  return emit(p.ok ? 0 : 1, { ...p });
}

export async function verbDispatch(_root: string, argv: string[]): Promise<VerbResult> {
  const project = arg("project", argv); const desk = arg("desk", argv); const job = arg("job", argv);
  if (!project || !desk || !job) return emit(2, { ok: false, refused: "NEED --project <p> --desk <d> --job <path>" });
  const spec = await Bun.file(job).text().catch(() => "");
  if (!spec.trim()) return emit(2, { ok: false, refused: `JOB-UNREADABLE:${job}` });
  try {
    const pane = await aoTransport.spawnTile({ session: project, name: desk, prompt: spec, harness: arg("harness", argv) ?? "omp", mode: "tui" });
    const scope = arg("scope", argv) ?? "/home/leviathan/JARVIS_WORKSPACE/jarvis-upper";
    const wave = arg("wave", argv) ?? "w0";
    const branch = `ao/${pane.pane_id}/root`;
    insertDeskRow(scope, { desk, wave, sessionId: pane.pane_id, project, job, branch });
    return emit(0, { ok: true, desk, wave, sessionId: pane.pane_id, project, branch,
      worktree: `${process.env.HOME}/.ao/data/worktrees/${project}/${pane.pane_id}`,
      copilotKey: copilotKey(desk, pane.pane_id) });
  } catch (e) { return emit(1, { ok: false, error: String(e).slice(0, 160) }); }
}

export async function verbSteer(_root: string, argv: string[]): Promise<VerbResult> {
  const session = arg("session", argv); const text = arg("text", argv);
  if (!session || !text) return emit(2, { ok: false, refused: "NEED --session <id> --text \"...\"" });
  try { await aoTransport.submitPaneText(session, text); return emit(0, { ok: true, session, delivered: true }); }
  catch (e) { return emit(1, { ok: false, error: String(e).slice(0, 120) }); }
}

export async function verbAbort(_root: string, argv: string[]): Promise<VerbResult> {
  const session = arg("session", argv);
  if (!session) return emit(2, { ok: false, refused: "NEED --session <id>" });
  try { await aoTransport.killPane(session); return emit(0, { ok: true, session, killed: true }); }
  catch (e) { return emit(1, { ok: false, error: String(e).slice(0, 120) }); }
}

export async function verbPr(_root: string, argv: string[]): Promise<VerbResult> {
  const session = arg("session", argv);
  if (!session) return emit(2, { ok: false, refused: "NEED --session <id> [--merge <prId> --confirm]" });
  const mergeId = arg("merge", argv);
  if (mergeId) {
    if (!argv.includes("--confirm")) return emit(2, { ok: false, refused: "MERGE-REQUIRES-CONFIRM (the operator owns the merge)" });
    const r = await prMerge(mergeId, true);
    return emit(0, { ok: true, merged: mergeId, result: r });
  }
  try { const prs = await prList(session); return emit(0, { ok: true, session, prs }); }
  catch (e) { return emit(1, { ok: false, error: String(e).slice(0, 120) }); }
}

export async function verbGate(_root: string, argv: string[]): Promise<VerbResult> {
  const job = arg("job", argv); const sha = arg("sha", argv); const session = arg("session", argv);
  if (!job || !sha || !session) return emit(2, { ok: false, refused: "NEED --job <dir> --sha <head> --session <id>" });
  const r = await gateDesk({ jobDir: job, headSha: sha, sessionId: session });
  return emit(r.verdict === "VERIFIED" ? 0 : 1, { ok: r.verdict === "VERIFIED", ...r });
}

export async function verbBoard(_root: string, argv: string[]): Promise<VerbResult> {
  const project = arg("project", argv) ?? "";
  const panes = await listPanes(project || undefined);
  const wts = project ? listWorktrees(project) : [];
  return emit(0, { ok: true, project, sessions: panes.length, panes, worktrees: wts });
}

export async function verbWave(_root: string, argv: string[]): Promise<VerbResult> {
  const wave = arg("wave", argv);
  const scope = arg("scope", argv) ?? "/home/leviathan/JARVIS_WORKSPACE/jarvis-upper";
  const rows = listDesks(scope, wave);
  if (rows.length === 0) return emit(1, { ok: false, wave: wave ?? "*", desks: [], unverdicted: [], reason: "NO-DESKS" });
  const desks: Record<string, unknown>[] = [];
  const unverdicted: string[] = [];
  for (const r of rows) {
    const entry: Record<string, unknown> = { desk: r.desk, session: r.session_id, state: r.state };
    if (r.session_id) {
      const w = await watchDeskAo(r.desk, r.session_id, r.project ?? "");
      entry.watch = w.verdict;
    }
    if (r.ao_job && r.ao_head) {
      const g = await gateDesk({ jobDir: r.ao_job, headSha: r.ao_head, sessionId: r.session_id });
      entry.gate = g.verdict;
      entry.reasons = g.reasons;
      if (g.verdict === "VERIFIED") setDeskState(scope, r.desk, "complete", { ao_head: r.ao_head });
      else unverdicted.push(r.desk);
    } else unverdicted.push(r.desk);
    desks.push(entry);
  }
  const ok = unverdicted.length === 0;
  return emit(ok ? 0 : 1, { ok, wave: wave ?? "*", desks, unverdicted });
}

export const VERBS: Record<string, (root: string, argv: string[]) => Promise<VerbResult>> = {
  health: verbHealth, status: verbStatus, watch: verbWatch, pin: verbPin,
  dispatch: verbDispatch, steer: verbSteer, abort: verbAbort, pr: verbPr,
  gate: verbGate, board: verbBoard, wave: verbWave,
};

const usage = `usage: jfm <health|status|watch|pin|dispatch|steer|abort|pr|gate|board|wave> [--flags]
  dispatch  --project <p> --desk <d> --job <spec.md> [--harness omp]
  watch     --session <id> [--project <p>] [--desk <d>]
  status    --session <id>
  steer     --session <id> --text "..."
  abort     --session <id>
  pin       --project <id> [--overlay <path>]
  gate      --job <dir> --sha <head> --session <id>
  pr        --session <id> [--merge <prId> --confirm]
  board     [--project <p>]
  wave      --wave <w> [--scope <repo>]   → the desk table + UNVERDICTED:`;

if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  const verb = argv[0];
  if (!verb || !VERBS[verb]) { console.error(usage); process.exit(2); }
  const root = new URL("..", import.meta.url).pathname;
  const r = await VERBS[verb](root, argv.slice(1));
  console.log(JSON.stringify(r.out));
  process.exit(r.code);
}
