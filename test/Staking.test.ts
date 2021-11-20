import { BigNumber } from '@ethersproject/bignumber/lib/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers, network } from 'hardhat'

import { Plasma, Plasma__factory, Staking, Staking__factory, XToken, XToken__factory } from '../typechain'

describe('Staking', function () {
    let token: XToken
    let staking: Staking
    let plasma: Plasma
    let admin: SignerWithAddress
    beforeEach(async function () {
        ;[admin] = await ethers.getSigners()
        const TokenFactory = (await ethers.getContractFactory('XToken')) as XToken__factory
        token = await TokenFactory.deploy('UFO Gaming', 'UFO', BigNumber.from('100000000000000000000000'), admin.address)

        const StakingFactory = (await ethers.getContractFactory('Staking')) as Staking__factory
        staking = await StakingFactory.deploy(admin.address, token.address)

        const PlasmaFactory = (await ethers.getContractFactory('Plasma')) as Plasma__factory
        plasma = await PlasmaFactory.deploy('Plasma', 'UFO-PSM', [staking.address], admin.address)

        await staking.setPlasmaContract(plasma.address)
        await staking.updatePlasmaPointsPerMonth(0, BigNumber.from('10000000000000000000000'))
        await token.connect(admin).approve(staking.address, BigNumber.from('10000000000000000000000'))
    })

    describe('getRewardAmount', () => {
        describe('single stake', () => {
            it('displays correct reward for single day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')
                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('333333333333333333333')
            })

            it('displays correct reward for two days', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                await network.provider.send('evm_increaseTime', [86400 * 2])
                await network.provider.send('evm_mine')

                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('666666666666666666666')
            })

            it('displays correct reward for two days but with a harvest on the first day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const harvest = await staking.withdrawReward()
                await harvest.wait()

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('333333333333333333333')
            })

            it('displays correct reward for three days but with a harvest on the second day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                await network.provider.send('evm_increaseTime', [86400 * 2])
                await network.provider.send('evm_mine')

                const harvest = await staking.withdrawReward()
                await harvest.wait()

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('333333333333333333333')
            })

            it('displays correct reward for three days but with two harvests on first and the second day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const harvest = await staking.withdrawReward()
                await harvest.wait()

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const harvest2 = await staking.withdrawReward()
                await harvest2.wait()

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('333333333333333333333')
            })

            it('does not accrue plasma once token is withdrawn on the first day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()

                const withdraw = await staking.withdrawAmount(BigNumber.from(0))
                await withdraw.wait()

                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('0')

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const rewardAmount2 = await staking.getRewardAmount(admin.address)
                expect(rewardAmount2).to.eq('0')
            })

            it('does not accrue plasma once token is withdrawn on the second day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')
                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('333333333333333333333')

                const withdraw = await staking.withdrawAmount(BigNumber.from(0))
                await withdraw.wait()

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const rewardAmount2 = await staking.getRewardAmount(admin.address)
                expect(rewardAmount2).to.eq('333333333333333333333')
            })

            it('does not accrue plasma once token is withdrawn on the second day & should be able to harvest the rewards from withdrawn funds if they were not harvested before', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')
                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('333333333333333333333')

                const withdraw = await staking.withdrawAmount(BigNumber.from(0))
                await withdraw.wait()

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const harvest = await staking.withdrawReward()
                await harvest.wait()

                const rewardAmount2 = await staking.getRewardAmount(admin.address)
                expect(rewardAmount2).to.eq('0')

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const rewardAmount3 = await staking.getRewardAmount(admin.address)
                expect(rewardAmount3).to.eq('0')
            })
        })

        describe('multiple stake', () => {
            it('displays correct reward for single day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                const deposit2 = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit2.wait()
                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')
                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('333333333333333333332')
            })

            it('displays correct reward for two days', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                const deposit2 = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit2.wait()
                await network.provider.send('evm_increaseTime', [86400 * 2])
                await network.provider.send('evm_mine')

                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('666666666666666666666')
            })

            it('displays correct reward for two days but with a harvest on the first day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()
                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const harvest = await staking.withdrawReward()
                await harvest.wait()
                const deposit2 = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit2.wait()
                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')
                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('166666666666666666666') // deposit 1 -> 166 * 2, deposit 2 -> 166 * 1, claimed - 333 on day 1
            })

            it('does not accrue plasma once token is withdrawn on the first day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()

                const withdraw = await staking.withdrawAmount(BigNumber.from(0))
                await withdraw.wait()

                const deposit2 = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit2.wait()
                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('0')

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const rewardAmount2 = await staking.getRewardAmount(admin.address)
                expect(rewardAmount2).to.eq('333333333333333333333')
            })

            it.only('does not accrue plasma once token is withdrawn on the second day', async () => {
                const deposit = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit.wait()

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')
                const rewardAmount = await staking.getRewardAmount(admin.address)
                expect(rewardAmount).to.eq('333333333333333333333')

                const withdraw = await staking.withdrawAmount(BigNumber.from(0))
                await withdraw.wait()

                // Zero because total weighted locked is 0 so reward is zero
                const rewardAmount4 = await staking.getRewardAmount(admin.address)
                expect(rewardAmount4).to.eq('0')

                const deposit2 = await staking.depositUfoLocked(BigNumber.from('100000000000000000000'), 0)
                await deposit2.wait()

                // Once second deposit is made, the previous stake is also calculated with the currently locked weighted amount
                // This is a bug, and only visible if the user withdraws before claiming plasma.
                // Can be fixed if we automatically claims all the plasma while withdrawing. // UX issue?
                const rewardAmount2 = await staking.getRewardAmount(admin.address)
                expect(rewardAmount2).to.eq('333333333333333333333')

                await network.provider.send('evm_increaseTime', [86400])
                await network.provider.send('evm_mine')

                const rewardAmount3 = await staking.getRewardAmount(admin.address)
                expect(rewardAmount3).to.eq('666666666666666666666')
            })
        })
    })
})
