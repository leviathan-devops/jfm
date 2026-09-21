// ao-transport.ts — THE SEAM. The 10 JAM desk verbs implemented against the AO
// substrate (REST + SSE) + the AO natives JAM never had (pr list/claim/merge).
// NOTHING ABOVE THIS FILE MAY KNOW AO EXISTS (JFM blueprint L1).
export const AO_DAEMON = process.env.AO_DAEMON ?? "http://localhost:3001";
export const AO_ERR = {
  SPAWN_FAILED: "AO_SPAWN_FAILED",
  SESSION_MISSING: "AO_SESSION_MISSING",
  HARNESS_UNKNOWN: "AO_HARNESS_UNKNOWN",
  MERGE_UNCONFIRMED: "AO_MERGE_UNCONFIRMED",
} as const;

export interface AoPane {
  pane_id: string;      // the AO session id IS the address
  paneKey: string;      // the turn-edge analogue: the session id
  session: string;      // the AO project id
  name: string;         // the desk id
  cwd: string;          // the worktree path
}

export interface SpawnTileOpts {
  session: string;      // the AO projectId
  name: string;         // the desk id (becomes displayName / the branch label)
  cwd?: string;         // unused for AO (AO creates the worktree); kept for the seam
  cmd?: string;         // unused for AO; the prompt IS the command
  env?: Record<string, string>;
  worktree?: string;    // unused for AO
  prompt?: string;
  harness?: string;
  mode?: "chat" | "tui";
}

export interface AoPr {
  number: number; url: string; state: string; headSha: string;
  sourceBranch?: string | null; targetBranch?: string | null; repo?: string;
}

async function api<T>(path: string, method = "GET", body?: unknown, timeoutMs = 20000): Promise<T> {
  const res = await fetch(`${AO_DAEMON}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* raw */ }
  if (!res.ok) {
    const code = (parsed as { code?: string } | null)?.code ?? String(res.status);
    throw new Error(`${code}`);
  }
  return parsed as T;
}

// ── the 10 JAM desk verbs ───────────────────────────────────────────────────
export async function spawnTile(opts: SpawnTileOpts): Promise<AoPane> {
  const body = {
    projectId: opts.session,
    displayName: opts.name,
    harness: opts.harness ?? "omp",
    mode: opts.mode ?? "tui",
    prompt: opts.prompt ?? "",
  };
  try {
    const r = await api<{ session: { id: string; projectId: string } }>("/api/v1/sessions", "POST", body);
    return {
      pane_id: r.session.id, paneKey: r.session.id, session: r.session.projectId,
      name: opts.name, cwd: opts.cwd ?? "",
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    throw new Error(`${msg.startsWith("UNKNOWN") ? AO_ERR.HARNESS_UNKNOWN : AO_ERR.SPAWN_FAILED}: ${msg}`);
  }
}
export async function promptPane(paneId: string, text: string): Promise<void> {
  await api(`/api/v1/sessions/${paneId}/send`, "POST", { message: text });
}
export async function submitPaneText(paneId: string, text: string, _opts?: unknown): Promise<void> {
  await api(`/api/v1/sessions/${paneId}/conversation/steer-or-send`, "POST", { message: text });
}
export async function readPane(paneId: string, tail = 4000): Promise<string> {
  try {
    const c = await api<{ turns?: { messages?: { role?: string; content?: string }[] }[] }>(
      `/api/v1/sessions/${paneId}/conversation`);
    const flat = (c.turns ?? []).flatMap((t) => (t.messages ?? []).map((m) => `[${m.role ?? "?"}] ${m.content ?? ""}`));
    return flat.join("\n").slice(-tail);
  } catch { return ""; }
}
export async function killPane(paneId: string): Promise<void> {
  await api(`/api/v1/sessions/${paneId}/kill`, "POST", {});
}
export async function listPanes(projectId?: string): Promise<AoPane[]> {
  const r = await api<{ sessions: { id: string; projectId: string; displayName?: string }[] }>("/api/v1/sessions");
  return (r.sessions ?? [])
    .filter((s) => (projectId ? s.projectId === projectId : true))
    .map((s) => ({ pane_id: s.id, paneKey: s.id, session: s.projectId, name: s.displayName ?? s.id, cwd: "" }));
}
// AO has no tabs — the session IS the card. These are honest no-ops.
export async function createDeskTab(o: SpawnTileOpts): Promise<AoPane> { return spawnTile(o); }
export async function listTabs(): Promise<AoPane[]> { return listPanes(); }
export async function closeDeskTab(paneId: string): Promise<void> { return killPane(paneId); }
export function copilotKey(desk: string, sessionId?: string): string {
  const url = sessionId ? `${AO_DAEMON}/sessions/${sessionId}` : `${AO_DAEMON}`;
  return `jfm attach --desk ${desk}${sessionId ? ` --session ${sessionId}` : ""}   # kanban: ${url}`;
}

// ── the AO natives (JAM never had them) ────────────────────────────────────
export async function prList(sessionId: string): Promise<AoPr[]> {
  const r = await api<{ prs: AoPr[] }>(`/api/v1/sessions/${sessionId}/pr`);
  return r.prs ?? [];
}
export async function prClaim(sessionId: string, number: number): Promise<void> {
  await api(`/api/v1/sessions/${sessionId}/pr/claim`, "POST", { number });
}
export async function prMerge(prId: string | number, confirm: boolean): Promise<unknown> {
  if (!confirm) throw new Error(`${AO_ERR.MERGE_UNCONFIRMED}: merge requires --confirm (the operator owns it)`);
  return api(`/api/v1/prs/${prId}/merge`, "POST", {});
}
export async function sessionRow(sessionId: string): Promise<{ id: string; kind?: string; harness?: string; mode?: string; activity?: { state?: string }; isTerminated?: boolean }> {
  const r = await api<{ session: { id: string } }>(`/api/v1/sessions/${sessionId}`);
  return r.session;
}
export async function sessionDiff(sessionId: string): Promise<string> {
  try { const r = await api<{ diff?: string }>(`/api/v1/sessions/${sessionId}/workspace/diffs`, "POST", {}); return r.diff ?? ""; }
  catch { return ""; }
}
export async function health(): Promise<number> {
  try { const res = await fetch(`${AO_DAEMON}/healthz`, { signal: AbortSignal.timeout(4000) }); return res.status; }
  catch { return 0; }
}
export const aoTransport = {
  spawnTile, promptPane, submitPaneText, readPane, killPane, listPanes,
  createDeskTab, listTabs, closeDeskTab, copilotKey,
};
