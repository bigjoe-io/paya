import { Account, JsonRpcProvider, actions, type KeyPairString } from "near-api-js";
import { config } from "./config.js";
import { log } from "./log.js";

const provider = new JsonRpcProvider({ url: config.rpcUrl });
const operator = new Account(config.OPERATOR_ACCOUNT_ID, provider, config.OPERATOR_PRIVATE_KEY as KeyPairString);

const TGAS = 10n ** 12n;

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

  /** Ask the factory to create `<userId>.<factory>`. Returns the account id. */
  async createDepositAccount(userId: string): Promise<string> {
    log("near", `creating deposit account for ${userId}`);
    const created = (await operator.callFunction({
      contractId: config.FACTORY_ACCOUNT_ID,
      methodName: "create_deposit_account",
      args: { user_id: userId },
      gas: 100n * TGAS,
      deposit: 0n,
    })) as string | null;
    if (!created) throw new Error("Factory could not create the deposit account (see contract logs)");
    return created;
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
