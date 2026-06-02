use soroban_sdk::{Address, Env, String, Vec};

pub fn submit_outcome(
    env: &Env,
    admin: Address,
    anchor_id: String,
    outcome_hash: String,
    settle_seconds: u64,
    success: bool,
) {
    // v1 simple auth checking. Reverts if invocation wasn't signed by admin.
    admin.require_auth();

    let mut outcomes: Vec<(String, u64, bool)> = env
        .storage()
        .persistent()
        .get(&anchor_id)
        .unwrap_or(Ok(Vec::new(env)))
        .unwrap();

    outcomes.push_back((outcome_hash, settle_seconds, success));
    env.storage().persistent().set(&anchor_id, &outcomes);
}