# ALLOx Staking Contract

This project includes a staking contract for RWA token along with it's factory for easier deployment and faster implementation. This is based on UUPS upgradeable architecture.

The test case includes a forking test case where using impersonateAccount function to mimic staking and transfering and receiving reward. 

Try running some of the following tasks:

```shell
npx hardhat test test/alloRWAStakingBSC.test.ts 
npx hardhat node
```


