import { ethers, upgrades } from "hardhat"
import { expect } from "chai"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

describe("AlloStaking", function () {
    let alloStaking: any
    let stakingRewardVault: any
    let token: any
    let stakingToken: any
    let owner: HardhatEthersSigner
    let user1: HardhatEthersSigner
    let user2: HardhatEthersSigner
    let user3: HardhatEthersSigner

    const BASIS_POINTS = 10000
    const INITIAL_SUPPLY = ethers.parseEther("1000000")
    const STAKE_AMOUNT = ethers.parseEther("1000")

    const LockPeriod = {
        ONE_DAY: 0,
        ONE_WEEK: 1,
        ONE_MONTH: 2,
        SIX_MONTHS: 3,
        ONE_YEAR: 4
    }

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners()

        const MockERC20Factory = await ethers.getContractFactory("MockERC20")
        token = await MockERC20Factory.deploy("Reward Token", "RWD", INITIAL_SUPPLY)
        stakingToken = await MockERC20Factory.deploy("Staking Token", "STK", INITIAL_SUPPLY)

        const StakingRewardVaultFactory = await ethers.getContractFactory("StakingRewardVault")
        stakingRewardVault = await upgrades.deployProxy(StakingRewardVaultFactory, [
            [],
            [await token.getAddress()]
        ])

        const AlloStakingFactory = await ethers.getContractFactory("AlloStaking")
        alloStaking = await upgrades.deployProxy(AlloStakingFactory, [
            await token.getAddress(),
            await stakingToken.getAddress(),
            await stakingRewardVault.getAddress()
        ])

        await stakingRewardVault.updateStakingContractStatus([await alloStaking.getAddress()], true)

        await stakingToken.transfer(user1.address, ethers.parseEther("10000"))
        await stakingToken.transfer(user2.address, ethers.parseEther("10000"))
        await stakingToken.transfer(user3.address, ethers.parseEther("10000"))

        await token.transfer(await stakingRewardVault.getAddress(), ethers.parseEther("100000"))
    })

    describe("Deployment and Initialization", function () {
        it("Should initialize with correct parameters", async function () {
            expect(await alloStaking.token()).to.equal(await token.getAddress())
            expect(await alloStaking.stakingToken()).to.equal(await stakingToken.getAddress())
            expect(await alloStaking.stakingRewardVault()).to.equal(await stakingRewardVault.getAddress())
            expect(await alloStaking.stakeId()).to.equal(0)
        })

        it("Should initialize lock period configs correctly", async function () {
            const configs = await alloStaking.getAllLockPeriodConfigs()
            
            expect(configs[0].apyBasisPoints).to.equal(500)
            expect(configs[0].lockDuration).to.equal(1 * 24 * 60 * 60)
            expect(configs[0].isActive).to.be.true

            expect(configs[1].apyBasisPoints).to.equal(500)
            expect(configs[1].lockDuration).to.equal(7 * 24 * 60 * 60)
            expect(configs[1].isActive).to.be.true

            expect(configs[2].apyBasisPoints).to.equal(500)
            expect(configs[2].lockDuration).to.equal(30 * 24 * 60 * 60)
            expect(configs[2].isActive).to.be.true

            expect(configs[3].apyBasisPoints).to.equal(500)
            expect(configs[3].lockDuration).to.equal(180 * 24 * 60 * 60)
            expect(configs[3].isActive).to.be.true

            expect(configs[4].apyBasisPoints).to.equal(500)
            expect(configs[4].lockDuration).to.equal(365 * 24 * 60 * 60)
            expect(configs[4].isActive).to.be.true
        })

        it("Should not allow re-initialization", async function () {
            await expect(
                alloStaking.initialize(
                    await token.getAddress(),
                    await stakingToken.getAddress(),
                    await stakingRewardVault.getAddress()
                )
            ).to.be.revertedWithCustomError(alloStaking, "InvalidInitialization")
        })
    })

    describe("Staking Function", function () {
        beforeEach(async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
        })

        it("Should stake tokens successfully", async function () {
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

        it("Should emit Staked event", async function () {
            await expect(alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY))
                .to.emit(alloStaking, "Staked")
                .withArgs(user1.address, 1, STAKE_AMOUNT, LockPeriod.ONE_DAY)
        })

        it("Should revert when staking zero amount", async function () {
            await expect(alloStaking.connect(user1).stake(0, LockPeriod.ONE_DAY))
                .to.be.revertedWithCustomError(alloStaking, "INVALID_AMOUNT")
        })

        it("Should revert when lock period is not active", async function () {
            await alloStaking.updateLockPeriodStatus(LockPeriod.ONE_DAY, false)
            await expect(alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY))
                .to.be.revertedWithCustomError(alloStaking, "LOCK_PERIOD_NOT_ACTIVE")
        })

        it("Should revert when user has insufficient allowance", async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), 0)
            await expect(alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY))
                .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientAllowance")
        })

        it("Should revert when user has insufficient balance", async function () {
            const largeAmount = ethers.parseEther("20000")
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), largeAmount)
            await expect(alloStaking.connect(user1).stake(largeAmount, LockPeriod.ONE_DAY))
                .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientBalance")
        })

        it("Should stake with different lock periods", async function () {
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

    describe("Reward Calculation", function () {
        beforeEach(async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
        })

        it("Should accumulate rewards over multiple periods", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await alloStaking.connect(user1).claimReward(1)

            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await alloStaking.connect(user1).claimReward(1)

            const userBalance = await token.balanceOf(user1.address)
            expect(userBalance).to.be.gt(0)
        })

        it("Should calculate rewards correctly based on APY", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])

            const stakeInfo = await alloStaking.getUserStake(user1.address, 1)
            
            const expectedReward = (STAKE_AMOUNT * 500n * BigInt(24 * 60 * 60)) / (BigInt(365 * 24 * 60 * 60) * 10000n)

            await alloStaking.connect(user1).claimReward(1)
            const actualReward = await token.balanceOf(user1.address)
            
            expect(actualReward).to.equal(expectedReward)
        })
    })

    describe("Unstaking Function", function () {
        beforeEach(async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
        })

        it("Should unstake successfully after lock period ends", async function () {
            const initialBalance = await stakingToken.balanceOf(user1.address)

            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await alloStaking.connect(user1).unstake(1)

            expect(await stakingToken.balanceOf(user1.address)).to.equal(initialBalance + STAKE_AMOUNT)
            
            const stakeInfo = await alloStaking.getUserStake(user1.address, 1)
            expect(stakeInfo.stakedAmount).to.equal(0)
        })

        it("Should emit Unstaked event", async function () {
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await expect(alloStaking.connect(user1).unstake(1))
                .to.emit(alloStaking, "Unstaked")
                .withArgs(user1.address, 1, STAKE_AMOUNT)
        })

        it("Should revert when trying to unstake before lock period ends", async function () {
            await ethers.provider.send("evm_increaseTime", [12 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await expect(alloStaking.connect(user1).unstake(1))
                .to.be.revertedWithCustomError(alloStaking, "LOCK_PERIOD_NOT_ENDED")
        })

        it("Should revert when stake does not exist", async function () {
            await expect(alloStaking.connect(user1).unstake(999))
                .to.be.revertedWithCustomError(alloStaking, "STAKE_NOT_FOUND")
        })

        it("Should revert when trying to unstake someone else's stake", async function () {
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await expect(alloStaking.connect(user2).unstake(1))
                .to.be.revertedWithCustomError(alloStaking, "STAKE_NOT_FOUND")
        })

        it("Should include rewards when unstaking", async function () {
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            const initialTokenBalance = await token.balanceOf(user1.address)
            const initialStakingTokenBalance = await stakingToken.balanceOf(user1.address)

            await alloStaking.connect(user1).unstake(1)

            expect(await stakingToken.balanceOf(user1.address)).to.equal(initialStakingTokenBalance + STAKE_AMOUNT)
            expect(await token.balanceOf(user1.address)).to.be.gt(initialTokenBalance)
        })
    })

    describe("Claim Reward Function", function () {
        beforeEach(async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
        })

        

        it("Should claim rewards successfully", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            const initialBalance = await token.balanceOf(user1.address)

            await alloStaking.connect(user1).claimReward(1)

            expect(await token.balanceOf(user1.address)).to.be.gt(initialBalance)
        })

        it("Should emit RewardClaimed event", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await expect(alloStaking.connect(user1).claimReward(1))
                .to.emit(alloStaking, "RewardClaimed")
        })

        it("Should revert when stake does not exist", async function () {
            await expect(alloStaking.connect(user1).claimReward(999))
                .to.be.revertedWithCustomError(alloStaking, "STAKE_NOT_FOUND")
        })

        it("Should reset accumulated reward after claiming", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await alloStaking.connect(user1).claimReward(1)

            const stakeInfo = await alloStaking.getUserStake(user1.address, 1)
            expect(stakeInfo.accumulatedReward).to.equal(0)
        })

        it("Should revert when trying to claim someone else's rewards", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await expect(alloStaking.connect(user2).claimReward(1))
                .to.be.revertedWithCustomError(alloStaking, "STAKE_NOT_FOUND")
        })
    })

    describe("Admin Functions", function () {
        describe("updateLockPeriodAPY", function () {
            it("Should update APY successfully", async function () {
                const newAPY = 1000
                await alloStaking.updateLockPeriodAPY(LockPeriod.ONE_DAY, newAPY)

                const config = await alloStaking.getLockPeriodConfig(LockPeriod.ONE_DAY)
                expect(config.apyBasisPoints).to.equal(newAPY)
            })

            it("Should emit LockPeriodAPYUpdated event", async function () {
                const newAPY = 1000
                await expect(alloStaking.updateLockPeriodAPY(LockPeriod.ONE_DAY, newAPY))
                    .to.emit(alloStaking, "LockPeriodAPYUpdated")
                    .withArgs(LockPeriod.ONE_DAY, 500, newAPY)
            })

            it("Should revert when APY exceeds max basis points", async function () {
                const invalidAPY = BASIS_POINTS + 1
                await expect(alloStaking.updateLockPeriodAPY(LockPeriod.ONE_DAY, invalidAPY))
                    .to.be.revertedWithCustomError(alloStaking, "APY_EXCEEDS_MAX_BASIS_POINTS")
            })

            it("Should revert when called by non-owner", async function () {
                await expect(alloStaking.connect(user1).updateLockPeriodAPY(LockPeriod.ONE_DAY, 1000))
                    .to.be.revertedWithCustomError(alloStaking, "OwnableUnauthorizedAccount")
            })
        })

        describe("updateLockPeriodStatus", function () {
            it("Should update lock period status successfully", async function () {
                await alloStaking.updateLockPeriodStatus(LockPeriod.ONE_DAY, false)

                const config = await alloStaking.getLockPeriodConfig(LockPeriod.ONE_DAY)
                expect(config.isActive).to.be.false
            })

            it("Should emit LockPeriodStatusUpdated event", async function () {
                await expect(alloStaking.updateLockPeriodStatus(LockPeriod.ONE_DAY, false))
                    .to.emit(alloStaking, "LockPeriodStatusUpdated")
                    .withArgs(LockPeriod.ONE_DAY, false)
            })

            it("Should revert when called by non-owner", async function () {
                await expect(alloStaking.connect(user1).updateLockPeriodStatus(LockPeriod.ONE_DAY, false))
                    .to.be.revertedWithCustomError(alloStaking, "OwnableUnauthorizedAccount")
            })
        })

        describe("updateStatusLockPeriod (duplicate function)", function () {
            it("Should update lock period status successfully", async function () {
                await alloStaking.updateStatusLockPeriod(LockPeriod.ONE_DAY, false)

                const config = await alloStaking.getLockPeriodConfig(LockPeriod.ONE_DAY)
                expect(config.isActive).to.be.false
            })

            it("Should emit LockPeriodStatusUpdated event", async function () {
                await expect(alloStaking.updateStatusLockPeriod(LockPeriod.ONE_DAY, false))
                    .to.emit(alloStaking, "LockPeriodStatusUpdated")
                    .withArgs(LockPeriod.ONE_DAY, false)
            })

            it("Should revert when called by non-owner", async function () {
                await expect(alloStaking.connect(user1).updateStatusLockPeriod(LockPeriod.ONE_DAY, false))
                    .to.be.revertedWithCustomError(alloStaking, "OwnableUnauthorizedAccount")
            })
        })
    })

    describe("View Functions", function () {
        beforeEach(async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
        })

        describe("getUserStake", function () {
            it("Should return correct stake information", async function () {
                const stakeInfo = await alloStaking.getUserStake(user1.address, 1)

                expect(stakeInfo.stakedAmount).to.equal(STAKE_AMOUNT)
                expect(stakeInfo.lockPeriod).to.equal(LockPeriod.ONE_DAY)
                expect(stakeInfo.accumulatedReward).to.equal(0)
                expect(stakeInfo.lockStart).to.be.gt(0)
                expect(stakeInfo.lockEnd).to.be.gt(stakeInfo.lockStart)
            })

            it("Should return zero values for non-existent stake", async function () {
                const stakeInfo = await alloStaking.getUserStake(user1.address, 999)

                expect(stakeInfo.stakedAmount).to.equal(0)
                expect(stakeInfo.lockPeriod).to.equal(0)
                expect(stakeInfo.accumulatedReward).to.equal(0)
                expect(stakeInfo.lockStart).to.equal(0)
                expect(stakeInfo.lockEnd).to.equal(0)
            })
        })

        describe("getLockPeriodConfig", function () {
            it("Should return correct lock period configuration", async function () {
                const config = await alloStaking.getLockPeriodConfig(LockPeriod.ONE_DAY)

                expect(config.apyBasisPoints).to.equal(500)
                expect(config.lockDuration).to.equal(1 * 24 * 60 * 60)
                expect(config.isActive).to.be.true
            })

            it("Should return correct configuration for all lock periods", async function () {
                for (let i = 0; i < 5; i++) {
                    const config = await alloStaking.getLockPeriodConfig(i)
                    expect(config.apyBasisPoints).to.equal(500)
                    expect(config.isActive).to.be.true
                }
            })
        })

        describe("getAllLockPeriodConfigs", function () {
            it("Should return all lock period configurations", async function () {
                const configs = await alloStaking.getAllLockPeriodConfigs()

                expect(configs.length).to.equal(5)

                const durations = [1, 7, 30, 180, 365]
                for (let i = 0; i < 5; i++) {
                    expect(configs[i].apyBasisPoints).to.equal(500)
                    expect(configs[i].lockDuration).to.equal(durations[i] * 24 * 60 * 60)
                    expect(configs[i].isActive).to.be.true
                }
            })
        })
    })

    describe("Constants and State Variables", function () {
        it("Should have correct BASIS_POINTS constant", async function () {
            expect(await alloStaking.BASIS_POINTS()).to.equal(BASIS_POINTS)
        })

        it("Should track stakeId correctly", async function () {
            expect(await alloStaking.stakeId()).to.equal(0)

            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)

            expect(await alloStaking.stakeId()).to.equal(1)

            await stakingToken.connect(user2).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_WEEK)

            expect(await alloStaking.stakeId()).to.equal(2)
        })
    })

    describe("Integration Tests", function () {
        it("Should handle multiple users staking and unstaking", async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT * 2n)
            await stakingToken.connect(user2).approve(await alloStaking.getAddress(), STAKE_AMOUNT * 2n)

            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_WEEK)

            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_MONTH)
            await alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.SIX_MONTHS)

            expect(await alloStaking.stakeId()).to.equal(4)

            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await alloStaking.connect(user1).unstake(1)

            await alloStaking.connect(user1).claimReward(2)

            await expect(alloStaking.connect(user2).unstake(3))
                .to.be.revertedWithCustomError(alloStaking, "LOCK_PERIOD_NOT_ENDED")

            await expect(alloStaking.connect(user2).unstake(4))
                .to.be.revertedWithCustomError(alloStaking, "LOCK_PERIOD_NOT_ENDED")
        })

        it("Should handle APY updates affecting existing stakes", async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)

            await alloStaking.updateLockPeriodAPY(LockPeriod.ONE_DAY, 1000)

            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await alloStaking.connect(user1).claimReward(1)

            const userBalance = await token.balanceOf(user1.address)
            expect(userBalance).to.be.gt(0)
        })

        it("Should handle deactivating lock periods", async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)

            await alloStaking.updateLockPeriodStatus(LockPeriod.ONE_DAY, false)

            await stakingToken.connect(user2).approve(await alloStaking.getAddress(), STAKE_AMOUNT)
            await expect(alloStaking.connect(user2).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY))
                .to.be.revertedWithCustomError(alloStaking, "LOCK_PERIOD_NOT_ACTIVE")

            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60])
            await ethers.provider.send("evm_mine", [])

            await alloStaking.connect(user1).unstake(1)
        })
    })

    describe("Edge Cases and Error Handling", function () {
        it("Should handle very small amounts", async function () {
            const smallAmount = ethers.parseEther("0.000001")
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), smallAmount)

            await alloStaking.connect(user1).stake(smallAmount, LockPeriod.ONE_DAY)

            const stakeInfo = await alloStaking.getUserStake(user1.address, 1)
            expect(stakeInfo.stakedAmount).to.equal(smallAmount)
        })

        it("Should handle maximum amounts", async function () {
            const maxAmount = await stakingToken.balanceOf(user1.address)
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), maxAmount)

            await alloStaking.connect(user1).stake(maxAmount, LockPeriod.ONE_DAY)

            const stakeInfo = await alloStaking.getUserStake(user1.address, 1)
            expect(stakeInfo.stakedAmount).to.equal(maxAmount)
        })

        it("Should handle multiple stakes from same user", async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT * 10n)

            for (let i = 0; i < 5; i++) {
                await alloStaking.connect(user1).stake(STAKE_AMOUNT, i)
            }

            expect(await alloStaking.stakeId()).to.equal(5)

            for (let i = 1; i <= 5; i++) {
                const stakeInfo = await alloStaking.getUserStake(user1.address, i)
                expect(stakeInfo.stakedAmount).to.equal(STAKE_AMOUNT)
                expect(stakeInfo.lockPeriod).to.equal(i - 1)
            }
        })

        it("Should handle rapid transactions", async function () {
            await stakingToken.connect(user1).approve(await alloStaking.getAddress(), STAKE_AMOUNT * 5n)

            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_DAY)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_WEEK)
            await alloStaking.connect(user1).stake(STAKE_AMOUNT, LockPeriod.ONE_MONTH)

            expect(await alloStaking.stakeId()).to.equal(3)
        })
    })
})

