import crypto from "node:crypto";
import { Account, actions, baseEncode, JsonRpcProvider, KeyPair, type KeyPairString } from "near-api-js";
import { config } from "./config.js";

/**
 * Every Paya user gets their own NEAR address: an implicit account (64 hex
 * characters) whose key is derived from MASTER_SEED and the user's index.
 * Nothing per-user is stored except the index, so the master seed IS the
 * custody: back it up offline and never commit it.
 *
 *   seed_i = HMAC-SHA256(MASTER_SEED, "paya/near/v1/" + i)   (ed25519 private seed)
 *   address_i = hex(ed25519 public key of seed_i)
 */
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const YOCTO = 10n ** 24n;

export const provider = new JsonRpcProvider({ url: config.NEAR_RPC_URL });

function masterSeed() {
  if (!config.MASTER_SEED) throw new Error("MASTER_SEED is not configured");
  return Buffer.from(config.MASTER_SEED, "hex");
}

/** The key pair and address for user index `i`. Deterministic. */
export function deriveKey(i: number): { address: string; keyPair: KeyPair } {
  if (!Number.isInteger(i) || i < 0) throw new Error("Bad key index");
  const seed = crypto.createHmac("sha256", masterSeed()).update(`paya/near/v1/${i}`).digest();
  const priv = crypto.createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
  const pub = crypto.createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(-32);
  const keyPair = KeyPair.fromString(`ed25519:${baseEncode(Buffer.concat([seed, pub]))}` as KeyPairString);
  return { address: pub.toString("hex"), keyPair };
}

export const addressFor = (i: number) => deriveKey(i).address;

const accountFor = (i: number) => {
  const { address, keyPair } = deriveKey(i);
  return new Account(address, provider, keyPair.toString() as KeyPairString);
};

/* ---------- reads ---------- */

export type Balances = {
  exists: boolean;
  /** NEAR the account can spend, after the storage it must keep (yocto). */
  available: bigint;
  /** wNEAR (wrap.near) held (yocto). */
  wnear: bigint;
};

async function viewAccount(accountId: string) {
  try {
    const r = await provider.query<{ amount: string; locked: string; storage_usage: number }>({
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    });
    return r;
  } catch (e) {
    if (/does not exist|UNKNOWN_ACCOUNT/i.test(String((e as Error).message ?? e))) return null;
    throw e;
  }
}

export async function accountExists(accountId: string) {
  return (await viewAccount(accountId)) !== null;
}

export async function balances(accountId: string): Promise<Balances> {
  const [acct, wnear] = await Promise.all([viewAccount(accountId), wnearOf(accountId)]);
  if (!acct) return { exists: false, available: 0n, wnear };
  const storage = BigInt(acct.storage_usage) * 10n ** 19n;
  const free = BigInt(acct.amount) - storage;
  return { exists: true, available: free > 0n ? free : 0n, wnear };
}

async function wnearOf(accountId: string): Promise<bigint> {
  try {
    const r = await provider.callFunction<string>({
      contractId: wrapContract(),
      method: "ft_balance_of",
      args: { account_id: accountId },
      blockQuery: { finality: "final" },
    });
    return BigInt(r ?? "0");
  } catch {
    return 0n;
  }
}

export const wrapContract = () => (config.NEAR_RPC_URL.includes("testnet") ? "wrap.testnet" : "wrap.near");

/* ---------- writes (signed with the user's derived key) ---------- */

const TGAS = 10n ** 12n;
const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR, wrap.near registration

/**
 * NEAR checks a transaction against balance + attached deposits + prepaid gas
 * at a pessimistic gas price (~10× the base; a real 120 TGas send cost
 * 0.1233 NEAR up front on 2026-11-11). Unused gas is refunded afterwards, but
 * the balance must cover it first. So: modest gas per action, and a cost
 * estimate at 1.2e9 yocto/gas.
 */
const GAS = { storage: 10n * TGAS, wrap: 10n * TGAS, transfer: 15n * TGAS, unwrap: 10n * TGAS };
const WORST_GAS_PRICE = 1_200_000_000n; // yocto per gas
/** NEAR needed on top of the amount for a cash-out (a plain transfer to the provider). Generous: real cost ≈0.0001. */
export const SEND_COST = 2_000_000_000_000_000_000_000n; // 0.002 NEAR
/** NEAR needed to unwrap wNEAR. ≈0.012 NEAR. */
export const UNWRAP_COST = GAS.unwrap * WORST_GAS_PRICE + 1n;

/** Turn wNEAR back into native NEAR. */
export async function unwrap(i: number, amount: bigint) {
  const r = await accountFor(i).signAndSendTransaction({
    receiverId: wrapContract(),
    actions: [actions.functionCall("near_withdraw", { amount: amount.toString() }, GAS.unwrap, 1n)],
    waitUntil: "FINAL",
  });
  return r.transaction.hash as string;
}

/** Send native NEAR to another account. */
export async function sendNear(i: number, receiverId: string, amount: bigint) {
  const r = await accountFor(i).signAndSendTransaction({
    receiverId,
    actions: [actions.transfer(amount)],
    waitUntil: "FINAL",
  });
  return r.transaction.hash as string;
}

/* ---------- treasury (optional): activates new addresses so they can sign ---------- */

export async function fundFromTreasury(receiverId: string, amount: bigint) {
  if (!config.TREASURY_ACCOUNT_ID || !config.TREASURY_PRIVATE_KEY) throw new Error("Treasury not configured");
  const t = new Account(config.TREASURY_ACCOUNT_ID, provider, config.TREASURY_PRIVATE_KEY as KeyPairString);
  const r = await t.signAndSendTransaction({ receiverId, actions: [actions.transfer(amount)], waitUntil: "FINAL" });
  return r.transaction.hash as string;
}

/* ---------- units ---------- */

export const toYocto = (near: number) => BigInt(Math.round(near * 1e6)) * 10n ** 18n;
export const toNear = (yocto: bigint) => Number(yocto / 10n ** 18n) / 1e6;
export const ONE_NEAR = YOCTO;
