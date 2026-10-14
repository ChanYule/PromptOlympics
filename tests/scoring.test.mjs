import test from "node:test";
import assert from "node:assert/strict";
import { combinedScore } from "../src/scoring.ts";
test("display scoring matches precise server fifty-fifty calculation", () => {
  assert.equal(combinedScore(4.375, 4.2), 4.2875);
  assert.equal(combinedScore(null, 4), null);
  assert.equal(combinedScore(4, null), null);
});
