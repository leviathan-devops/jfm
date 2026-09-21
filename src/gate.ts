// gate.ts — the PR-aware completion gate: the job's fence (fence2) AND the AO
// review verdict, on the SAME head sha. Reuses jarvis-upper's two-source law.
import { verify, type VerifyResult } from "../../jarvis-upper/src/verdict";

export async function gateDesk(opts: { jobDir: string; headSha: string; sessionId: string }): Promise<VerifyResult> {
  return verify(opts);
}
