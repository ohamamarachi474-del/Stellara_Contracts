use soroban_sdk::{
    contracttype, symbol_short, Address, Env, Vec, Symbol, Map, BytesN,
};
use crate::{ReserveError, ReserveAsset};

const CUSTODIAN_REGISTRY: Symbol = symbol_short!("custodian_reg");
const SYNC_HISTORY: Symbol = symbol_short!("sync_history");
const LAST_SYNC: Symbol = symbol_short!("last_sync");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CustodianInfo {
    pub address: Address,
    pub name: Symbol,
    pub api_endpoint: Symbol,
    pub verification_method: VerificationMethod,
    pub is_active: bool,
    pub last_sync: u64,
    pub sync_status: SyncStatus,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VerificationMethod {
    API = 0,
    Manual = 1,
    Oracle = 2,
    MultiSig = 3,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SyncStatus {
    Success = 0,
    Pending = 1,
    Failed = 2,
    Disabled = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SyncOperation {
    pub timestamp: u64,
    pub custodian: Address,
    pub asset_type: crate::AssetType,
    pub old_amount: u128,
    pub new_amount: u128,
    pub verification_hash: BytesN<32>,
    pub status: SyncStatus,
    pub error_message: Option<Symbol>,
}

pub fn register_custodian(
    env: Env,
    address: Address,
    name: Symbol,
    api_endpoint: Symbol,
    verification_method: VerificationMethod,
) -> Result<(), ReserveError> {
    // Check governance authorization
    if !shared::governance::has_role(env.clone(), env.invoker(), shared::governance::GovernanceRole::Admin) {
        return Err(ReserveError::Unauthorized);
    }
    
    let custodian_info = CustodianInfo {
        address: address.clone(),
        name,
        api_endpoint,
        verification_method,
        is_active: true,
        last_sync: 0,
        sync_status: SyncStatus::Pending,
    };
    
    // Store in registry
    let mut registry = env.storage().instance().get(&CUSTODIAN_REGISTRY)
        .unwrap_or(Map::<Address, CustodianInfo>::new(&env));
    
    registry.set(address, custodian_info);
    env.storage().instance().set(&CUSTODIAN_REGISTRY, &registry);
    
    // Log registration
    env.events().publish(
        (symbol_short!("custodian"), symbol_short!("registered")),
        (address, verification_method),
    );
    
    Ok(())
}

pub fn sync_with_custodian(env: Env, custodian: Address) -> Result<(), ReserveError> {
    let now = env.ledger().timestamp();
    
    // Get custodian info
    let registry = env.storage().instance().get(&CUSTODIAN_REGISTRY)
        .ok_or(ReserveError::CustodianError)?;
    
    let custodian_info = registry.get(custodian.clone())
        .ok_or(ReserveError::CustodianError)?;
    
    if !custodian_info.is_active {
        return Err(ReserveError::CustodianError);
    }
    
    // Perform sync based on verification method
    let sync_result = match custodian_info.verification_method {
        VerificationMethod::API => sync_via_api(env.clone(), &custodian_info)?,
        VerificationMethod::Manual => sync_via_manual(env.clone(), &custodian_info)?,
        VerificationMethod::Oracle => sync_via_oracle(env.clone(), &custodian_info)?,
        VerificationMethod::MultiSig => sync_via_multisig(env.clone(), &custodian_info)?,
    };
    
    // Record sync operation
    record_sync_operation(env.clone(), sync_result)?;
    
    // Update custodian info
    let mut updated_info = custodian_info;
    updated_info.last_sync = now;
    updated_info.sync_status = sync_result.status;
    
    let mut registry = env.storage().instance().get(&CUSTODIAN_REGISTRY)
        .unwrap_or(Map::<Address, CustodianInfo>::new(&env));
    registry.set(custodian, updated_info);
    env.storage().instance().set(&CUSTODIAN_REGISTRY, &registry);
    
    // Update last sync timestamp
    env.storage().instance().set(&LAST_SYNC, &now);
    
    // Log sync
    env.events().publish(
        (symbol_short!("custodian"), symbol_short!("synced")),
        (custodian, sync_result.status),
    );
    
    Ok(())
}

pub fn get_custodian_info(env: Env, custodian: Address) -> Result<CustodianInfo, ReserveError> {
    let registry = env.storage().instance().get(&CUSTODIAN_REGISTRY)
        .ok_or(ReserveError::CustodianError)?;
    
    registry.get(custodian).ok_or(ReserveError::CustodianError)
}

pub fn get_all_custodians(env: Env) -> Result<Vec<CustodianInfo>, ReserveError> {
    let registry = env.storage().instance().get(&CUSTODIAN_REGISTRY)
        .ok_or(ReserveError::CustodianError)?;
    
    let mut custodians: Vec<CustodianInfo> = Vec::new(&env);
    for (_, custodian_info) in registry.iter() {
        custodians.push_back(custodian_info);
    }
    
    Ok(custodians)
}

pub fn get_sync_history(env: Env, custodian: Option<Address>) -> Result<Vec<SyncOperation>, ReserveError> {
    let sync_history = env.storage().instance().get(&SYNC_HISTORY)
        .unwrap_or(Vec::<SyncOperation>::new(&env));
    
    if let Some(custodian_addr) = custodian {
        let mut filtered_history: Vec<SyncOperation> = Vec::new(&env);
        for operation in sync_history.iter() {
            if operation.custodian == custodian_addr {
                filtered_history.push_back(operation);
            }
        }
        Ok(filtered_history)
    } else {
        Ok(sync_history)
    }
}

pub fn deactivate_custodian(env: Env, custodian: Address) -> Result<(), ReserveError> {
    // Check governance authorization
    if !shared::governance::has_role(env.clone(), env.invoker(), shared::governance::GovernanceRole::Admin) {
        return Err(ReserveError::Unauthorized);
    }
    
    let mut registry = env.storage().instance().get(&CUSTODIAN_REGISTRY)
        .ok_or(ReserveError::CustodianError)?;
    
    let mut custodian_info = registry.get(custodian.clone())
        .ok_or(ReserveError::CustodianError)?;
    
    custodian_info.is_active = false;
    custodian_info.sync_status = SyncStatus::Disabled;
    
    registry.set(custodian, custodian_info);
    env.storage().instance().set(&CUSTODIAN_REGISTRY, &registry);
    
    // Log deactivation
    env.events().publish(
        (symbol_short!("custodian"), symbol_short!("deactivated")),
        custodian,
    );
    
    Ok(())
}

fn sync_via_api(env: Env, custodian_info: &CustodianInfo) -> Result<SyncOperation, ReserveError> {
    // In a real implementation, this would make HTTP calls to the custodian's API
    // For demonstration, we'll simulate the API response
    
    let assets = env.storage().instance().get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;
    
    // Find assets held by this custodian
    for asset in assets.iter() {
        if asset.custodian == custodian_info.address {
            // Simulate API call to get current balance
            let new_amount = simulate_api_call(env.clone(), custodian_info, asset.asset_type)?;
            let verification_hash = generate_verification_hash(env.clone(), &new_amount);
            
            return Ok(SyncOperation {
                timestamp: env.ledger().timestamp(),
                custodian: custodian_info.address,
                asset_type: asset.asset_type,
                old_amount: asset.amount,
                new_amount,
                verification_hash,
                status: SyncStatus::Success,
                error_message: None,
            });
        }
    }
    
    Err(ReserveError::CustodianError)
}

fn sync_via_manual(env: Env, custodian_info: &CustodianInfo) -> Result<SyncOperation, ReserveError> {
    // Manual sync requires admin to provide verification
    // This would typically involve off-chain verification and on-chain confirmation
    
    let assets = env.storage().instance().get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;
    
    for asset in assets.iter() {
        if asset.custodian == custodian_info.address {
            return Ok(SyncOperation {
                timestamp: env.ledger().timestamp(),
                custodian: custodian_info.address,
                asset_type: asset.asset_type,
                old_amount: asset.amount,
                new_amount: asset.amount, // No change in manual sync
                verification_hash: asset.verification_hash,
                status: SyncStatus::Success,
                error_message: None,
            });
        }
    }
    
    Err(ReserveError::CustodianError)
}

fn sync_via_oracle(env: Env, custodian_info: &CustodianInfo) -> Result<SyncOperation, ReserveError> {
    // Oracle-based sync would use price oracles to verify asset values
    // This is more complex and would involve oracle integration
    
    let assets = env.storage().instance().get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;
    
    for asset in assets.iter() {
        if asset.custodian == custodian_info.address {
            // Simulate oracle verification
            let oracle_verified_amount = simulate_oracle_verification(env.clone(), asset)?;
            let verification_hash = generate_verification_hash(env.clone(), &oracle_verified_amount);
            
            return Ok(SyncOperation {
                timestamp: env.ledger().timestamp(),
                custodian: custodian_info.address,
                asset_type: asset.asset_type,
                old_amount: asset.amount,
                new_amount: oracle_verified_amount,
                verification_hash,
                status: SyncStatus::Success,
                error_message: None,
            });
        }
    }
    
    Err(ReserveError::CustodianError)
}

fn sync_via_multisig(env: Env, custodian_info: &CustodianInfo) -> Result<SyncOperation, ReserveError> {
    // Multi-sig verification would require multiple signers to confirm balances
    // This is the most secure method but also the most complex
    
    let assets = env.storage().instance().get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;
    
    for asset in assets.iter() {
        if asset.custodian == custodian_info.address {
            // Simulate multi-sig verification
            let multisig_verified_amount = simulate_multisig_verification(env.clone(), asset)?;
            let verification_hash = generate_verification_hash(env.clone(), &multisig_verified_amount);
            
            return Ok(SyncOperation {
                timestamp: env.ledger().timestamp(),
                custodian: custodian_info.address,
                asset_type: asset.asset_type,
                old_amount: asset.amount,
                new_amount: multisig_verified_amount,
                verification_hash,
                status: SyncStatus::Success,
                error_message: None,
            });
        }
    }
    
    Err(ReserveError::CustodianError)
}

fn simulate_api_call(env: Env, custodian_info: &CustodianInfo, asset_type: crate::AssetType) -> Result<u128, ReserveError> {
    // Simulate different API responses based on custodian and asset type
    match asset_type {
        crate::AssetType::USD => Ok(1_000_000_000_000u128), // $1M
        crate::AssetType::Treasury => Ok(750_000_000_000u128), // $750K
        crate::AssetType::Repo => Ok(500_000_000_000u128), // $500K
        crate::AssetType::CorporateBond => Ok(250_000_000_000u128), // $250K
        crate::AssetType::ETF => Ok(100_000_000_000u128), // $100K
    }
}

fn simulate_oracle_verification(env: Env, asset: &ReserveAsset) -> Result<u128, ReserveError> {
    // Simulate oracle verification with small price adjustments
    let adjustment = match asset.asset_type {
        crate::AssetType::USD => 0,
        crate::AssetType::Treasury => asset.amount / 1000, // 0.1% adjustment
        crate::AssetType::Repo => asset.amount / 2000, // 0.05% adjustment
        crate::AssetType::CorporateBond => asset.amount / 500, // 0.2% adjustment
        crate::AssetType::ETF => asset.amount / 1000, // 0.1% adjustment
    };
    
    Ok(asset.amount + adjustment)
}

fn simulate_multisig_verification(env: Env, asset: &ReserveAsset) -> Result<u128, ReserveError> {
    // Simulate multi-sig verification (most conservative)
    Ok(asset.amount) // No change, just verification
}

fn generate_verification_hash(env: Env, amount: &u128) -> BytesN<32> {
    let data = (*amount, env.ledger().timestamp());
    let hash = env.crypto().keccak256(&data.to_xdr());
    BytesN::from_array(&env, &hash)
}

fn record_sync_operation(env: Env, operation: SyncOperation) -> Result<(), ReserveError> {
    let mut sync_history = env.storage().instance().get(&SYNC_HISTORY)
        .unwrap_or(Vec::<SyncOperation>::new(&env));
    
    sync_history.push_back(operation);
    
    // Keep only last 1000 sync operations
    while sync_history.len() > 1000 {
        sync_history.pop_front();
    }
    
    env.storage().instance().set(&SYNC_HISTORY, &sync_history);
    Ok(())
}
