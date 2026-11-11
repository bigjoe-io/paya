import assert from "node:assert/strict";
import { test } from "node:test";
process.env.MASTER_SEED ??= "11".repeat(32);
process.env.DATA_KEY ??= "22".repeat(32);
process.env.SESSION_SECRET ??= "s".repeat(40);
const { decToUnits } = await import("../swaps.js");
const { treasuryAddress } = await import("../solana.js");

test("decimal amounts convert to exact units", () => {
  assert.equal(decToUnits("12.5", 24), 12_500000000000000000000000n);
  assert.equal(decToUnits("0.4", 24), 400000000000000000000000n);
  assert.equal(decToUnits("3", 6), 3_000000n);
  assert.equal(decToUnits("1.2345678", 6), 1_234567n); // extra precision is cut, never rounded up
  assert.throws(() => decToUnits("1e5", 6));
  assert.throws(() => decToUnits("-1", 6));
});

test("the Solana treasury address is derived deterministically", () => {
  const a = treasuryAddress();
  assert.match(a, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  assert.equal(treasuryAddress(), a);
});
