import { ethers, upgrades } from "hardhat"
import { expect } from "chai"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { unlockAccount } from "../contracts/helpers/helper"

describe("AlloStaking BSC Fork", function () {
    let alloStaking: any
    let stakingRewardVault: any
    let stakingToken: any
    let rewardToken: any
    let owner: HardhatEthersSigner
    let user1: HardhatEthersSigner
    let user2: HardhatEthersSigner
    let user3: HardhatEthersSigner
    let impersonatedAccount: HardhatEthersSigner

    // BSC Token Addresses
    const STAKING_TOKEN_ADDRESS = "0x9C8B5CA345247396bDfAc0395638ca9045C6586E"
    const REWARD_TOKEN_ADDRESS = "0x9C8B5CA345247396bDfAc0395638ca9045C6586E"
    const IMPERSONATED_ACCOUNT_ADDRESS = "0x1fc8f552a6c9a9aed8fd015d169ee538539a8078"

    const BASIS_POINTS = 10000
    const STAKE_AMOUNT = ethers.parseEther("1000")
    const TRANSFER_AMOUNT = ethers.parseEther("1000")
    const REWARD_VAULT_AMOUNT = ethers.parseEther("1000")

    const LockPeriod = {
        ONE_DAY: 0,
        ONE_WEEK: 1,
        ONE_MONTH: 2,
        SIX_MONTHS: 3,
        ONE_YEAR: 4
    }

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners()

        impersonatedAccount = await unlockAccount(IMPERSONATED_ACCOUNT_ADDRESS)

        stakingToken = await ethers.getContractAt("IERC20", STAKING_TOKEN_ADDRESS)
        rewardToken = await ethers.getContractAt("IERC20", REWARD_TOKEN_ADDRESS)

        const StakingRewardVaultFactory = await ethers.getContractFactory("StakingRewardVault")
        stakingRewardVault = await upgrades.deployProxy(StakingRewardVaultFactory, [
            [],
            [REWARD_TOKEN_ADDRESS]
        ])

        const AlloStakingFactory = await ethers.getContractFactory("AlloStaking")
        alloStaking = await upgrades.deployProxy(AlloStakingFactory, [
            REWARD_TOKEN_ADDRESS,
            STAKING_TOKEN_ADDRESS,
            await stakingRewardVault.getAddress()
        ])

        await stakingRewardVault.updateStakingContractStatus([await alloStaking.getAddress()], true)

        await owner.sendTransaction({
            to: IMPERSONATED_ACCOUNT_ADDRESS,
            value: ethers.parseEther("1")
        })

        await stakingToken.connect(impersonatedAccount).transfer(user1.address, TRANSFER_AMOUNT)
        await stakingToken.connect(impersonatedAccount).transfer(user2.address, TRANSFER_AMOUNT)
        await stakingToken.connect(impersonatedAccount).transfer(user3.address, TRANSFER_AMOUNT)

        await rewardToken.connect(impersonatedAccount).transfer(await stakingRewardVault.getAddress(), REWARD_VAULT_AMOUNT)
    })

    describe("BSC Fork Setup", function () {
        it("Should have correct token addresses", async function () {
            expect(await alloStaking.stakingToken()).to.equal(STAKING_TOKEN_ADDRESS)
            expect(await alloStaking.token()).to.equal(REWARD_TOKEN_ADDRESS)
        })

        it("Should have impersonated account with sufficient balance", async function () {
            const balance = await stakingToken.balanceOf(IMPERSONATED_ACCOUNT_ADDRESS)
            expect(balance).to.be.gt(0)
        })

        it("Should have transferred reward tokens to vault", async function () {
            expect(await rewardToken.balanceOf(await stakingRewardVault.getAddress())).to.equal(REWARD_VAULT_AMOUNT)
        })
    })

    describe("Staking on BSC Fork", function () {
        beforeEach(async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
        })

        it("Should stake tokens successfully on BSC", async function () {
            const initialBalance = await stakingToken.balanceOf(user1.address)
            const initialStakeId = await alloStaking.stakeId()

            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)

            expect(await alloStaking.stakeId()).to.equal(initialStakeId + 1n)
            expect(await stakingToken.balanceOf(user1.address)).to.equal(initialBalance - STAKE_AMOUNT)
            expect(await stakingToken.balanceOf(await alloStaking.getAddress())).to.equal(STAKE_AMOUNT)

            const stakeInfo = await alloStaking.getUserStake(user1.address, 1)
            expect(stakeInfo.stakedAmount).to.equal(STAKE_AMOUNT)
            expect(stakeInfo.lockPeriod).to.equal(LockPeriod.ONE_DAY)
            expect(stakeInfo.accumulatedReward).to.equal(0)
        })

        it("Should emit Staked event on BSC", async function () {
            await expect(alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY))
                .to.emit(alloStaking, "Staked")
                .withArgs(user1.address, 1, STAKE_AMOUNT, LockPeriod.ONE_DAY)
        })

        it("Should stake with different lock periods on BSC", async function () {
            await stakingToken.connect(user2).approve(await alloStaking.getAddress(), STAKE_AMOUNT * 5n)

            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_WEEK)
            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_MONTH)
            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.SIX_MONTHS)
            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_YEAR)

            expect(await alloStaking.stakeId()).to.equal(5)

            for (let i = 1; i <= 5; i++) {
                const stakeInfo = await alloStaking.getUserStake(user2.address, i)
                expect(stakeInfo.stakedAmount).to.equal(STAKE_AMOUNT)
                expect(stakeInfo.lockPeriod).to.equal(i - 1)
            }
        })
    })

    describe("Reward Calculation on BSC", function () {
        beforeEach(async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
        })

        it("Should accumulate rewards over time on BSC", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])

            await alloStaking.connect(user1).claimReward(1)

            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])

            await alloStaking.connect(user1).claimReward(1)

            const userBalance = await rewardToken.balanceOf(user1.address)
            expect(userBalance).to.be.gt(0)
        })

        it("Should calculate rewards correctly based on APY on BSC", async function () {
            await stakingToken.connect(user2).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)

            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])

            const expectedReward = (STAKE_AMOUNT * 500n * BigInt(24 * 60 * 60)) / (BigInt(365 * 24 * 60 * 60) * 10000n)

            const balBefore = await rewardToken.balanceOf(user2.address)
            await alloStaking.connect(user2).claimReward(2)
            const balAfter = await rewardToken.balanceOf(user2.address)
            
            expect(expectedReward).to.equal(balAfter - balBefore)
        })
    })

    describe("Unstaking on BSC", function () {
        beforeEach(async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
        })

        it("Should unstake tokens after lock period on BSC", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            // await ethers.provider.send("evm_mine", [])
    
            const initialBalance = await stakingToken.balanceOf(user1.address)
            const initialStakeId = await alloStaking.stakeId()
            const stakeInfo = await alloStaking.getUserStake(user1.address, 1)
    
            const expectedReward = (STAKE_AMOUNT * 500n * BigInt(24 * 60 * 60)) / (BigInt(365 * 24 * 60 * 60) * 10000n)
    
            await alloStaking.connect(user1).unstake(1)
    
            expect(await stakingToken.balanceOf(user1.address)).to.equal(initialBalance + STAKE_AMOUNT + expectedReward)
            expect(await stakingToken.balanceOf(await alloStaking.getAddress())).to.equal(0)
        })

        it("Should emit Unstaked event on BSC", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await expect(alloStaking.connect(user1).unstake(1))
                .to.emit(alloStaking, "Unstaked")
                .withArgs(user1.address, 1, STAKE_AMOUNT)
        })
    })


    
    describe("Multiple Users Staking on BSC", function () {
        it("Should handle multiple users staking simultaneously", async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await stakingToken.connect(user2).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await stakingToken.connect(user3).approve(await alloStaking.getAddress(), STAKE_AMOUNT)

            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_WEEK)
            await alloStaking.connect(user3).stake(STAKE_AMOUNT, LockPeriod.ONE_MONTH)

            expect(await alloStaking.stakeId()).to.equal(3)

            const stake1 = await alloStaking.getUserStake(user1.address, 1)
            const stake2 = await alloStaking.getUserStake(user2.address, 2)
            const stake3 = await alloStaking.getUserStake(user3.address, 3)

            expect(stake1.stakedAmount).to.equal(STAKE_AMOUNT)
            expect(stake2.stakedAmount).to.equal(STAKE_AMOUNT)
            expect(stake3.stakedAmount).to.equal(STAKE_AMOUNT)

            expect(stake1.lockPeriod).to.equal(LockPeriod.ONE_DAY)
            expect(stake2.lockPeriod).to.equal(LockPeriod.ONE_WEEK)
            expect(stake3.lockPeriod).to.equal(LockPeriod.ONE_MONTH)
        })
    })

    afterEach(async function () {
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [IMPERSONATED_ACCOUNT_ADDRESS])
    })
})
