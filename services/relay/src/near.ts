import { readFileSync } from "node:fs";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  actions,
  keyToImplicitAddress,
  type KeyPairString,
} from "near-api-js";
import { config } from "./config.js";
import { log } from "./log.js";

const provider = new JsonRpcProvider({ url: config.rpcUrl });
const operator = new Account(config.OPERATOR_ACCOUNT_ID, provider, config.OPERATOR_PRIVATE_KEY as KeyPairString);

const TGAS = 10n ** 12n;
const STORAGE_BYTE_COST = 10n ** 19n; // 1 NEAR per 100 KB
const EMPTY_CODE_HASH = "11111111111111111111111111111111";
const nearToYoctoBig = (n: string) => BigInt(Math.round(Number(n) * 1e6)) * 10n ** 18n;

export const near = {
  /** Liquid balance of any account in yoctoNEAR (0n if it does not exist). */
  async balance(accountId: string): Promise<bigint> {
    try {
      const a = await provider.viewAccount({ accountId });
      return BigInt(a.amount);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg.includes("does not exist") || msg.includes("UNKNOWN_ACCOUNT")) return 0n;
      throw e;
    }
  },

  async view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await provider.callFunction({ contractId, method, args })) as T;
  },

  /** Deposit account registered for a user id, if the factory knows it. */
  depositAccountOf(userId: string) {
    return near.view<string | null>(config.FACTORY_ACCOUNT_ID, "get_account", { user_id: userId });
  },

  /** A fresh ed25519 key and the 64-hex implicit address it controls. */
  newImplicit(): { accountId: string; secretKey: KeyPairString } {
    const kp = KeyPair.fromRandom("ed25519");
    return { accountId: keyToImplicitAddress(kp.getPublicKey()), secretKey: kp.toString() as KeyPairString };
  },

  /**
   * Turn an implicit (hex) address into a locked Paya deposit account:
   *   1. operator funds it (a transfer creates the account with its key)
   *   2. the account itself, in ONE transaction: deploy deposit contract,
   *      call `new`, delete its only key → no one holds a key afterwards.
   * The batch is atomic: if `new` fails, the key is not deleted and the step
   * can be retried with the same secret. Idempotent at every stage.
   */
  async lockImplicitDeposit(userId: string, accountId: string, secretKey: KeyPairString): Promise<void> {
    const code = new Uint8Array(readFileSync(config.DEPOSIT_WASM_PATH));
    const view = await provider.viewAccount({ accountId }).catch(() => null);

    if (view && view.code_hash !== EMPTY_CODE_HASH) {
      log("near", `${accountId} already has code; skipping setup`);
      return;
    }
    if (!view) {
      // Code storage + ~0.05 for the setup tx's prepaid gas (bought at 0.001 Ⓝ/Tgas)
      // and contract state. The small leftover is swept into the first cash-out.
      const fund = BigInt(code.length) * STORAGE_BYTE_COST + nearToYoctoBig("0.06");
      log("near", `funding implicit ${accountId} with ${Number(fund) / 1e24} NEAR`);
      await operator.signAndSendTransaction({ receiverId: accountId, actions: [actions.transfer(fund)] });
    }

    const self = new Account(accountId, provider, secretKey);
    const kp = KeyPair.fromString(secretKey);
    log("near", `deploy + init + lock ${accountId} (${userId})`);
    await self.signAndSendTransaction({
      receiverId: accountId,
      actions: [
        actions.deployContract(code),
        actions.functionCall(
          "new",
          { factory: config.FACTORY_ACCOUNT_ID, operator: config.OPERATOR_ACCOUNT_ID, user_id: userId },
          30n * TGAS,
          0n,
        ),
        actions.deleteKey(kp.getPublicKey()),
      ],
    });
  },

  /** Add the hex account to the factory's on-chain registry. */
  async registerDeposit(userId: string, accountId: string): Promise<void> {
    const existing = await near.depositAccountOf(userId);
    if (existing === accountId) return;
    if (existing) log("near", `${userId}: replacing ${existing} with ${accountId} in the factory registry`);
    await operator.callFunction({
      contractId: config.FACTORY_ACCOUNT_ID,
      methodName: "register_account",
      args: { user_id: userId, account_id: accountId },
      gas: 30n * TGAS,
      deposit: 0n,
    });
  },

  /** What the deposit contract itself will let us forward (balance minus storage and reserve). */
  async available(depositAccount: string): Promise<bigint> {
    try {
      return BigInt(await near.view<string>(depositAccount, "get_available"));
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg.includes("does not exist") || msg.includes("UNKNOWN_ACCOUNT")) return 0n;
      throw e;
    }
  },

  /** Forward an exact amount to a swap deposit address. Returns the tx hash. */
  async forward(depositAccount: string, to: string, amountYocto: bigint, orderId: string): Promise<string> {
    log("near", `forward ${amountYocto} yocto ${depositAccount} → ${to} (${orderId})`);
    const result = await operator.signAndSendTransaction({
      receiverId: depositAccount,
      actions: [
        actions.functionCall(
          "forward",
          { to, amount: amountYocto.toString(), order_id: orderId },
          30n * TGAS,
          0n,
        ),
      ],
    });
    const hash = result.transaction?.hash;
    if (!hash) throw new Error("forward_all returned no transaction hash");
    return hash;
  },
};
