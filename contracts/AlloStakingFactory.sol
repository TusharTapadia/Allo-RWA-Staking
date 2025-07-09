// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ErrorLibrary} from "./library/ErrorLibrary.sol";
import {IAlloStaking} from "./interfaces/IAlloStaking.sol";

contract AlloStakingFactory is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    address public alloStakingImplementation;
    address public stakingRewardVault;

    struct StakingContractStruct {
        address stakingContract;
        address rewardToken;
        address stakingToken;
    }

    event StakingContractDeployed(uint256 indexed stakingContractId, address stakingContract, address rewardToken, address stakingToken);
    mapping(uint256 => StakingContractStruct) public stakingContractList;
    uint256 public stakingContractCount;

    function initialize(address _alloStakingImplementation, address _stakingRewardVault) external initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        if (_alloStakingImplementation == address(0) || _stakingRewardVault == address(0)) revert ErrorLibrary.INVALID_ADDRESS();
        alloStakingImplementation = _alloStakingImplementation;
        stakingRewardVault = _stakingRewardVault;
        stakingContractCount = 0;
    }

    function deployStakingContract(address _rewardToken, address _stakingToken) external onlyOwner returns (address) {
        if (_rewardToken == address(0) || _stakingToken == address(0)) revert ErrorLibrary.INVALID_ADDRESS();
        ERC1967Proxy stakingContract = new ERC1967Proxy(alloStakingImplementation, abi.encodeWithSelector(IAlloStaking.initialize.selector, _rewardToken, _stakingToken, stakingRewardVault));
        stakingContractList[stakingContractCount].stakingContract = address(stakingContract);
        stakingContractList[stakingContractCount].rewardToken = _rewardToken;
        stakingContractList[stakingContractCount].stakingToken = _stakingToken;
        emit StakingContractDeployed(stakingContractCount, address(stakingContract), _rewardToken, _stakingToken);
        stakingContractCount++;
        return address(stakingContract);
    }

    function updateStakingContractImplementation(
        address[] calldata _proxy,
        address _newStakingContractImplementation
    ) external virtual onlyOwner nonReentrant {
        if (_newStakingContractImplementation == address(0)) revert ErrorLibrary.INVALID_ADDRESS();
        alloStakingImplementation = _newStakingContractImplementation;
        _upgrade(_proxy, _newStakingContractImplementation);
    }

  
    function _upgrade(address[] calldata _proxy, address _newImpl) internal virtual {
        for (uint256 i = 0; i < _proxy.length; i++) {
            UUPSUpgradeable(_proxy[i]).upgradeToAndCall(_newImpl, "");
        }
    }

     function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
        if (newImplementation == address(0)) revert ErrorLibrary.INVALID_ADDRESS();
    }
}