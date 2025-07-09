// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library ErrorLibrary {
    error APY_EXCEEDS_MAX_BASIS_POINTS();
    error DURATION_MUST_BE_GREATER_THAN_ZERO();
    error INVALID_AMOUNT();
    error LOCK_PERIOD_NOT_ACTIVE();
    error STAKE_NOT_FOUND();
    error LOCK_PERIOD_NOT_ENDED();
    error NO_REWARDS_TO_CLAIM();
    error INVALID_STAKING_CONTRACT();
    error INVALID_TOKEN();
    error INVALID_ADDRESS();
    error INVALID_ARRAY_LENGTH();
}
