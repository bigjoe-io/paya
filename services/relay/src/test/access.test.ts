import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(tmpdir(), "paya-access-"));
process.env.MASTER_SEED ??= "11".repeat(32);
process.env.DATA_KEY ??= "22".repeat(32);
process.env.SESSION_SECRET ??= "s".repeat(40);
process.env.ACCESS_SECRET = "a".repeat(64);
for (const k of ["DB_PATH", "BUYS_PATH", "USERS_PATH", "ACCESS_PATH", "WAITLIST_PATH"]) process.env[k] = path.join(dir, `${k}.json`);
process.env.AUDIT_PATH = path.join(dir, "audit.jsonl");
const { app } = await import("../server.js");
const { createCode } = await import("../access.js");
const { accessCodes, waitlist } = await import("../db.js");
const post = (p: string, body: unknown, h: Record<string, string> = {}) =>
  app.request(p, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...h } });

test("app routes are closed without a tester token; open routes stay open", async () => {
  assert.equal((await app.request("/me")).status, 403);
  assert.equal((await app.request("/quote?near=2&currency=NGN")).status, 403);
  assert.equal((await app.request("/health")).status, 200);
});

test("a code unlocks, a used-up or revoked code doesn't", async () => {
  const { id, code } = createCode({ label: "t", maxUses: 1, expiresDays: null });
  assert.match(code, /^PAYA-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await post("/access/redeem", { code: "PAYA-XXXX-XXXX" })).status, 400);
  const r = await post("/access/redeem", { code: code.toLowerCase() }); // case-insensitive
  assert.equal(r.status, 200);
  const { token } = (await r.json()) as { token: string };
  assert.equal((await app.request("/access/check", { headers: { "X-Paya-Access": token } }).then((x) => x.json())).ok, true);
  assert.notEqual((await app.request("/me", { headers: { "X-Paya-Access": token } })).status, 403); // passes the gate (then needs sign-in)
  assert.equal((await post("/access/redeem", { code })).status, 400); // max uses reached
  accessCodes.update(id, { revoked: 1 });
  assert.equal((await app.request("/me", { headers: { "X-Paya-Access": token } })).status, 403);
  assert.equal((await app.request("/me", { headers: { "X-Paya-Access": token.slice(0, -2) + "xx" } })).status, 403); // forged
});

test("waitlist stores each email once and never reveals duplicates", async () => {
  assert.equal((await post("/waitlist", { email: "A@Example.com" })).status, 200);
  assert.equal((await post("/waitlist", { email: "a@example.com" })).status, 200);
  assert.equal((await post("/waitlist", { email: "nope" })).status, 400);
  assert.equal(waitlist.all().length, 1);
  assert.equal(waitlist.all()[0].email, "a@example.com");
});
