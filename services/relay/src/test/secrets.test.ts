import assert from "node:assert/strict";
import { test } from "node:test";
process.env.MASTER_SEED ??= "11".repeat(32);
process.env.DATA_KEY ??= "22".repeat(32);
process.env.SESSION_SECRET ??= "s".repeat(40);
const { encrypt, decrypt, createSession, readSession } = await import("../secrets.js");

test("encrypt/decrypt round-trips and detects tampering", () => {
  const s = encrypt("paj-token-123");
  assert.equal(decrypt(s), "paj-token-123");
  const [iv, tag, body] = s.split(".");
  const flipped = `${iv}.${tag}.${body.slice(0, -2)}${body.endsWith("A") ? "B" : "A"}${body.slice(-1)}`;
  assert.throws(() => decrypt(flipped));
});

test("sessions verify, and forged ones don't", () => {
  const { token } = createSession("usr_1");
  assert.equal(readSession(token), "usr_1");
  const [data] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "usr_2", exp: Date.now() + 1e9 })).toString("base64url");
  assert.equal(readSession(`${forged}.${token.split(".")[1]}`), null);
  assert.equal(readSession(`${data}.x`), null);
  assert.equal(readSession("garbage"), null);
});
