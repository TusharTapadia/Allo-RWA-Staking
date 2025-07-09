// SPDX-License-Identifier: MIT
import hre from "hardhat"

const { ethers } = hre
const provider = new ethers.JsonRpcProvider()

const tokenUnitConverter = (balance: bigint, inputToken: string) => {
  if (inputToken.includes("usdc") || inputToken.includes("usdt")) {
    return (balance / BigInt(1e6)).toString()
  } else {
    return ethers.formatEther(balance)
  }
}

const getBlockNumber = async () => {
  return await provider.getBlockNumber()
}

const getCurrentTimestamp = () => {
  return Math.floor(new Date().getTime() / 1000)
}

const getBlockTimestamp = async () => {
  let block = await provider.getBlock(await getBlockNumber())
  return block?.timestamp ?? 0
}

const mineBlocks = async (n: number) => {
  for (let i = 0; i < n; i++) {
    await hre.network.provider.send("evm_mine", [])
  }
}

const increaseTime = async (ts: number) => {
  await hre.network.provider.send("evm_increaseTime", [ts])
  await hre.network.provider.send("evm_mine")
}

const setBlockTime = async (ts: number) => {
  await hre.network.provider.send("evm_setNextBlockTimestamp", [ts])
}

const unlockAccount = async (address: string) => {
  await hre.network.provider.send("hardhat_impersonateAccount", [address])
  return hre.ethers.getSigner(address)
}

const waitSeconds = (sec: number) =>
  new Promise((resolve) => setTimeout(resolve, sec * 1000))

export {
  getBlockNumber,
  getCurrentTimestamp,
  getBlockTimestamp,
  tokenUnitConverter,
  increaseTime,
  setBlockTime,
  mineBlocks,
  unlockAccount,
  waitSeconds,
}
