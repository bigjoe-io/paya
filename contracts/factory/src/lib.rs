//! Paya factory.
//!
//! Lives at `paya.near` (or `paya.testnet`). Creates one deposit account per
//! user — `<user_id>.paya.near` — and keeps the registry. The deposit code is
//! either a global contract (mainnet: published once, referenced by account
//! id, upgradable in one step) or the wasm embedded in this binary (testnet /
//! local: no global-contract burn).

use near_sdk::json_types::U128;
use near_sdk::serde::Serialize;
use near_sdk::store::IterableMap;
use near_sdk::{
    env, near, require, serde_json::json, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError,
};

/// Embedded deposit contract. Built first with `cargo near build` in
/// `../deposit`, then copied to `res/deposit.wasm` (see contracts/README.md).
const DEPOSIT_WASM: &[u8] = include_bytes!("../res/deposit.wasm");

/// NEAR sent to each new deposit account on top of its code storage: covers
/// account + state storage and leaves the reserve the deposit contract keeps.
const STATE_ALLOWANCE: NearToken = NearToken::from_millinear(50);
const GAS_INIT: Gas = Gas::from_tgas(20);
const GAS_CALLBACK: Gas = Gas::from_tgas(10);

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct AccountCreatedData {
    pub user_id: String,
    pub account_id: AccountId,
}

#[near(event_json(standard = "paya"))]
pub enum Event {
    #[event_version("1.0.0")]
    AccountCreated(Vec<AccountCreatedData>),
}

#[near(serializers = [json])]
pub struct Config {
    pub owner: AccountId,
    pub operator: AccountId,
    pub global_contract_id: Option<AccountId>,
    pub account_count: u32,
    pub initial_balance: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    operator: AccountId,
    global_contract_id: Option<AccountId>,
    accounts: IterableMap<String, AccountId>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, operator: AccountId, global_contract_id: Option<AccountId>) -> Self {
        Self {
            owner,
            operator,
            global_contract_id,
            accounts: IterableMap::new(b"a"),
        }
    }

    /// Create `<user_id>.<factory>` with the deposit contract. Operator or owner
    /// only. The factory pays the initial balance; top it up as users join.
    pub fn create_deposit_account(&mut self, user_id: String) -> Promise {
        self.assert_operator_or_owner();
        require!(is_valid_user_id(&user_id), "user_id must be 2-32 chars of a-z, 0-9, '-' or '_'");
        require!(!self.accounts.contains_key(&user_id), "Account already exists for this user");

        let account_id: AccountId = format!("{}.{}", user_id, env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("Resulting account id is invalid"));

        let init_args = json!({
            "factory": env::current_account_id(),
            "operator": self.operator,
            "user_id": user_id,
        })
        .to_string()
        .into_bytes();

        let initial = self.initial_balance();
        require!(
            env::account_balance() >= initial.saturating_add(NearToken::from_near(1)),
            "Factory balance too low to fund a new deposit account; top it up"
        );
        let mut p = Promise::new(account_id.clone())
            .create_account()
            .transfer(initial);
        p = match &self.global_contract_id {
            Some(global) => p.use_global_contract_by_account_id(global.clone()),
            None => p.deploy_contract(DEPOSIT_WASM.to_vec()),
        };
        p.function_call("new".to_string(), init_args, NearToken::from_yoctonear(0), GAS_INIT)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_account_created(user_id, account_id),
            )
    }

    #[private]
    pub fn on_account_created(
        &mut self,
        user_id: String,
        account_id: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> Option<AccountId> {
        match result {
            Ok(()) => {
                self.accounts.insert(user_id.clone(), account_id.clone());
                Event::AccountCreated(vec![AccountCreatedData { user_id, account_id: account_id.clone() }])
                    .emit();
                Some(account_id)
            }
            Err(e) => {
                env::log_str(&format!("Failed to create deposit account for {user_id}: {e:?}"));
                None
            }
        }
    }

    /// Let a user reclaim funds without the operator: fix the only address
    /// their deposit account can `withdraw` to.
    pub fn set_withdraw_to(&mut self, user_id: String, withdraw_to: Option<AccountId>) -> Promise {
        self.assert_operator_or_owner();
        let account = self.account_of(&user_id);
        Promise::new(account).function_call(
            "set_withdraw_to".to_string(),
            json!({ "withdraw_to": withdraw_to }).to_string().into_bytes(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(10),
        )
    }

    pub fn set_account_paused(&mut self, user_id: String, paused: bool) -> Promise {
        self.assert_operator_or_owner();
        let account = self.account_of(&user_id);
        Promise::new(account).function_call(
            "set_paused".to_string(),
            json!({ "paused": paused }).to_string().into_bytes(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(10),
        )
    }

    /* ---------- owner ---------- */

    pub fn set_operator(&mut self, operator: AccountId) {
        self.assert_owner();
        self.operator = operator;
    }

    pub fn set_global_contract_id(&mut self, global_contract_id: Option<AccountId>) {
        self.assert_owner();
        self.global_contract_id = global_contract_id;
    }

    /* ---------- views ---------- */

    pub fn get_account(&self, user_id: String) -> Option<AccountId> {
        self.accounts.get(&user_id).cloned()
    }

    pub fn get_accounts(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<(String, AccountId)> {
        self.accounts
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50) as usize)
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    pub fn get_config(&self) -> Config {
        Config {
            owner: self.owner.clone(),
            operator: self.operator.clone(),
            global_contract_id: self.global_contract_id.clone(),
            account_count: self.accounts.len(),
            initial_balance: U128(self.initial_balance().as_yoctonear()),
        }
    }

    /* ---------- internals ---------- */

    /// With a global contract the account only stores a reference; with the
    /// embedded wasm it must also pay for the code bytes it holds.
    fn initial_balance(&self) -> NearToken {
        match self.global_contract_id {
            Some(_) => STATE_ALLOWANCE,
            None => env::storage_byte_cost()
                .saturating_mul(DEPOSIT_WASM.len() as u128)
                .saturating_add(STATE_ALLOWANCE),
        }
    }

    fn account_of(&self, user_id: &str) -> AccountId {
        self.accounts
            .get(user_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Unknown user"))
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner can do this");
    }

    fn assert_operator_or_owner(&self) {
        let p = env::predecessor_account_id();
        require!(p == self.operator || p == self.owner, "Only the operator or owner can do this");
    }
}

fn is_valid_user_id(id: &str) -> bool {
    (2..=32).contains(&id.len())
        && id.bytes().all(|c| matches!(c, b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_'))
        && !id.starts_with(['-', '_'])
        && !id.ends_with(['-', '_'])
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id("paya.testnet".parse().unwrap())
            .predecessor_account_id(predecessor)
            .account_balance(NearToken::from_near(10));
        b
    }

    #[test]
    fn user_id_rules() {
        assert!(is_valid_user_id("joseph"));
        assert!(is_valid_user_id("ada-01"));
        assert!(!is_valid_user_id("a"));
        assert!(!is_valid_user_id("Joseph"));
        assert!(!is_valid_user_id("-x"));
        assert!(!is_valid_user_id("x."));
    }

    #[test]
    fn callback_registers_account() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = Contract::new(accounts(0), accounts(1), None);
        testing_env!(ctx("paya.testnet".parse().unwrap()).build());
        let acc: AccountId = "joseph.paya.testnet".parse().unwrap();
        let r = c.on_account_created("joseph".into(), acc.clone(), Ok(()));
        assert_eq!(r, Some(acc.clone()));
        assert_eq!(c.get_account("joseph".into()), Some(acc));
        assert_eq!(c.get_config().account_count, 1);
    }

    #[test]
    #[should_panic(expected = "Only the operator or owner")]
    fn stranger_cannot_create() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = Contract::new(accounts(0), accounts(1), None);
        testing_env!(ctx(accounts(2)).build());
        c.create_deposit_account("joseph".into());
    }
}
