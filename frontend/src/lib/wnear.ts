import type { WalletTx } from "@/lib/api";

/**
 * NEAR bought through Intents can land as wNEAR (wrap.near), the token form
 * of NEAR. It's worth exactly 1 NEAR; unwrapping is one tap.
 */
const RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://free.rpc.fastnear.com";

/** wNEAR balance in yocto (string). "0" if the account isn't registered. */
export async function wnearBalance(accountId: string): Promise<string> {
  const args = btoa(JSON.stringify({ account_id: accountId }));
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "paya",
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: "wrap.near", method_name: "ft_balance_of", args_base64: args },
    }),
  });
  const j = (await r.json()) as { result?: { result: number[] } };
  if (!j.result) return "0";
  return (JSON.parse(String.fromCharCode(...j.result.result)) as string) ?? "0";
}

/** Turn wNEAR back into native NEAR (needs exactly 1 yoctoNEAR attached). */
export function unwrapTx(amountYocto: string): WalletTx {
  return {
    receiverId: "wrap.near",
    actions: [{ type: "FunctionCall", params: { methodName: "near_withdraw", args: { amount: amountYocto }, gas: "10000000000000", deposit: "1" } }],
  };
}
