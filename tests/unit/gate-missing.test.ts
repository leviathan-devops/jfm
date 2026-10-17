import { expect, test } from "bun:test";
import { gateDesk } from "../../src/gate";

test("gate fail-closes when the sibling verdict module is absent", async () => {
  const result = await gateDesk({
    jobDir: "/tmp/jfm-no-such-job",
    headSha: "732083e1e7890000000000000000000000000000",
    sessionId: "not-a-live-session",
  });
  expect(result.verdict).toBe("UNVERIFIED");
  expect(result.reasons).toContain("UPPER-VERDICT-MISSING");
});
