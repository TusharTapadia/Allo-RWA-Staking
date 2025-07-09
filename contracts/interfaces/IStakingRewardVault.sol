// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IStakingRewardVault {
    // Events
    event RewardTransferred(address indexed stakingContract, address indexed token, uint256 amount);

    // State variables
    function isStakingContract(address) external view returns (bool);
    function isTokenAllowed(address) external view returns (bool);

    // Functions
    function initialize(address[] calldata stakingContracts, address[] calldata tokens) external;
    function setStakingContractStatus(address[] calldata stakingContracts, bool[] calldata isAllowed) external;
    function setTokenAllowed(address[] calldata tokens, bool[] calldata isAllowed) external;
    function transferReward(address stakingContract, address token, uint256 amount) external;
    function adminWithdraw(address token, uint256 amount) external;
}
