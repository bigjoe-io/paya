//! Paya deposit account.
//!
//! One of these lives on every user's Paya address (`<user>.paya.near`). It has
//! no access keys: the only way NEAR leaves it is through `forward`, which the
//! Paya operator calls with the deposit address of a NEAR Intents swap. The
//! swap turns the NEAR into USDC on Solana, which the payout service converts
//! to naira. If the swap fails, Intents refunds this account, and the operator
//! can forward again.
//!
//! Trust model (stated plainly): the operator decides *where* the NEAR is
//! forwarded, so users trust Paya to forward to the swap. Every forward is
//! logged on-chain as a NEP-297 event with the order id, so it is auditable.
//! A `withdraw_to` set by the factory lets the user reclaim funds without the
//! operator.

use near_sdk::json_types::U128;
use near_sdk::serde::Serialize;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

/// Keep a little NEAR behind so the account always covers its own storage.
const STORAGE_RESERVE: NearToken = NearToken::from_millinear(10);

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ForwardData {
    pub user_id: String,
    pub order_id: String,
    pub from: AccountId,
    pub to: AccountId,
    pub amount: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct WithdrawData {
    pub user_id: String,
    pub from: AccountId,
    pub to: AccountId,
    pub amount: U128,
}

#[near(event_json(standard = "paya"))]
pub enum Event {
    #[event_version("1.0.0")]
    Forward(Vec<ForwardData>),
    #[event_version("1.0.0")]
    Withdraw(Vec<WithdrawData>),
}

#[near(serializers = [json])]
pub struct Info {
    pub factory: AccountId,
    pub operator: AccountId,
    pub user_id: String,
    pub withdraw_to: Option<AccountId>,
    pub paused: bool,
    pub forwarded_total: U128,
    pub forward_count: u64,
    pub available: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    factory: AccountId,
    operator: AccountId,
    user_id: String,
    /// An account the user controls. If set, anyone may trigger `withdraw`
    /// and the full balance goes there — an escape hatch that needs no operator.
    withdraw_to: Option<AccountId>,
    paused: bool,
    forwarded_total: NearToken,
    forward_count: u64,
}

#[near]
impl Contract {
    /// Called either by the factory in the batch that creates a named
    /// sub-account, or by the account itself when it is an implicit (hex)
    /// account: deploy + init + delete-its-only-key in one transaction.
    #[init]
    pub fn new(factory: AccountId, operator: AccountId, user_id: String) -> Self {
        let caller = env::predecessor_account_id();
        require!(
            caller == factory || caller == env::current_account_id(),
            "Only the factory or the account itself can initialise a deposit account"
        );
        Self {
            factory,
            operator,
            user_id,
            withdraw_to: None,
            paused: false,
            forwarded_total: NearToken::from_yoctonear(0),
            forward_count: 0,
        }
    }

    /* ---------- operator ---------- */

    /// Forward `amount` to a swap deposit address for `order_id`.
    pub fn forward(&mut self, to: AccountId, amount: U128, order_id: String) -> Promise {
        self.assert_operator();
        require!(!self.paused, "Deposit account is paused");
        let amount = NearToken::from_yoctonear(amount.0);
        require!(amount.as_yoctonear() > 0, "Amount must be positive");
        let available = self.available_balance();
        require!(
            amount <= available,
            format!("Insufficient balance: {} available", available)
        );
        self.record_forward(&to, amount, order_id);
        Promise::new(to).transfer(amount)
    }

    /// Forward everything above the storage reserve. Returns the amount sent.
    pub fn forward_all(&mut self, to: AccountId, order_id: String) -> Promise {
        self.assert_operator();
        require!(!self.paused, "Deposit account is paused");
        let amount = self.available_balance();
        require!(amount.as_yoctonear() > 0, "Nothing to forward");
        self.record_forward(&to, amount, order_id);
        Promise::new(to).transfer(amount)
    }

    pub fn set_paused(&mut self, paused: bool) {
        require!(
            env::predecessor_account_id() == self.operator
                || env::predecessor_account_id() == self.factory,
            "Only the operator or factory can pause"
        );
        self.paused = paused;
    }

    /* ---------- factory ---------- */

    pub fn set_operator(&mut self, operator: AccountId) {
        self.assert_factory();
        self.operator = operator;
    }

    pub fn set_withdraw_to(&mut self, withdraw_to: Option<AccountId>) {
        self.assert_factory();
        self.withdraw_to = withdraw_to;
    }

    /* ---------- user escape hatch ---------- */

    /// Send the full available balance to the user's own account. Anyone can
    /// call it; the destination is fixed by the factory, so nothing can be stolen.
    pub fn withdraw(&mut self) -> Promise {
        let to = self
            .withdraw_to
            .clone()
            .unwrap_or_else(|| env::panic_str("No withdraw address set for this account"));
        let amount = self.available_balance();
        require!(amount.as_yoctonear() > 0, "Nothing to withdraw");
        Event::Withdraw(vec![WithdrawData {
            user_id: self.user_id.clone(),
            from: env::current_account_id(),
            to: to.clone(),
            amount: U128(amount.as_yoctonear()),
        }])
        .emit();
        Promise::new(to).transfer(amount)
    }

    /* ---------- views ---------- */

    pub fn get_info(&self) -> Info {
        Info {
            factory: self.factory.clone(),
            operator: self.operator.clone(),
            user_id: self.user_id.clone(),
            withdraw_to: self.withdraw_to.clone(),
            paused: self.paused,
            forwarded_total: U128(self.forwarded_total.as_yoctonear()),
            forward_count: self.forward_count,
            available: U128(self.available_balance().as_yoctonear()),
        }
    }

    pub fn get_available(&self) -> U128 {
        U128(self.available_balance().as_yoctonear())
    }

    /* ---------- internals ---------- */

    fn available_balance(&self) -> NearToken {
        let storage_cost = env::storage_byte_cost().saturating_mul(env::storage_usage() as u128);
        let locked = storage_cost.saturating_add(STORAGE_RESERVE);
        env::account_balance().saturating_sub(locked)
    }

    fn record_forward(&mut self, to: &AccountId, amount: NearToken, order_id: String) {
        self.forwarded_total = self.forwarded_total.saturating_add(amount);
        self.forward_count += 1;
        Event::Forward(vec![ForwardData {
            user_id: self.user_id.clone(),
            order_id,
            from: env::current_account_id(),
            to: to.clone(),
            amount: U128(amount.as_yoctonear()),
        }])
        .emit();
    }

    fn assert_operator(&self) {
        require!(
            env::predecessor_account_id() == self.operator,
            "Only the operator can do this"
        );
    }

    fn assert_factory(&self) {
        require!(
            env::predecessor_account_id() == self.factory,
            "Only the factory can do this"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: AccountId, balance: NearToken) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id("u1.paya.testnet".parse().unwrap())
            .predecessor_account_id(predecessor)
            .account_balance(balance)
            .storage_usage(500);
        b
    }

    fn factory() -> AccountId {
        "paya.testnet".parse().unwrap()
    }

    #[test]
    fn only_factory_can_init() {
        testing_env!(ctx(factory(), NearToken::from_near(1)).build());
        let c = Contract::new(factory(), accounts(1), "u1".into());
        assert_eq!(c.get_info().user_id, "u1");
    }

    #[test]
    fn implicit_account_can_init_itself() {
        let hex: AccountId = "a".repeat(64).parse().unwrap();
        let mut b = VMContextBuilder::new();
        b.current_account_id(hex.clone()).predecessor_account_id(hex).account_balance(NearToken::from_near(1));
        testing_env!(b.build());
        let c = Contract::new(factory(), accounts(1), "u1".into());
        assert_eq!(c.get_info().factory, factory());
    }

    #[test]
    #[should_panic(expected = "Only the factory")]
    fn stranger_cannot_init() {
        testing_env!(ctx(accounts(2), NearToken::from_near(1)).build());
        Contract::new(factory(), accounts(1), "u1".into());
    }

    #[test]
    fn operator_forwards_and_logs() {
        testing_env!(ctx(factory(), NearToken::from_near(5)).build());
        let mut c = Contract::new(factory(), accounts(1), "u1".into());
        testing_env!(ctx(accounts(1), NearToken::from_near(5)).build());
        c.forward(accounts(3), U128(NearToken::from_near(1).as_yoctonear()), "ord-1".into());
        let info = c.get_info();
        assert_eq!(info.forward_count, 1);
        assert_eq!(info.forwarded_total.0, NearToken::from_near(1).as_yoctonear());
        let logs = near_sdk::test_utils::get_logs();
        assert!(logs[0].starts_with("EVENT_JSON:"));
        assert!(logs[0].contains("\"order_id\":\"ord-1\""));
    }

    #[test]
    #[should_panic(expected = "Only the operator")]
    fn user_cannot_forward() {
        testing_env!(ctx(factory(), NearToken::from_near(5)).build());
        let mut c = Contract::new(factory(), accounts(1), "u1".into());
        testing_env!(ctx(accounts(2), NearToken::from_near(5)).build());
        c.forward(accounts(3), U128(1), "x".into());
    }

    #[test]
    #[should_panic(expected = "Insufficient balance")]
    fn cannot_overdraw() {
        testing_env!(ctx(factory(), NearToken::from_near(1)).build());
        let mut c = Contract::new(factory(), accounts(1), "u1".into());
        testing_env!(ctx(accounts(1), NearToken::from_near(1)).build());
        c.forward(accounts(3), U128(NearToken::from_near(2).as_yoctonear()), "x".into());
    }

    #[test]
    fn withdraw_goes_only_to_fixed_address() {
        testing_env!(ctx(factory(), NearToken::from_near(2)).build());
        let mut c = Contract::new(factory(), accounts(1), "u1".into());
        c.set_withdraw_to(Some(accounts(4)));
        testing_env!(ctx(accounts(5), NearToken::from_near(2)).build());
        c.withdraw();
        let logs = near_sdk::test_utils::get_logs();
        assert!(logs[0].contains(&format!("\"to\":\"{}\"", accounts(4))));
    }
}
