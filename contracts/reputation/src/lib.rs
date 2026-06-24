#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, String};

pub mod outcome;

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    pub fn submit_outcome(
        env: Env,
        admin: Address,
        anchor_id: String,
        outcome_hash: String,
        settle_seconds: u64,
        success: bool,
    ) {
        outcome::submit_outcome(&env, admin, anchor_id, outcome_hash, settle_seconds, success);
    }
}