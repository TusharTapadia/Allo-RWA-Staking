// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IStakingRewardVault} from "./IStakingRewardVault.sol";

interface IAlloStaking {
    enum LockPeriod {
        ONE_DAY,
        ONE_WEEK,
        ONE_MONTH,
        SIX_MONTHS,
        ONE_YEAR
    }

    struct LockPeriodConfig {
        uint256 apyBasisPoints;
        uint256 lockDuration;
        bool isActive;
    }

    struct UserStakingInfo {
        uint256 stakedAmount;
        LockPeriod lockPeriod;
        uint256 lockStart;
        uint256 lockEnd;
        uint256 accumulatedReward;
        uint256 lastRewardCalculation;
    }

    // Events
    event LockPeriodAPYUpdated(LockPeriod indexed lockPeriod, uint256 oldAPY, uint256 newAPY);
    event LockPeriodDurationUpdated(LockPeriod indexed lockPeriod, uint256 oldDuration, uint256 newDuration);
    event LockPeriodStatusUpdated(LockPeriod indexed lockPeriod, bool isActive);
    event Staked(address indexed user, uint256 indexed stakeId, uint256 amount, LockPeriod lockPeriod);
    event Unstaked(address indexed user, uint256 indexed stakeId, uint256 amount);
    event RewardClaimed(address indexed user, uint256 indexed stakeId, uint256 amount);

    // State variables
    function BASIS_POINTS() external view returns (uint256);
    function token() external view returns (IERC20);
    function stakingToken() external view returns (IERC20);
    function stakeId() external view returns (uint256);
    function stakingRewardVault() external view returns (IStakingRewardVault);
    function lockPeriodConfigs(LockPeriod) external view returns (LockPeriodConfig memory);
    function userStakingInfo(address, uint256) external view returns (UserStakingInfo memory);

    // Core functions
    function initialize(
        address _token,
        address _stakingToken,
        address _stakingRewardVault
    ) external;

    function stake(uint256 amount, LockPeriod lockPeriod) external;

    function unstake(uint256 _stakeId) external;

    function claimReward(uint256 _stakeId) external;

    // View functions
    function getUserStake(address user, uint256 _stakeId) external view returns (
        uint256 stakedAmount,
        LockPeriod lockPeriod,
        uint256 lockStart,
        uint256 lockEnd,
        uint256 accumulatedReward
    );

    function getLockPeriodConfig(LockPeriod lockPeriod) external view returns (
        uint256 apyBasisPoints,
        uint256 lockDuration,
        bool isActive
    );

    function getAllLockPeriodConfigs() external view returns (LockPeriodConfig[] memory configs);

    // Admin functions
    function updateLockPeriodAPY(LockPeriod lockPeriod, uint256 newAPYBasisPoints) external;

    function updateLockPeriodStatus(LockPeriod lockPeriod, bool isActive) external;

    function updateStatusLockPeriod(LockPeriod lockPeriod, bool isActive) external;
}
