// pin.ts — resolve + assert the worker pin (JFM blueprint L4: the pin rides the
// dispatch, never a desk-local .omp/config.yml — EN-019 proved that invisible).
import { readFileSync } from "node:fs";
import { aoDaemon } from "./ao-transport";
import { assertFetchAllowed } from "./port-guard";

export interface PinState {
  ok: boolean;
  projectEnv: Record<string, string>;
  overlayRoles: Record<string, string> | null;
  problems: string[];
}

// The upper-tier overlay, resolved from THIS module's location so a move of the
// factory tree cannot break it (the hardcoded path did, on 2026-09-22).
const UPPER_ROOT = new URL("../../jarvis-upper", import.meta.url).pathname.replace(/\/$/, "");
const OVERLAY = `${UPPER_ROOT}/.omp/config.yml`;
const REQUIRED_ENV = ["OMP_PROFILE"];

export async function readProjectEnv(projectId: string): Promise<Record<string, string>> {
  const url = `${aoDaemon()}/api/v1/projects/${projectId}`;
  assertFetchAllowed(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`project ${projectId}: HTTP ${res.status}`);
  const d = (await res.json()) as { project: { config?: { env?: Record<string, string> } } };
  return d.project.config?.env ?? {};
}

export function readOverlayRoles(path = OVERLAY): Record<string, string> | null {
  try {
    const raw = readFileSync(path, "utf8");
    const out: Record<string, string> = {};
    const block = raw.split("modelRoles:")[1]?.split("\n") ?? [];
    for (const line of block) {
      const m = line.match(/^\s{2}([a-z]+):\s*(\S+)/);
      if (!m) { if (Object.keys(out).length > 0 && line.trim() && !line.startsWith("  ")) break; continue; }
      out[m[1]] = m[2];
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch { return null; }
}

export async function assertPin(projectId: string, overlayPath?: string): Promise<PinState> {
  const problems: string[] = [];
  let projectEnv: Record<string, string> = {};
  try {
    projectEnv = await readProjectEnv(projectId);
    for (const k of REQUIRED_ENV) if (!projectEnv[k]) problems.push(`ENV-MISSING:${k}`);
  } catch (e) { problems.push(`PROJECT-UNREADABLE:${String(e).slice(0, 60)}`); }
  const overlayRoles = readOverlayRoles(overlayPath ?? OVERLAY);
  if (!overlayRoles) problems.push("OVERLAY-MISSING:modelRoles");
  else {
    for (const role of ["default", "task"]) {
      if (!overlayRoles[role]) problems.push(`ROLE-MISSING:${role}`);
    }
  }
  return { ok: problems.length === 0, projectEnv, overlayRoles, problems };
}
