import crypto from "node:crypto";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { config } from "./config.js";

/**
 * Paya's Solana wallet ("treasury"): where swapped USDC lands before it is
 * forwarded to PAJ, and where PAJ sends USDC for purchases. Its key is
 * derived from MASTER_SEED, like every user's NEAR key. It holds a little
 * SOL for network fees and, briefly, in-flight USDC.
 */
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const USDC_DECIMALS = 6;

export const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");

let cached: Keypair | null = null;
export function treasury(): Keypair {
  if (!cached) {
    const seed = crypto.createHmac("sha256", Buffer.from(config.MASTER_SEED!, "hex")).update("paya/sol/treasury/v1").digest();
    cached = Keypair.fromSeed(seed);
  }
  return cached;
}
export const treasuryAddress = () => treasury().publicKey.toBase58();

/** USDC (6 decimals) as integer units. */
export const toUnits = (usdc: number) => BigInt(Math.round(usdc * 1e6));
export const fromUnits = (u: bigint) => Number(u) / 1e6;

export async function solBalance(owner = treasury().publicKey) {
  return (await connection.getBalance(owner, "confirmed")) / 1e9;
}

export async function usdcBalance(owner = treasury().publicKey): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner, true);
  try {
    const b = await connection.getTokenAccountBalance(ata, "confirmed");
    return BigInt(b.value.amount);
  } catch {
    return 0n; // no token account yet
  }
}

/**
 * Send exactly `units` USDC to `to` (a wallet address). Creates the
 * recipient's token account if needed (Paya pays the ~0.002 SOL rent).
 * Optional memo for providers that require one.
 */
export async function sendUsdc(to: string, units: bigint, memo?: string) {
  const payer = treasury();
  const dest = new PublicKey(to);
  const fromAta = getAssociatedTokenAddressSync(USDC_MINT, payer.publicKey);
  const toAta = getAssociatedTokenAddressSync(USDC_MINT, dest, true);
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), // gets through when the network is busy
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, toAta, dest, USDC_MINT),
    createTransferCheckedInstruction(fromAta, USDC_MINT, toAta, payer.publicKey, units, USDC_DECIMALS),
  );
  if (memo) tx.add(new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM, data: Buffer.from(memo, "utf8") }));
  return sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed", maxRetries: 5 });
}

/** How much USDC a transaction moved into `owner`'s token account (units). null if the tx isn't visible yet. */
export async function usdcReceivedIn(signature: string, owner = treasuryAddress()): Promise<bigint | null> {
  const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx?.meta) return null;
  const pick = (list: typeof tx.meta.preTokenBalances) =>
    BigInt(list?.find((b) => b.owner === owner && b.mint === USDC_MINT.toBase58())?.uiTokenAmount.amount ?? "0");
  return pick(tx.meta.postTokenBalances) - pick(tx.meta.preTokenBalances);
}

export const isSolanaAddress = (s: string) => {
  try {
    return new PublicKey(s).toBase58() === s;
  } catch {
    return false;
  }
};
