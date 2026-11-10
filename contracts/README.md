# Paya contracts

Two Rust contracts built with `near-sdk` 5.29 and `cargo near`.

| Crate | Deployed at | Purpose |
|---|---|---|
| `factory` | `paya.near` / `paya.testnet` | Creates `<user>.paya.near` deposit accounts, keeps the registry, pauses, sets withdraw addresses |
| `deposit` | every `<user>.paya.near` | Holds a user's NEAR; `forward` sends it to a NEAR Intents deposit address on the operator's instruction; `withdraw` is the user's operator-free escape hatch |

## How a cash-out moves on-chain

```
user wallet ──transfer──▶ joseph.paya.near ──forward(order)──▶ 1Click deposit address ──▶ USDC on Solana
                              ▲ refund if the swap fails
```

Every `forward` emits a NEP-297 event `paya/forward` with the order id, so the whole history is auditable.

## Build

Build the deposit contract first; the factory embeds its wasm for non-global deployments.

```bash
cd contracts/deposit && cargo near build non-reproducible-wasm
mkdir -p ../factory/res && cp ../target/near/paya_deposit/paya_deposit.wasm ../factory/res/deposit.wasm
cd ../factory && cargo near build non-reproducible-wasm
```

Unit tests: `cargo test` in each crate.

## Deployed

| Network | Factory | Notes |
|---|---|---|
| testnet | `paya-demo-6282.testnet` | owner = operator (demo); embedded deposit wasm; ~1.28 NEAR funded per new account |

## Deploy (testnet)

```bash
near account create-account sponsor-by-faucet-service paya-demo.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
near contract deploy paya-demo.testnet use-file target/near/paya_factory/paya_factory.wasm \
  with-init-call new json-args '{"owner":"paya-demo.testnet","operator":"<operator-account>","global_contract_id":null}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

With `global_contract_id: null` the factory deploys the embedded deposit wasm into each new account (~0.5 NEAR locked per account, refundable). On mainnet publish the deposit contract once as a global contract (`near contract deploy-as-global … as-global-account-id`) and pass that account id instead: each new account then costs well under 0.01 NEAR.

The operator is the account whose key the relay service holds. Give it only a function-call key for the factory and the deposit accounts (`create_deposit_account`, `forward`, `forward_all`, `set_paused`).
