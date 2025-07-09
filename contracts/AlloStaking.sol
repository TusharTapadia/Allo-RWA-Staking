// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IStakingRewardVault} from "./interfaces/IStakingRewardVault.sol";
import {ErrorLibrary} from "./library/ErrorLibrary.sol";

contract AlloStaking is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;
    uint256 public constant BASIS_POINTS = 10000;

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

    IERC20 public token;
    IERC20 public stakingToken;
    uint256 public stakeId;
    IStakingRewardVault public stakingRewardVault;
    mapping(LockPeriod => LockPeriodConfig) public lockPeriodConfigs;
    mapping(address => mapping(uint256 => UserStakingInfo)) public userStakingInfo;

    event LockPeriodAPYUpdated(LockPeriod indexed lockPeriod, uint256 oldAPY, uint256 newAPY);
    event LockPeriodDurationUpdated(LockPeriod indexed lockPeriod, uint256 oldDuration, uint256 newDuration);
    event LockPeriodStatusUpdated(LockPeriod indexed lockPeriod, bool isActive);
    event Staked(address indexed user, uint256 indexed stakeId, uint256 amount, LockPeriod lockPeriod);
    event Unstaked(address indexed user, uint256 indexed stakeId, uint256 amount);
    event RewardClaimed(address indexed user, uint256 indexed stakeId, uint256 amount);

    function initialize(
        address _token,
        address _stakingToken,
        address _stakingRewardVault
    ) external initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        if (_token == address(0) || _stakingToken == address(0) || _stakingRewardVault == address(0)) revert ErrorLibrary.INVALID_ADDRESS();
        token = IERC20(_token);
        stakingToken = IERC20(_stakingToken);
        stakingRewardVault = IStakingRewardVault(_stakingRewardVault);
        _initializeLockPeriods();
    }

    function _initializeLockPeriods() internal {
        lockPeriodConfigs[LockPeriod.ONE_DAY] = LockPeriodConfig({
            apyBasisPoints: 500,
            lockDuration: 1 days,
            isActive: true
        });

        lockPeriodConfigs[LockPeriod.ONE_WEEK] = LockPeriodConfig({
            apyBasisPoints: 500,
            lockDuration: 7 days,
            isActive: true
        });

        lockPeriodConfigs[LockPeriod.ONE_MONTH] = LockPeriodConfig({
            apyBasisPoints: 500,
            lockDuration: 30 days,
            isActive: true
        });

        lockPeriodConfigs[LockPeriod.SIX_MONTHS] = LockPeriodConfig({
            apyBasisPoints: 500,
            lockDuration: 180 days,
            isActive: true
        });

        lockPeriodConfigs[LockPeriod.ONE_YEAR] = LockPeriodConfig({
            apyBasisPoints: 500,
            lockDuration: 365 days,
            isActive: true
        });
    }

    function stake(uint256 amount, LockPeriod lockPeriod) external nonReentrant {
        if (amount == 0) revert ErrorLibrary.INVALID_AMOUNT();
        if (!lockPeriodConfigs[lockPeriod].isActive) revert ErrorLibrary.LOCK_PERIOD_NOT_ACTIVE();
        
        _transferFrom(msg.sender, address(this), amount);
        
        stakeId++;
        
        uint256 lockDuration = lockPeriodConfigs[lockPeriod].lockDuration;
        uint256 lockStart = block.timestamp;
        uint256 lockEnd = lockStart + lockDuration;
        
        userStakingInfo[msg.sender][stakeId] = UserStakingInfo({
            stakedAmount: amount,
            lockPeriod: lockPeriod,
            lockStart: lockStart,
            lockEnd: lockEnd,
            accumulatedReward: 0,
            lastRewardCalculation: lockStart
        });
        
        emit Staked(msg.sender, stakeId, amount, lockPeriod);
    }

    function calculateAndUpdateReward(address user, uint256 _stakeId) internal returns (uint256) {
        UserStakingInfo storage stakingInfo = userStakingInfo[user][_stakeId];
        if (stakingInfo.stakedAmount == 0) revert ErrorLibrary.STAKE_NOT_FOUND();
        
        uint256 timeElapsed = block.timestamp - stakingInfo.lastRewardCalculation;

        if (timeElapsed == 0) return stakingInfo.accumulatedReward;
        
        uint256 apyBasisPoints = lockPeriodConfigs[stakingInfo.lockPeriod].apyBasisPoints;
        
        uint256 newReward = (stakingInfo.stakedAmount * apyBasisPoints * timeElapsed) / (365 days * BASIS_POINTS);
        
        stakingInfo.accumulatedReward += newReward;
        stakingInfo.lastRewardCalculation = block.timestamp;
        
        return stakingInfo.accumulatedReward;
    }

    function getUserStake(address user, uint256 _stakeId) external view returns (
        uint256 stakedAmount,
        LockPeriod lockPeriod,
        uint256 lockStart,
        uint256 lockEnd,
        uint256 accumulatedReward
    ) {
        UserStakingInfo memory stakingInfo = userStakingInfo[user][_stakeId];
        return (
            stakingInfo.stakedAmount,
            stakingInfo.lockPeriod,
            stakingInfo.lockStart,
            stakingInfo.lockEnd,
            stakingInfo.accumulatedReward
        );
    }

    function unstake(uint256 _stakeId) external nonReentrant {
        UserStakingInfo storage stakingInfo = userStakingInfo[msg.sender][_stakeId];
        if (stakingInfo.stakedAmount == 0) revert ErrorLibrary.STAKE_NOT_FOUND();
        if (block.timestamp < stakingInfo.lockEnd) revert ErrorLibrary.LOCK_PERIOD_NOT_ENDED();
        
        calculateAndUpdateReward(msg.sender, _stakeId);
        
        uint256 amount = stakingInfo.stakedAmount;
        uint256 reward = stakingInfo.accumulatedReward;
        
        delete userStakingInfo[msg.sender][_stakeId];
        stakingRewardVault.transferReward(address(this), address(token), reward);
        
        stakingToken.safeTransfer(msg.sender, amount);
        if (reward > 0) {
            token.safeTransfer(msg.sender, reward);
        }
        
        emit Unstaked(msg.sender, _stakeId, amount);
    }

    function claimReward(uint256 _stakeId) external nonReentrant {
        UserStakingInfo storage stakingInfo = userStakingInfo[msg.sender][_stakeId];
        if (stakingInfo.stakedAmount == 0) revert ErrorLibrary.STAKE_NOT_FOUND();
        
        calculateAndUpdateReward(msg.sender, _stakeId);
        uint256 reward = stakingInfo.accumulatedReward;
        if (reward == 0) revert ErrorLibrary.NO_REWARDS_TO_CLAIM();
        
        stakingInfo.accumulatedReward = 0;
        stakingInfo.lastRewardCalculation = block.timestamp;
        
        stakingRewardVault.transferReward(address(this), address(token), reward);
        token.safeTransfer(msg.sender, reward);
        
        emit RewardClaimed(msg.sender, _stakeId, reward);
    }

    function updateLockPeriodAPY(LockPeriod lockPeriod, uint256 newAPYBasisPoints) external onlyOwner {
        if (newAPYBasisPoints > BASIS_POINTS) revert ErrorLibrary.APY_EXCEEDS_MAX_BASIS_POINTS();
        
        uint256 oldAPY = lockPeriodConfigs[lockPeriod].apyBasisPoints;
        lockPeriodConfigs[lockPeriod].apyBasisPoints = newAPYBasisPoints;
        
        emit LockPeriodAPYUpdated(lockPeriod, oldAPY, newAPYBasisPoints);
    }

    function updateLockPeriodStatus(LockPeriod lockPeriod, bool isActive) external onlyOwner {
        lockPeriodConfigs[lockPeriod].isActive = isActive;
        
        emit LockPeriodStatusUpdated(lockPeriod, isActive);
    }

    function updateStatusLockPeriod(LockPeriod lockPeriod, bool isActive) external onlyOwner {
        lockPeriodConfigs[lockPeriod].isActive = isActive;
        
        emit LockPeriodStatusUpdated(lockPeriod, isActive);
    }

    function getLockPeriodConfig(LockPeriod lockPeriod) external view returns (
        uint256 apyBasisPoints,
        uint256 lockDuration,
        bool isActive
    ) {
        LockPeriodConfig memory config = lockPeriodConfigs[lockPeriod];
        return (config.apyBasisPoints, config.lockDuration, config.isActive);
    }

    function getAllLockPeriodConfigs() external view returns (LockPeriodConfig[] memory configs) {
        configs = new LockPeriodConfig[](5);
        configs[0] = lockPeriodConfigs[LockPeriod.ONE_DAY];
        configs[1] = lockPeriodConfigs[LockPeriod.ONE_WEEK];
        configs[2] = lockPeriodConfigs[LockPeriod.ONE_MONTH];
        configs[3] = lockPeriodConfigs[LockPeriod.SIX_MONTHS];
        configs[4] = lockPeriodConfigs[LockPeriod.ONE_YEAR];
    }

    function _transferFrom(address from, address to, uint256 amount) internal {
        stakingToken.safeTransferFrom(from, to, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
