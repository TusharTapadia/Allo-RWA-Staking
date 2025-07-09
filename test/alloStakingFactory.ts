import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory, Signer } from "ethers";
import { AlloStakingFactory, AlloStaking, StakingRewardVault, MockERC20 } from "../typechain-types";

describe("AlloStakingFactory", function () {
  let factory: AlloStakingFactory;
  let stakingImplementation: AlloStaking;
  let stakingRewardVault: StakingRewardVault;
  let rewardToken: MockERC20;
  let stakingToken: MockERC20;
  let owner: Signer;
  let user: Signer;
  let ownerAddress: string;
  let userAddress: string;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    userAddress = await user.getAddress();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    rewardToken = await MockERC20Factory.deploy("Reward Token", "RWD", ethers.parseEther("1000000"));
    stakingToken = await MockERC20Factory.deploy("Staking Token", "STK", ethers.parseEther("1000000"));

    const StakingRewardVaultFactory = await ethers.getContractFactory("StakingRewardVault");
    stakingRewardVault = await StakingRewardVaultFactory.deploy();

    const AlloStakingFactory = await ethers.getContractFactory("AlloStaking");
    stakingImplementation = await AlloStakingFactory.deploy();

    const FactoryFactory = await ethers.getContractFactory("AlloStakingFactory");
    factory = await FactoryFactory.deploy();
  });

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      await factory.initialize(await stakingImplementation.getAddress(), await stakingRewardVault.getAddress());

      expect(await factory.alloStakingImplementation()).to.equal(await stakingImplementation.getAddress());
      expect(await factory.stakingRewardVault()).to.equal(await stakingRewardVault.getAddress());
      expect(await factory.stakingContractCount()).to.equal(0);
      expect(await factory.owner()).to.equal(ownerAddress);
    });

    it("Should revert if initialized with zero addresses", async function () {
      await expect(
        factory.initialize(ethers.ZeroAddress, await stakingRewardVault.getAddress())
      ).to.be.revertedWithCustomError(factory, "INVALID_ADDRESS");

      await expect(
        factory.initialize(await stakingImplementation.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "INVALID_ADDRESS");
    });

    it("Should revert if initialized twice", async function () {
      await factory.initialize(await stakingImplementation.getAddress(), await stakingRewardVault.getAddress());
      
      await expect(
        factory.initialize(await stakingImplementation.getAddress(), await stakingRewardVault.getAddress())
      ).to.be.revertedWithCustomError(factory, "InvalidInitialization");
    });
  });

  describe("Deploy Staking Contract", function () {
    beforeEach(async function () {
      await factory.initialize(await stakingImplementation.getAddress(), await stakingRewardVault.getAddress());
    });

    it("Should deploy a new staking contract successfully", async function () {
      const tx = await factory.deployStakingContract(
        await rewardToken.getAddress(),
        await stakingToken.getAddress()
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "StakingContractDeployed"
      );

      expect(event).to.not.be.undefined;
      expect(await factory.stakingContractCount()).to.equal(1);
      expect((await factory.stakingContractList(0)).stakingContract).to.not.equal(ethers.ZeroAddress);
    });

    it("Should emit StakingContractDeployed event with correct parameters", async function () {
      const tx = await factory.deployStakingContract(await rewardToken.getAddress(), await stakingToken.getAddress())
      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "StakingContractDeployed"
      );

      expect(event).to.not.be.undefined;
      expect(event?.args?.stakingContractId).to.equal(0);
      expect(event?.args?.stakingContract).to.equal((await factory.stakingContractList(0)).stakingContract);
      expect(event?.args?.rewardToken).to.equal(await rewardToken.getAddress());
      expect(event?.args?.stakingToken).to.equal(await stakingToken.getAddress());
    });

    it("Should increment staking contract count", async function () {
      expect(await factory.stakingContractCount()).to.equal(0);

      await factory.deployStakingContract(await rewardToken.getAddress(), await stakingToken.getAddress());
      expect(await factory.stakingContractCount()).to.equal(1);

      await factory.deployStakingContract(await rewardToken.getAddress(), await stakingToken.getAddress());
      expect(await factory.stakingContractCount()).to.equal(2);
    });

    it("Should revert if deployed with zero addresses", async function () {
      await expect(
        factory.deployStakingContract(ethers.ZeroAddress, await stakingToken.getAddress())
      ).to.be.revertedWithCustomError(factory, "INVALID_ADDRESS");

      await expect(
        factory.deployStakingContract(await rewardToken.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "INVALID_ADDRESS");
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        factory.connect(user).deployStakingContract(await rewardToken.getAddress(), await stakingToken.getAddress())
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("Update Staking Contract Implementation", function () {
    let newImplementation: AlloStaking;
    let deployedContract: string;

    beforeEach(async function () {
      await factory.initialize(await stakingImplementation.getAddress(), await stakingRewardVault.getAddress());
      
      await factory.deployStakingContract(await rewardToken.getAddress(), await stakingToken.getAddress());
      deployedContract = (await factory.stakingContractList(0)).stakingContract

      const AlloStakingFactory = await ethers.getContractFactory("AlloStaking");
      newImplementation = await AlloStakingFactory.deploy();
    });

    it("Should update implementation successfully", async function () {
      await factory.updateStakingContractImplementation(
        [deployedContract],
        await newImplementation.getAddress()
      );

      expect(await factory.alloStakingImplementation()).to.equal(await newImplementation.getAddress());
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        factory.connect(user).updateStakingContractImplementation(
          [deployedContract],
          await newImplementation.getAddress()
        )
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should revert if new implementation is zero address", async function () {
      await expect(
        factory.updateStakingContractImplementation([deployedContract], ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "INVALID_ADDRESS");
    });

    it("Should update multiple proxy contracts", async function () {
      await factory.deployStakingContract(await rewardToken.getAddress(), await stakingToken.getAddress());
      const contract2 = (await factory.stakingContractList(1)).stakingContract;

      await factory.updateStakingContractImplementation(
        [deployedContract, contract2],
        await newImplementation.getAddress()
      );

      expect(await factory.alloStakingImplementation()).to.equal(await newImplementation.getAddress());
    });

    it("Should handle empty proxy array", async function () {
      await expect(
        factory.updateStakingContractImplementation([], await newImplementation.getAddress())
      ).to.not.be.reverted;
    });
  });

  describe("UUPS Upgrade", function () {
    beforeEach(async function () {
      await factory.initialize(await stakingImplementation.getAddress(), await stakingRewardVault.getAddress());
    });

    it("Should revert upgrade if called by non-owner", async function () {
      const FactoryFactory = await ethers.getContractFactory("AlloStakingFactory");
      const newImplementation = await FactoryFactory.deploy();

      await expect(
        factory.connect(user).upgradeToAndCall(await newImplementation.getAddress(), "0x")
      ).to.be.revertedWithCustomError(factory, "UUPSUnauthorizedCallContext");
    });

    it("Should revert upgrade to zero address", async function () {
      await expect(
        factory.upgradeToAndCall(ethers.ZeroAddress, "0x")
      ).to.be.revertedWithCustomError(factory, "UUPSUnauthorizedCallContext");
    });
  });

  describe("Access Control", function () {
    beforeEach(async function () {
      await factory.initialize(await stakingImplementation.getAddress(), await stakingRewardVault.getAddress());
    });

    it("Should allow owner to transfer ownership", async function () {
      await factory.transferOwnership(userAddress);
      expect(await factory.owner()).to.equal(userAddress);
    });

    it("Should revert non-owner operations", async function () {
      await expect(
        factory.connect(user).transferOwnership(userAddress)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("State Management", function () {
    beforeEach(async function () {
      await factory.initialize(await stakingImplementation.getAddress(), await stakingRewardVault.getAddress());
    });

    it("Should maintain correct state after multiple operations", async function () {
      await factory.deployStakingContract(
        await rewardToken.getAddress(),
        await stakingToken.getAddress()
      );
      await factory.deployStakingContract(
        await rewardToken.getAddress(),
        await stakingToken.getAddress()
      );

      const contract1 = (await factory.stakingContractList(0)).stakingContract;
      const contract2 = (await factory.stakingContractList(1)).stakingContract;

      const AlloStakingFactory = await ethers.getContractFactory("AlloStaking");
      const newImplementation = await AlloStakingFactory.deploy();
      
      await factory.updateStakingContractImplementation(
        [contract1, contract2],
        await newImplementation.getAddress()
      );

      expect(await factory.stakingContractCount()).to.equal(2);
      expect((await factory.stakingContractList(0)).stakingContract).to.equal(contract1);
      expect((await factory.stakingContractList(1)).stakingContract).to.equal(contract2);
      expect(await factory.alloStakingImplementation()).to.equal(await newImplementation.getAddress());
      expect(await factory.stakingRewardVault()).to.equal(await stakingRewardVault.getAddress());
    });
  });
});
