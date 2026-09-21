// watch-ao.ts — the desk watcher on AO signals (JFM blueprint §6):
//   INST-1 the session row · INST-2 the worktree · INST-3 the transcript ·
//   INST-4 the PR row. JAM's stall rule is the FALLBACK only.
import { existsSync, readdirSync, statSync } from "node:fs";
import { sessionRow, prList, type AoPr } from "./ao-transport";

export type DeskVerdict = "WORKING" | "STALLED" | "COMPLETE" | "FAILED" | "AWAITING-PR" | "UNKNOWN";
export const STALL_MS = 60_000;

export interface WatchResult {
  desk: string;
  sessionId: string;
  verdict: DeskVerdict;
  signals: { session?: string; worktree?: string; commits?: number; prs: number; lastCommitAt?: string };
  reasons: string[];
}

function worktreePath(projectId: string, sessionId: string): string {
  return `${process.env.HOME}/.ao/data/worktrees/${projectId}/${sessionId}`;
}

export function gitLog(worktree: string, n = 5): { commits: number; lastAt?: string; lastSubject?: string } {
  if (!existsSync(worktree)) return { commits: 0 };
  try {
    const p = Bun.spawnSync(["git", "-C", worktree, "log", "--format=%cI|%s", "-n", String(n)]);
    const lines = (p.stdout?.toString() ?? "").split("\n").filter((l) => l.trim().length > 0);
    const [iso, subject] = (lines[0] ?? "").split("|");
    return { commits: lines.length, lastAt: iso, lastSubject: subject };
  } catch { return { commits: 0 }; }
}

export async function watchDeskAo(desk: string, sessionId: string, projectId: string): Promise<WatchResult> {
  const reasons: string[] = [];
  const wt = worktreePath(projectId, sessionId);
  let verdict: DeskVerdict = "UNKNOWN";
  const signals: WatchResult["signals"] = { prs: 0 };

  // INST-1: the session row (the seat). A dead/absent session is named, never guessed.
  try {
    const s = await sessionRow(sessionId);
    signals.session = (s.activity?.state ?? "unknown") + (s.isTerminated ? "/terminated" : "");
    if (s.isTerminated && s.activity?.state !== "idle") { verdict = "FAILED"; reasons.push("SESSION-TERMINATED"); }
  } catch (e) {
    reasons.push(`SESSION-MISSING:${String(e).slice(0, 60)}`);
    return { desk, sessionId, verdict: "FAILED", signals, reasons };
  }

  // INST-2/3: the worktree — the only proof work happened.
  const wtExists = existsSync(wt);
  signals.worktree = wtExists ? wt : "ABSENT";
  if (wtExists) {
    const g = gitLog(wt, 5);
    signals.commits = g.commits;
    signals.lastCommitAt = g.lastAt;
    // the worktree moves only when the worker commits; only the head commit is the base.
    const isBaseOnly = g.commits <= 1;
    if (!isBaseOnly) { verdict = "WORKING"; reasons.push("WORK-ON-DISK"); }
    if (isBaseOnly) {
      // no commit yet — the stall rule is the FALLBACK signal
      const ageMs = Date.now() - statSync(wt).mtimeMs;
      if (ageMs > STALL_MS) { verdict = "STALLED"; reasons.push(`WT-QUIET:${Math.round(ageMs / 1000)}s`); }
      else { verdict = "WORKING"; reasons.push("WT-FRESH"); }
    }
  }

  // INST-4: the PR row — the artifact.
  try {
    const prs: AoPr[] = await prList(sessionId);
    signals.prs = prs.length;
    if (prs.length > 0) {
      const open = prs.find((p) => p.state === "open" || p.state === "OPEN");
      verdict = open ? "AWAITING-PR" : verdict;
      reasons.push(`PR:${prs.map((p) => `#${p.number}:${p.state}`).join(",")}`);
    }
  } catch (e) { reasons.push(`PR-UNREADABLE:${String(e).slice(0, 50)}`); }

  return { desk, sessionId, verdict, signals, reasons };
}

export function listWorktrees(projectId: string): string[] {
  const dir = `${process.env.HOME}/.ao/data/worktrees/${projectId}`;
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir).filter((d) => statSync(`${dir}/${d}`).isDirectory()); } catch { return []; }
}
