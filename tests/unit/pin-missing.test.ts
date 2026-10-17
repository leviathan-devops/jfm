import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readOverlayRoles } from "../../src/pin";

test("a missing overlay is null and does not reject", () => {
  const missing = join(tmpdir(), `jfm-overlay-missing-${crypto.randomUUID()}.yml`);
  expect(readOverlayRoles(missing)).toBeNull();
});
