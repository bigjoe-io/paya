# Paya contracts

NEAR smart contracts for Paya, written in Rust with `near-sdk-rs` and built with `cargo near`.

Planned:

- `escrow` — holds a user's deposit per order, releases to treasury on `confirm`, refunds on `fail` or timeout. The payout service holds a function-call key limited to `confirm` and `fail`.

Nothing here yet. Scaffolding starts after the landing page ships.
