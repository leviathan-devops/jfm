# jfm interface note (jfm-e2e)

## Consumer expectations

BLOCKED. `git ls-remote` for `leviathan-devops/jfm-e2e` returned `Repository not found`, and the GitHub API returned 404. This lane did not clone, read, or edit `jfm-e2e`. Assertions that exist only in that repo are not restated here.

## What jfm publishes

Operator entry is `src/cli.ts`. One JSON object on stdout. Exit `0` is ok, `1` is a negative verdict, `2` is a refusal.

| Verb | Required flags | Refusal token |
|---|---|---|
| `health` | none | `PORT-FORBIDDEN:<port>` when the daemon URL is 8090 or 18090 |
| `dispatch` | `--project` `--desk` `--job` | `JOB-UNREADABLE` before any request, when the spec cannot be read |
| `watch` | `--session` | a session row that cannot be read is `FAILED` / `SESSION-MISSING` |
| `pin` | `--project` | `ENV-MISSING`, `OVERLAY-MISSING`, `ROLE-MISSING`, or `PROJECT-UNREADABLE` |
| `pr` | `--session` | `MERGE-REQUIRES-CONFIRM` when `--merge` is set without `--confirm` |
| `gate` | `--job` `--sha` `--session` | see the sibling verdict below |
| `status` | `--session` | |
| `steer` | `--session` `--text` | |
| `abort` | `--session` | |
| `board` | optional `--project` | |
| `wave` | optional `--wave` `--scope` | `NO-DESKS` when the tracker has no rows |

AO calls go to `AO_DAEMON`, or `http://localhost:3001` when that is unset. `withDaemon` scopes a different base for one call. `src/port-guard.ts` rejects ports 8090 and 18090 before `fetch`. Tests that need a socket bind port 0.

`gate` calls `verify` from the sibling checkout `../jarvis-upper/src/verdict.ts`. When that file is absent, the result is `UNVERIFIED` with reason `UPPER-VERDICT-MISSING`. That is not a two-source pass.

Dispatch's default tracker scope is that same sibling directory. Pass `--scope` to keep the tracker elsewhere.

A harness error whose AO code starts with `UNKNOWN` is reported as `AO_HARNESS_UNKNOWN`.

## Public record that mentions jfm-e2e

These lines are from `leviathan-devops/jarvis-upper` at `5c30ba1c6e800414b339987b43871e610fb79bc5`. They are not files from `jfm-e2e`.

- `context_management/EVIDENCE_STATE.md` section 13: pull request `leviathan-devops/jfm-e2e/pull/1`, commit `cce7bdb`, file `E2E-PROOF.txt` containing `DT1-OK`.
- `RUNTIME_GRADE_TRANSCRIPT.md`: branch `ao/jfm-e2e-1/e2e-proof`; sessions named `jfm-e2e-1`, `jfm-e2e-2`, `jfm-e2e-3`; the session PR route listed pull request 1.
- `context_management/COMPACTION_SURVIVAL.md`: the AO project `jfm-e2e` is recorded with `OMP_PROFILE=jarvis-worker`.
- `context_management/POST-COMPACTION_PROMPT.md`: a job on that target is complete only when jarvis-upper's two-source `verify` passes. jfm's `gate` is the caller of that function.

## Stale against this GitHub tree

The branch point on `main` is `473dcb7`. Leviathan's working tree was not available, so unpushed commits there are not in this PR. jarvis-upper's canon still describes an older jfm layout (a 7-line `gate.ts` that imported the sibling statically). This tree fail-closes that import instead of unloading the CLI. `tests/jfm_verbs.test.ts` still requires the live AO daemon and Leviathan fixtures. CI runs `bun run test` (`tests/unit` only) and does not run `bun run test:live`.
