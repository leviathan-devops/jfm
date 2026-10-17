import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertDeskRow, listDesks, setDeskState } from "../../src/desk";

test("each scope keeps its own tracker", () => {
  const a = mkdtempSync(join(tmpdir(), "jfm-desk-a-"));
  const b = mkdtempSync(join(tmpdir(), "jfm-desk-b-"));
  insertDeskRow(a, { desk: "d1", wave: "w1", sessionId: "s1", project: "p1", job: "job-a", branch: "ao/s1/root" });
  insertDeskRow(b, { desk: "d1", wave: "w1", sessionId: "s2", project: "p2" });
  const rowsA = listDesks(a, "w1");
  const rowsB = listDesks(b, "w1");
  expect(rowsA).toHaveLength(1);
  expect(rowsB).toHaveLength(1);
  expect(rowsA[0]?.session_id).toBe("s1");
  expect(rowsB[0]?.session_id).toBe("s2");
  expect(rowsA[0]?.project).toBe("p1");
  setDeskState(a, "d1", "complete", { ao_head: "abc" });
  const after = listDesks(a, "w1");
  expect(after[0]?.state).toBe("complete");
  expect(after[0]?.ao_head).toBe("abc");
  expect(listDesks(b, "w1")[0]?.state).toBe("running");
});
