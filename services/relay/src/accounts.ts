import crypto from "node:crypto";
import { audit, last4 } from "./audit.js";
import { config } from "./config.js";
import { buys, swaps, users, type User } from "./db.js";
import { log, warn } from "./log.js";
import { accountExists, addressFor, balances, SEND_COST, sendNear, sendToIntents, toNear, toYocto, unwrap, UNWRAP_COST } from "./near.js";
import { minCashoutNear } from "./quote.js";
import { COUNTRY, paj, PajError } from "./paj.js";
import { decrypt, encrypt } from "./secrets.js";
import { createSwap, failSwap, recordDeposit } from "./swaps.js";

/**
 * A Paya account: one email ⇄ one NEAR address ⇄ one payout bank.
 *
 * The NEAR address is derived from MASTER_SEED (see near.ts). Any NEAR sent
 * to it is cashed out to the linked bank automatically (auto cash-out), or
 * held in the Paya balance when the user has turned that off.
 */

/** NEAR kept back for the send itself: never less than what NEAR will check for, plus a margin. */
const RESERVE = () => {
  const floor = SEND_COST + toYocto(0.005);
  const set = toYocto(config.RESERVE_NEAR);
  return set > floor ? set : floor;
};
const MIN_AUTO = () => toYocto(config.AUTO_MIN_NEAR);
const PAUSE_AFTER_FAILURE_MS = 30 * 60_000;

/* ---------- sign-in ---------- */

/** Email verified with PAJ: find or create the account and keep the PAJ session (encrypted). */
export function signIn(email: string, pajToken: string, pajExpiresAt: string) {
  const e = email.toLowerCase();
  let u = users.byEmail(e);
  if (!u) {
    const key_index = users.nextIndex();
    const id = `usr_${crypto.randomBytes(8).toString("hex")}`;
    users.insert({
      id,
      email: e,
      key_index,
      address: addressFor(key_index),
      currency: null,
      bank_id: null,
      bank_name: null,
      account_number: null,
      account_name: null,
      auto_cashout: 1,
      auto_paused_until: null,
      paj_token_enc: encrypt(pajToken),
      paj_expires_at: pajExpiresAt,
    });
    users.event(id, "created", { address: addressFor(key_index) });
    audit("account_created", e, { userId: id, address: addressFor(key_index) });
    log("account", `${id} created for ${e}`);
    u = users.byId(id)!;
  } else {
    users.update(u.id, { paj_token_enc: encrypt(pajToken), paj_expires_at: pajExpiresAt });
    u = users.byId(u.id)!;
  }
  return u;
}

/** The user's PAJ session if it's still valid (with a minute to spare). */
export function pajTokenOf(u: User): string | null {
  if (!u.paj_token_enc || !u.paj_expires_at) return null;
  if (Date.parse(u.paj_expires_at) - Date.now() < 60_000) return null;
  try {
    return decrypt(u.paj_token_enc);
  } catch {
    return null;
  }
}

/** PAJ session or a "verify your email again" error the app understands. */
export function requirePaj(u: User) {
  const t = pajTokenOf(u);
  if (!t) throw new PajError("Session expired", 401);
  return t;
}

/* ---------- payout bank ---------- */

/** Link (or change) the payout bank. The account holder's name always comes from the bank, never the client. */
export async function setBank(u: User, p: { currency: string; bankId: string; accountNumber: string }) {
  const token = requirePaj(u);
  if (!COUNTRY[p.currency]) throw new Error("Unsupported currency");
  const resolved = await paj.resolveAccount(token, p.bankId, p.accountNumber);
  const bankName =
    resolved.bank?.name ?? (await paj.banks(token)).find((b) => b.id === p.bankId)?.name ?? "Bank";
  // Saving it with PAJ makes it a payout destination for this user; already-saved is fine.
  await paj.saveAccount(token, p.bankId, p.accountNumber).catch((e: Error) => {
    if (!/exist|already/i.test(e.message)) throw e;
  });
  const before = u.account_number ? `${u.bank_name} ${last4(u.account_number)}` : null;
  users.update(u.id, {
    currency: p.currency,
    bank_id: p.bankId,
    bank_name: bankName,
    account_number: resolved.accountNumber || p.accountNumber,
    account_name: resolved.accountName,
  });
  users.event(u.id, "bank_linked", { currency: p.currency, bank: bankName, account: last4(p.accountNumber), name: resolved.accountName, before });
  audit(before ? "bank_changed" : "bank_linked", u.email, { bank: bankName, account: last4(p.accountNumber), name: resolved.accountName, before });
  return users.byId(u.id)!;
}

export function setAuto(u: User, on: boolean) {
  users.update(u.id, { auto_cashout: on ? 1 : 0, auto_paused_until: null });
  users.event(u.id, on ? "auto_on" : "auto_off");
  audit(on ? "auto_cashout_on" : "auto_cashout_off", u.email);
  return users.byId(u.id)!;
}

/* ---------- balances ---------- */

export async function accountView(u: User) {
  const b = await balances(u.address);
  const spendable = b.available > RESERVE() ? b.available - RESERVE() : 0n;
  return {
    email: u.email,
    address: u.address,
    exists: b.exists,
    balance: toNear(b.available),
    spendable: toNear(spendable),
    wnear: toNear(b.wnear),
    reserve: toNear(RESERVE()),
    autoMin: Math.max(config.AUTO_MIN_NEAR, await minCashoutNear().catch(() => config.AUTO_MIN_NEAR)),
    bank: u.bank_id
      ? { currency: u.currency!, bankId: u.bank_id, bankName: u.bank_name!, accountNumber: u.account_number!, accountName: u.account_name! }
      : null,
    autoCashout: Boolean(u.auto_cashout),
    autoPausedUntil: u.auto_paused_until && Date.parse(u.auto_paused_until) > Date.now() ? u.auto_paused_until : null,
    verified: Boolean(pajTokenOf(u)),
  };
}

/* ---------- cash-out ---------- */

const busy = new Set<string>(); // one money movement per user at a time
const cooldownUntil = new Map<string, number>(); // RPC state can trail a just-sent transfer by a block or two
const COOLDOWN_MS = 8000;

async function exclusive<T>(u: User, fn: () => Promise<T>): Promise<T> {
  if (busy.has(u.id) || (cooldownUntil.get(u.id) ?? 0) > Date.now())
    throw new Error("Another transfer from your account is in progress. Try again in a moment.");
  busy.add(u.id);
  try {
    return await fn();
  } finally {
    busy.delete(u.id);
  }
}
/** Call right after (or on a failed attempt at) an on-chain send. */
const cool = (u: User) => cooldownUntil.set(u.id, Date.now() + COOLDOWN_MS);

const hasOpenCashOut = (u: User) => swaps.active().some((s) => s.account_id === u.address && s.status === "awaiting_deposit");

/** Sell `near` NEAR from the user's Paya address to their linked bank. */
export function cashOut(u: User, near: number, trigger: "manual" | "auto") {
  return exclusive(u, async () => {
    if (!u.bank_id || !u.currency || !u.account_number || !u.account_name || !u.bank_name)
      throw new Error("Link a bank account first");
    const token = requirePaj(u);
    if (hasOpenCashOut(u)) throw new Error("A cash-out is already being sent. Try again in a moment.");

    const b = await balances(u.address);
    const spendable = b.available > RESERVE() ? b.available - RESERVE() : 0n;
    const want = toYocto(near);
    if (want <= 0n) throw new Error("Enter an amount");
    if (want > spendable) throw new Error(`You can cash out up to ${toNear(spendable)} NEAR (the rest pays the network fee)`);
    const min = await minCashoutNear();
    if (near < min) throw new Error(`Minimum cash-out is ${min} NEAR`);

    const { swap, deposit } = await createSwap(
      {
        accountId: u.address,
        near,
        currency: u.currency,
        bankId: u.bank_id,
        bankName: u.bank_name,
        accountNumber: u.account_number,
        accountName: u.account_name,
      },
      token,
    );
    swaps.event(swap.id, "trigger", { trigger, userId: u.id });

    if (!deposit) {
      // Orders simulated (LIVE_ORDERS off): walk the same steps, move nothing.
      return recordDeposit(swap.id, "simulated");
    }
    const amount = BigInt(deposit.amountYocto);
    if (amount + SEND_COST > b.available) {
      failSwap(swap.id, "The rate moved before we could send. Nothing left your balance.");
      throw new Error("The rate moved while we were locking it. Nothing was sent — try a slightly smaller amount.");
    }
    let hash: string;
    try {
      hash = await sendToIntents(u.key_index, deposit.depositAddress, amount);
      cool(u);
    } catch (e) {
      cool(u);
      const msg = (e as Error).message;
      swaps.event(swap.id, "send_error", { message: msg }); // the technical reason, for support
      failSwap(swap.id, "We couldn't send this cash-out. Nothing left your balance, so you can try again.");
      throw new Error("Couldn't send the NEAR. Nothing was taken from your balance. Please try again.");
    }
    audit("cashout_sent", u.email, { swapId: swap.id, trigger, near, tx: hash, bank: u.bank_name, account: last4(u.account_number) });
    return recordDeposit(swap.id, hash);
  });
}

/* ---------- withdraw (send NEAR elsewhere) ---------- */

const IMPLICIT = /^[0-9a-f]{64}$/;
const NAMED = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const GAS_ROOM = toYocto(0.005);

export function withdraw(u: User, to: string, near: number) {
  return exclusive(u, async () => {
    const dest = to.trim().toLowerCase();
    if (dest === u.address) throw new Error("That's your own Paya address");
    if (!IMPLICIT.test(dest) && !(NAMED.test(dest) && dest.length >= 2 && dest.length <= 64))
      throw new Error("That isn't a NEAR address");
    // Named accounts must exist or the NEAR bounces; implicit ones are created by the transfer.
    if (!IMPLICIT.test(dest) && !(await accountExists(dest))) throw new Error(`${dest} doesn't exist on NEAR`);
    if (hasOpenCashOut(u)) throw new Error("A cash-out is being sent. Try again in a moment.");

    const b = await balances(u.address);
    const max = b.available > GAS_ROOM ? b.available - GAS_ROOM : 0n;
    const amount = toYocto(near);
    if (amount <= 0n) throw new Error("Enter an amount");
    if (amount > max) throw new Error(`You can send up to ${toNear(max)} NEAR`);

    let hash: string;
    try {
      hash = await sendNear(u.key_index, dest, amount);
    } finally {
      cool(u);
    }
    users.event(u.id, "withdraw", { to: dest, near, tx: hash });
    audit("withdraw_sent", u.email, { to: dest, near, tx: hash });
    log("account", `${u.id} sent ${near} NEAR to ${dest} (${hash})`);
    return { txHash: hash };
  });
}

/* ---------- deposit watcher ---------- */

const lastPolled = new Map<string, number>();
const waitingSignInNoted = new Set<string>();

/** Recently active accounts are checked every DEPOSIT_POLL_MS; quiet ones every 5 minutes. */
function due(u: User) {
  const recent =
    Date.now() - Date.parse(u.updated_at) < 7 * 86_400_000 ||
    swaps.active().some((s) => s.account_id === u.address) ||
    buys.active().some((b) => b.account_id === u.address);
  const every = recent ? config.DEPOSIT_POLL_MS : 5 * 60_000;
  return Date.now() - (lastPolled.get(u.id) ?? 0) >= every;
}

function recentlyFailed(u: User) {
  const last = swaps.forAccount(u.address, 1)[0];
  return Boolean(
    last && ["failed", "refunded"].includes(last.status) && Date.now() - Date.parse(last.updated_at) < PAUSE_AFTER_FAILURE_MS,
  );
}

async function checkUser(u: User) {
  lastPolled.set(u.id, Date.now());
  const b = await balances(u.address);

  // NEAR bought through Intents can arrive as wNEAR: turn it into NEAR.
  if (b.wnear >= toYocto(0.001) && b.exists && b.available >= UNWRAP_COST + toYocto(0.001)) {
    const hash = await unwrap(u.key_index, b.wnear).finally(() => cool(u));
    users.event(u.id, "unwrapped", { near: toNear(b.wnear), tx: hash });
    log("account", `${u.id} unwrapped ${toNear(b.wnear)} wNEAR`);
    return;
  }

  if (!u.auto_cashout || !u.bank_id) return;
  // Simulated orders move no NEAR, so the balance would be "cashed out" again every tick.
  if (config.demo) return;
  if (u.auto_paused_until && Date.parse(u.auto_paused_until) > Date.now()) return;
  if (hasOpenCashOut(u) || busy.has(u.id) || (cooldownUntil.get(u.id) ?? 0) > Date.now() || recentlyFailed(u)) return;

  const spendable = b.available > RESERVE() ? b.available - RESERVE() : 0n;
  const autoMin = MIN_AUTO() > toYocto(await minCashoutNear()) ? MIN_AUTO() : toYocto(await minCashoutNear());
  if (spendable < autoMin) return;

  if (!pajTokenOf(u)) {
    if (!waitingSignInNoted.has(u.id)) {
      waitingSignInNoted.add(u.id);
      users.event(u.id, "auto_waiting_sign_in", { near: toNear(spendable) });
      log("account", `${u.id} has ${toNear(spendable)} NEAR waiting; needs to verify email again`);
    }
    return;
  }
  waitingSignInNoted.delete(u.id);

  // Round down to 0.0001 NEAR so the swap math never exceeds the balance.
  const near = Math.floor(toNear(spendable) * 1e4) / 1e4;
  try {
    const s = await cashOut(u, near, "auto");
    log("account", `${u.id} auto cash-out ${near} NEAR → ${s.id}`);
  } catch (e) {
    const msg = (e as Error).message;
    const until = new Date(Date.now() + PAUSE_AFTER_FAILURE_MS).toISOString();
    users.update(u.id, { auto_paused_until: until });
    users.event(u.id, "auto_failed", { near, error: msg, pausedUntil: until });
    audit("auto_cashout_failed", u.email, { near, error: msg });
    warn("account", `${u.id} auto cash-out failed: ${msg}`);
  }
}

export function startDepositWatcher() {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      for (const u of users.all()) {
        if (!due(u)) continue;
        try {
          await checkUser(users.byId(u.id)!);
        } catch (e) {
          warn("deposits", `${u.id}: ${(e as Error).message}`);
        }
      }
    } finally {
      running = false;
    }
  }, 3000);
  log("deposits", `watching Paya addresses (active every ${config.DEPOSIT_POLL_MS / 1000}s, auto cash-out from ${config.AUTO_MIN_NEAR} NEAR)`);
}
