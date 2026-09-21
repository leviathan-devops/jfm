// desk.ts — the desk↔session mapping + the tracker row (JFM blueprint §7).
// ONE tracker: JAM's desks table + the 5 AO columns (JL-2: no second store).
import { Database } from "bun:sqlite";
import { join } from "node:path";
// JAM's deskRoot is the only exported piece of its tracker (trackerDb is module-local),
// so JFM opens THE SAME store at THE SAME path with THE SAME schema (JL-2: one tracker).
export function deskRoot(scopeRoot: string): string { return join(scopeRoot, ".omp-waves"); }
export const STATE_DIR = ".omp-waves";

const DESK_SCHEMA = `CREATE TABLE IF NOT EXISTS desks (
  desk TEXT PRIMARY KEY, wave TEXT NOT NULL, pane_id TEXT NOT NULL,
  workspace TEXT NOT NULL, state TEXT NOT NULL, steers INTEGER NOT NULL DEFAULT 0,
  yield_preview TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL,
  completed_at INTEGER, paused_at INTEGER, go_key_idx INTEGER,
  foreman_pid INTEGER, omp_pid INTEGER)`;

function rawTracker(scopeRoot: string): Database {
  const dir = deskRoot(scopeRoot);
  require("node:fs").mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, "tracker.sqlite"), { create: true });
  db.exec("PRAGMA journal_mode=WAL;");
  db.run(DESK_SCHEMA);
  return db;
}

export interface DeskRow {
  desk: string; wave: string; session_id: string; project: string;
  state: string; started_at: number; completed_at: number | null;
  ao_project: string | null; ao_branch: string | null; ao_pr_url: string | null;
  ao_job: string | null; ao_head: string | null;
}

const AO_COLUMNS: [string, string][] = [
  ["ao_project", "TEXT"], ["ao_branch", "TEXT"], ["ao_pr_url", "TEXT"],
  ["ao_job", "TEXT"], ["ao_head", "TEXT"],
];

/** open the JAM tracker and ensure the AO columns exist (idempotent migration). */
export function aoTracker(scopeRoot: string): Database {
  const db = rawTracker(scopeRoot);
  const have = new Set((db.query("PRAGMA table_info(desks)").all() as { name: string }[]).map((r) => r.name));
  for (const [name, type] of AO_COLUMNS) {
    if (!have.has(name)) db.run(`ALTER TABLE desks ADD COLUMN ${name} ${type}`);
  }
  return db;
}

export function insertDeskRow(scopeRoot: string, row: { desk: string; wave: string; sessionId: string; project: string; job?: string; head?: string; branch?: string }): void {
  const db = aoTracker(scopeRoot);
  db.run(
    `INSERT INTO desks (desk, wave, pane_id, workspace, state, steers, started_at, ao_project, ao_branch, ao_job, ao_head)
     VALUES (?, ?, ?, ?, 'running', 0, ?, ?, ?, ?, ?)
     ON CONFLICT(desk) DO UPDATE SET pane_id=excluded.pane_id, state='running', ao_head=excluded.ao_head`,
    [row.desk, row.wave, row.sessionId, row.job ?? "", Date.now(), row.project, row.branch ?? null, row.job ?? null, row.head ?? null],
  );
  db.close();
}

export function setDeskState(scopeRoot: string, desk: string, state: string, patch: Partial<DeskRow> = {}): void {
  const db = aoTracker(scopeRoot);
  const sets = ["state = ?"]; const vals: (string | number | null)[] = [state];
  for (const [k, v] of Object.entries(patch)) { sets.push(`${k} = ?`); vals.push(v as string | number | null); }
  if (state !== "running") { sets.push("completed_at = ?"); vals.push(Date.now()); }
  db.run(`UPDATE desks SET ${sets.join(", ")} WHERE desk = ?`, [...vals, desk]);
  db.close();
}

export function listDesks(scopeRoot: string, wave?: string): DeskRow[] {
  const db = aoTracker(scopeRoot);
  const q = wave
    ? "SELECT desk, wave, pane_id AS session_id, ao_project AS project, state, started_at, completed_at, ao_project, ao_branch, ao_pr_url, ao_job, ao_head FROM desks WHERE wave = ? ORDER BY started_at"
    : "SELECT desk, wave, pane_id AS session_id, ao_project AS project, state, started_at, completed_at, ao_project, ao_branch, ao_pr_url, ao_job, ao_head FROM desks ORDER BY started_at DESC LIMIT 50";
  const rows = (wave ? db.query(q).all(wave) : db.query(q).all()) as DeskRow[];
  db.close();
  return rows;
}

export function scopeRootFor(projectPath: string): string { return projectPath; }
