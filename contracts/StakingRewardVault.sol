// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ErrorLibrary} from "./library/ErrorLibrary.sol";

contract StakingRewardVault is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    mapping(address => bool) public isStakingContract;
    mapping(address => bool) public isTokenAllowed;

    event RewardTransferred(address indexed stakingContract, address indexed token, uint256 amount);

    function initialize(address[] calldata stakingContracts, address[] calldata tokens) external initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _setStakingContract(stakingContracts, true);
        _setTokenAllowed(tokens, true)  ;
    }

    function updateStakingContractStatus(address[] calldata stakingContracts, bool isAllowed) external onlyOwner {
        _setStakingContract(stakingContracts, isAllowed);
    }

    function updateTokenAllowed(address[] calldata tokens, bool isAllowed) external onlyOwner {
        _setTokenAllowed(tokens, isAllowed);
    }

    function _setStakingContract(address[] calldata stakingContracts, bool isAllowed) internal onlyOwner {
        for (uint256 i = 0; i < stakingContracts.length; i++) {
            if (stakingContracts[i] == address(0)) revert ErrorLibrary.INVALID_ADDRESS();
            isStakingContract[stakingContracts[i]] = isAllowed;
        }
    }

    function _setTokenAllowed(address[] calldata tokens, bool isAllowed) internal onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) revert ErrorLibrary.INVALID_ADDRESS();
            isTokenAllowed[tokens[i]] = isAllowed;
        }
    }

    function transferReward(address stakingContract, address token,uint256 amount) external nonReentrant {
        if (!isStakingContract[stakingContract]) revert ErrorLibrary.INVALID_STAKING_CONTRACT();
        if (amount == 0) revert ErrorLibrary.INVALID_AMOUNT();
        if (!isTokenAllowed[token]) revert ErrorLibrary.INVALID_TOKEN();
        IERC20(token).safeTransfer(stakingContract, amount);
        emit RewardTransferred(stakingContract, token, amount);
    }

    function adminWithdraw(address token, uint256 amount, bool allBalance) external onlyOwner {
        if (amount == 0) revert ErrorLibrary.INVALID_AMOUNT();
        if (!isTokenAllowed[token]) revert ErrorLibrary.INVALID_TOKEN();
        if (allBalance) {
            IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        emit RewardTransferred(msg.sender, token, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

}