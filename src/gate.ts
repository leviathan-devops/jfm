// gate.ts — the PR-aware completion gate: the job's fence (fence2) AND the AO
// review verdict, on the SAME head sha. Reuses jarvis-upper's two-source law.
//
// DYNAMIC-IMPORT EXCEPTION: jarvis-upper is a sibling checkout, not a package
// in this repo. A static import throws at load (measured: Cannot find module
// '../../jarvis-upper/src/verdict' from src/gate.ts) and unloads every verb.
// Importing it only after the file is known to exist fail-closes the gate
// instead of taking the CLI down.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface GateResult {
  verdict: "VERIFIED" | "UNVERIFIED";
  reasons: string[];
}

const VERDICT_PATH = fileURLToPath(new URL("../../jarvis-upper/src/verdict.ts", import.meta.url));

type VerifyFn = (opts: { jobDir: string; headSha: string; sessionId: string }) => Promise<GateResult>;

async function loadVerify(): Promise<VerifyFn | null> {
  if (!existsSync(VERDICT_PATH)) return null;
  const imported = (await import(VERDICT_PATH)) as { verify?: VerifyFn };
  if (typeof imported.verify !== "function") return null;
  return imported.verify;
}

export async function gateDesk(opts: { jobDir: string; headSha: string; sessionId: string }): Promise<GateResult> {
  const verify = await loadVerify();
  if (!verify) return { verdict: "UNVERIFIED", reasons: ["UPPER-VERDICT-MISSING"] };
  return verify(opts);
}
