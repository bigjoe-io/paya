import assert from "node:assert/strict";
import { test } from "node:test";
process.env.MASTER_SEED ??= "11".repeat(32);
process.env.DATA_KEY ??= "22".repeat(32);
process.env.SESSION_SECRET ??= "s".repeat(40);
const { deriveKey } = await import("../near.js");
const { keyToImplicitAddress } = await import("near-api-js");

test("derived keys are deterministic, distinct, and match their implicit address", () => {
  const a = deriveKey(0);
  const b = deriveKey(0);
  const c = deriveKey(1);
  assert.equal(a.address, b.address);
  assert.notEqual(a.address, c.address);
  assert.match(a.address, /^[0-9a-f]{64}$/);
  assert.equal(keyToImplicitAddress(a.keyPair.getPublicKey()), a.address);
});

test("a derived key signs and verifies", () => {
  const { keyPair } = deriveKey(7);
  const msg = new TextEncoder().encode("paya");
  const { signature } = keyPair.sign(msg);
  assert.ok(keyPair.verify(msg, signature));
});
