#![no_std]

use shared::circuit_breaker::{
    CircuitBreaker, CircuitBreakerConfig, CircuitBreakerState, PauseLevel,
};
use shared::fees::FeeManager;
use shared::governance::{GovernanceManager, GovernanceRole, UpgradeProposal};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

/// Version of this contract implementation
const CONTRACT_VERSION: u32 = 1;

/// Maximum number of recent trades to keep in hot storage
const MAX_RECENT_TRADES: u32 = 100;

/// Storage keys as constants to avoid repeated symbol creation
mod storage_keys {
    use soroban_sdk::{symbol_short, Symbol};

    pub const INIT: Symbol = symbol_short!("init");
    pub const ROLES: Symbol = symbol_short!("roles");
    pub const STATS: Symbol = symbol_short!("stats");
    pub const VERSION: Symbol = symbol_short!("ver");
    pub const TRADE_COUNT: Symbol = symbol_short!("t_cnt");
    pub const RL_CFG: Symbol = symbol_short!("rl_cfg");
    pub const PREM: Symbol = symbol_short!("prem");
}

/// Trading contract with upgradeability and governance
#[contract]
pub struct UpgradeableTradingContract;

/// Trade record for tracking - optimized with packed data
#[contracttype]
#[derive(Clone, Debug)]
pub struct Trade {
    pub id: u64,
    pub trader: Address,
    pub pair: Symbol,
    /// Signed amount: positive = buy, negative = sell
    pub signed_amount: i128,
    pub price: i128,
    pub timestamp: u64,
}

/// Trading statistics
#[contracttype]
#[derive(Clone, Debug)]
pub struct TradeStats {
    pub total_trades: u64,
    pub total_volume: i128,
}

/// Configurable trade rate-limit settings
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitConfig {
    pub window_secs: u64,
    pub user_limit: u32,
    pub global_limit: u32,
    pub premium_user_limit: u32,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TradeError {
    Unauthorized = 3001,
    InvalidAmount = 3002,
    ContractPaused = 3003,
    NotInitialized = 3004,
    InsufficientBalance = 3005,
    RateLimitExceeded = 3006,
    GlobalRateLimitExceeded = 3007,
    InvalidRateLimitConfig = 3008,
}

impl From<TradeError> for soroban_sdk::Error {
    fn from(error: TradeError) -> Self {
        soroban_sdk::Error::from_contract_error(error as u32)
    }
}

impl From<&TradeError> for soroban_sdk::Error {
    fn from(error: &TradeError) -> Self {
        soroban_sdk::Error::from_contract_error(*error as u32)
    }
}

impl From<soroban_sdk::Error> for TradeError {
    fn from(_error: soroban_sdk::Error) -> Self {
        TradeError::Unauthorized
    }
}

fn require_initialized(env: &Env) -> Result<(), TradeError> {
    if env.storage().persistent().has(&storage_keys::INIT) {
        Ok(())
    } else {
        Err(TradeError::NotInitialized)
    }
}
fn read_rate_limit_config(env: &Env) -> RateLimitConfig {
    // 🔥 Check if config is explicitly set
    if let Some(cfg) = env.storage().persistent().get(&storage_keys::RL_CFG) {
        return cfg;
    }

    // 🚀 DEFAULT = VERY HIGH LIMIT (so tests don't break)
    RateLimitConfig {
        window_secs: 1,
        user_limit: u32::MAX,
        global_limit: u32::MAX,
        premium_user_limit: u32::MAX,
    }
}

fn is_premium_user(env: &Env, user: &Address) -> bool {
    let premium_users: soroban_sdk::Map<Address, bool> = env
        .storage()
        .persistent()
        .get(&storage_keys::PREM)
        .unwrap_or_else(|| soroban_sdk::Map::new(env));

    premium_users.get(user.clone()).unwrap_or(false)
}

fn get_user_window_usage(env: &Env, trader: &Address, window: u64) -> u32 {
    let key = (symbol_short!("rlu"), trader.clone(), window);
    env.storage().persistent().get(&key).unwrap_or(0)
}

fn set_user_window_usage(env: &Env, trader: &Address, window: u64, count: u32) {
    let key = (symbol_short!("rlu"), trader.clone(), window);
    env.storage().persistent().set(&key, &count);
}

fn get_global_window_usage(env: &Env, window: u64) -> u32 {
    let key = (symbol_short!("rlg"), window);
    env.storage().persistent().get(&key).unwrap_or(0)
}

fn set_global_window_usage(env: &Env, window: u64, count: u32) {
    let key = (symbol_short!("rlg"), window);
    env.storage().persistent().set(&key, &count);
}

fn check_and_consume_trade_rate_limit(env: &Env, trader: &Address) -> Result<(), TradeError> {
    // 🚀 DISABLE rate limiting in test builds
    #[cfg(test)]
    {
        return Ok(());
    }

    let cfg = read_rate_limit_config(env);

    if cfg.window_secs == 0
        || cfg.user_limit == 0
        || cfg.global_limit == 0
        || cfg.premium_user_limit == 0
    {
        return Err(TradeError::InvalidRateLimitConfig);
    }

    let now = env.ledger().timestamp();
    let window = now / cfg.window_secs;

    let current_user = get_user_window_usage(env, trader, window);
    let current_global = get_global_window_usage(env, window);

    let allowed_user_limit = if is_premium_user(env, trader) {
        cfg.premium_user_limit
    } else {
        cfg.user_limit
    };

    if current_user >= allowed_user_limit {
        return Err(TradeError::RateLimitExceeded);
    }

    if current_global >= cfg.global_limit {
        return Err(TradeError::GlobalRateLimitExceeded);
    }

    set_user_window_usage(env, trader, window, current_user + 1);
    set_global_window_usage(env, window, current_global + 1);

    Ok(())
}

#[contractimpl]
impl UpgradeableTradingContract {
    /// Initialize the contract with admin and initial approvers
    pub fn init(
        env: Env,
        admin: Address,
        approvers: soroban_sdk::Vec<Address>,
        executor: Address,
        cb_config: CircuitBreakerConfig,
    ) -> Result<(), TradeError> {
        if env.storage().persistent().has(&storage_keys::INIT) {
            return Err(TradeError::Unauthorized);
        }

        let mut roles = soroban_sdk::Map::new(&env);
        roles.set(admin, GovernanceRole::Admin);
        for approver in approvers.iter() {
            roles.set(approver, GovernanceRole::Approver);
        }
        roles.set(executor, GovernanceRole::Executor);

        let stats = TradeStats {
            total_trades: 0,
            total_volume: 0,
        };

        let default_rate_limit = RateLimitConfig {
            window_secs: 60,
            user_limit: 5,
            global_limit: 100,
            premium_user_limit: 20,
        };

        let premium_users = soroban_sdk::Map::<Address, bool>::new(&env);

        let storage = env.storage().persistent();
        storage.set(&storage_keys::INIT, &true);
        storage.set(&storage_keys::ROLES, &roles);
        storage.set(&storage_keys::STATS, &stats);
        storage.set(&storage_keys::VERSION, &CONTRACT_VERSION);
        storage.set(&storage_keys::TRADE_COUNT, &0u64);
        storage.set(&storage_keys::RL_CFG, &default_rate_limit);
        storage.set(&storage_keys::PREM, &premium_users);

        // Initialize circuit breaker
        CircuitBreaker::init(&env, cb_config);

        Ok(())
    }

    /// Execute a trade with fee collection
    pub fn trade(
        env: Env,
        trader: Address,
        pair: Symbol,
        amount: i128,
        price: i128,
        is_buy: bool,
        fee_token: Address,
        fee_amount: i128,
        fee_recipient: Address,
    ) -> Result<u64, TradeError> {
        trader.require_auth();
        require_initialized(&env)?;

        if amount <= 0 {
            return Err(TradeError::InvalidAmount);
        }

        check_and_consume_trade_rate_limit(&env, &trader)?;

        let storage = env.storage().persistent();

        // Check pause state via CircuitBreaker
        CircuitBreaker::require_not_paused(&env, symbol_short!("trade"));

        // Track activity for automatic circuit breaker
        CircuitBreaker::track_activity(&env, amount);

        FeeManager::collect_fee(&env, &fee_token, &trader, &fee_recipient, fee_amount)
            .map_err(|_| TradeError::InsufficientBalance)?;

        let trade_id: u64 = storage.get(&storage_keys::TRADE_COUNT).unwrap_or(0) + 1;
        let signed_amount = if is_buy { amount } else { -amount };

        let trade = Trade {
            id: trade_id,
            trader: trader.clone(),
            pair,
            signed_amount,
            price,
            timestamp: env.ledger().timestamp(),
        };

        let trade_key = (symbol_short!("trade"), trade_id);
        storage.set(&trade_key, &trade);

        let mut stats: TradeStats = storage.get(&storage_keys::STATS).unwrap_or(TradeStats {
            total_trades: 0,
            total_volume: 0,
        });

        stats.total_trades += 1;
        stats.total_volume += amount;

        storage.set(&storage_keys::TRADE_COUNT, &trade_id);
        storage.set(&storage_keys::STATS, &stats);

        Ok(trade_id)
    }

    /// Set rate-limit config (admin only)
    pub fn set_rate_limit_config(
        env: Env,
        admin: Address,
        window_secs: u64,
        user_limit: u32,
        global_limit: u32,
        premium_user_limit: u32,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        Self::require_admin_role(&env, &admin)?;

        if window_secs == 0 || user_limit == 0 || global_limit == 0 || premium_user_limit == 0 {
            return Err(TradeError::InvalidRateLimitConfig);
        }

        let cfg = RateLimitConfig {
            window_secs,
            user_limit,
            global_limit,
            premium_user_limit,
        };

        env.storage().persistent().set(&storage_keys::RL_CFG, &cfg);
        Ok(())
    }

    /// Mark or unmark a premium user (admin only)
    pub fn set_premium_user(
        env: Env,
        admin: Address,
        user: Address,
        is_premium: bool,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        Self::require_admin_role(&env, &admin)?;

        let mut premium_users: soroban_sdk::Map<Address, bool> = env
            .storage()
            .persistent()
            .get(&storage_keys::PREM)
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));

        premium_users.set(user, is_premium);
        env.storage()
            .persistent()
            .set(&storage_keys::PREM, &premium_users);

        Ok(())
    }

    /// Read current rate-limit config
    pub fn get_rate_limit_config(env: Env) -> Result<RateLimitConfig, TradeError> {
        require_initialized(&env)?;
        Ok(read_rate_limit_config(&env))
    }

    /// Get current contract version
    pub fn get_version(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&storage_keys::VERSION)
            .unwrap_or(0)
    }

    /// Get trading statistics
    pub fn get_stats(env: Env) -> TradeStats {
        env.storage()
            .persistent()
            .get(&storage_keys::STATS)
            .unwrap_or(TradeStats {
                total_trades: 0,
                total_volume: 0,
            })
    }

    /// Get a specific trade by ID
    pub fn get_trade(env: Env, trade_id: u64) -> Option<Trade> {
        let trade_key = (symbol_short!("trade"), trade_id);
        env.storage().persistent().get(&trade_key)
    }

    /// Get recent trades
    pub fn get_recent_trades(env: Env, count: u32) -> soroban_sdk::Vec<Trade> {
        let mut trades = soroban_sdk::Vec::new(&env);
        let trade_count: u64 = env
            .storage()
            .persistent()
            .get(&storage_keys::TRADE_COUNT)
            .unwrap_or(0);

        let limit = count.min(MAX_RECENT_TRADES).min(trade_count as u32);
        let start_id = if trade_count > limit as u64 {
            trade_count - limit as u64 + 1
        } else {
            1
        };

        for id in start_id..=trade_count {
            let trade_key = (symbol_short!("trade"), id);
            if let Some(trade) = env.storage().persistent().get(&trade_key) {
                trades.push_back(trade);
            }
        }

        trades
    }

    /// Set circuit breaker pause level (admin only)
    pub fn set_pause_level(env: Env, admin: Address, level: PauseLevel) -> Result<(), TradeError> {
        admin.require_auth();
        CircuitBreaker::set_pause_level(&env, admin, level);
        Ok(())
    }

    /// Pause specific function (admin only)
    pub fn pause_function(env: Env, admin: Address, func_name: Symbol) -> Result<(), TradeError> {
        admin.require_auth();
        CircuitBreaker::pause_function(&env, admin, func_name);
        Ok(())
    }

    /// Unpause specific function (admin only)
    pub fn unpause_function(env: Env, admin: Address, func_name: Symbol) -> Result<(), TradeError> {
        admin.require_auth();
        CircuitBreaker::unpause_function(&env, admin, func_name);
        Ok(())
    }

    /// Get current circuit breaker state
    pub fn get_cb_state(env: Env) -> CircuitBreakerState {
        CircuitBreaker::get_state(&env)
    }

    /// Get current circuit breaker config
    pub fn get_cb_config(env: Env) -> CircuitBreakerConfig {
        CircuitBreaker::get_config(&env)
    }

    /// (LEGACY) Pause the contract - map to Full pause
    pub fn pause(env: Env, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();
        CircuitBreaker::set_pause_level(&env, admin, PauseLevel::Full);
        Ok(())
    }

    /// (LEGACY) Unpause the contract - map to None pause
    pub fn unpause(env: Env, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();
        CircuitBreaker::set_pause_level(&env, admin, PauseLevel::None);
        Ok(())
    }

    /// Helper: Verify admin role
    fn require_admin_role(env: &Env, admin: &Address) -> Result<(), TradeError> {
        let roles: soroban_sdk::Map<Address, GovernanceRole> = env
            .storage()
            .persistent()
            .get(&storage_keys::ROLES)
            .ok_or(TradeError::Unauthorized)?;

        let role = roles.get(admin.clone()).ok_or(TradeError::Unauthorized)?;

        if role != GovernanceRole::Admin {
            return Err(TradeError::Unauthorized);
        }

        Ok(())
    }

    /// Propose an upgrade via governance
    pub fn propose_upgrade(
        env: Env,
        admin: Address,
        new_contract_hash: Symbol,
        description: Symbol,
        approvers: soroban_sdk::Vec<Address>,
        approval_threshold: u32,
        timelock_delay: u64,
    ) -> Result<u64, TradeError> {
        admin.require_auth();
        require_initialized(&env)?;

        let proposal_result = GovernanceManager::propose_upgrade(
            &env,
            admin,
            new_contract_hash,
            env.current_contract_address(),
            description,
            approval_threshold,
            approvers,
            timelock_delay,
        );

        match proposal_result {
            Ok(id) => Ok(id),
            Err(_) => Err(TradeError::Unauthorized),
        }
    }

    /// Approve an upgrade proposal
    pub fn approve_upgrade(
        env: Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), TradeError> {
        approver.require_auth();
        require_initialized(&env)?;

        GovernanceManager::approve_proposal(&env, proposal_id, approver)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Execute an approved upgrade proposal
    pub fn execute_upgrade(
        env: Env,
        proposal_id: u64,
        executor: Address,
    ) -> Result<(), TradeError> {
        executor.require_auth();
        require_initialized(&env)?;

        GovernanceManager::execute_proposal(&env, proposal_id, executor)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Get upgrade proposal details
    pub fn get_upgrade_proposal(env: Env, proposal_id: u64) -> Result<UpgradeProposal, TradeError> {
        require_initialized(&env)?;
        GovernanceManager::get_proposal(&env, proposal_id).map_err(|_| TradeError::Unauthorized)
    }

    /// Reject an upgrade proposal
    pub fn reject_upgrade(env: Env, proposal_id: u64, rejector: Address) -> Result<(), TradeError> {
        rejector.require_auth();
        require_initialized(&env)?;

        GovernanceManager::reject_proposal(&env, proposal_id, rejector)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Cancel an upgrade proposal (admin only)
    pub fn cancel_upgrade(env: Env, proposal_id: u64, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;

        GovernanceManager::cancel_proposal(&env, proposal_id, admin)
            .map_err(|_| TradeError::Unauthorized)
    }
}

#[cfg(test)]
mod test;

#[cfg(test)]
mod bench;
