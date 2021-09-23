import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { expect } from 'chai';

import { XToken } from '../typechain/XToken';
import { ERC20 } from '../typechain/ERC20';
import { IUniswapV2Factory } from '../typechain/IUniswapV2Factory';
import { IUniswapV2Pair } from '../typechain/IUniswapV2Pair';
import { IUniswapV2Router02 } from '../typechain/IUniswapV2Router02';

import DeployHelper from '../utils/deployer';
import { Staking } from '../typechain/Staking';
import { Plasma } from '../typechain/Plasma';
import { blocksTravel, expectApproxEqual, pointZeroOnePercent, timeTravel } from '../utils/helper';
import { isAddress } from 'ethers/lib/utils';
import { zeroAddress } from '../utils/constants';

describe('Check Plasma Mathematics', async () => {
    let lptoken1: ERC20;
    let lptoken2: ERC20;

    let staking1: Staking;
    let staking2: Staking;

    let plasma: Plasma;
    let admin: SignerWithAddress;
    let randomUser1: SignerWithAddress;
    let randomUser2: SignerWithAddress;
    let randomUser3: SignerWithAddress;

    async function createEnv() {
        [, admin, , , randomUser1, , , randomUser2, , , , , randomUser3] = await ethers.getSigners();
        let deployHelper = new DeployHelper(admin);
        lptoken1 = await deployHelper.helper.deployXToken('LP Token1', 'LP1', BigNumber.from('100000000000000000000000'), admin.address);
        lptoken2 = await deployHelper.helper.deployXToken('LP Token2', 'LP2', BigNumber.from('100000000000000000000000'), admin.address);

        staking1 = await deployHelper.matic.deployStaking(admin.address, lptoken1.address, 7); // 7 days withdraw time
        staking2 = await deployHelper.matic.deployStaking(admin.address, lptoken2.address, 30); // 30 days withdraw time

        plasma = await deployHelper.matic.deployPlasma('Plasma', 'UFO-PSM', [staking1.address, staking2.address], admin.address);
    }
    before(async () => {
        // create new env
        await createEnv();
    });

    it('Check Deploymenyts', async () => {
        expect(isAddress(lptoken1.address)).to.be.true;
        expect(isAddress(lptoken2.address)).to.be.true;
        expect(isAddress(staking1.address)).to.be.true;
        expect(isAddress(staking2.address)).to.be.true;
        expect(isAddress(plasma.address)).to.be.true;
    });

    it('Plasma Contract can only be set by admin', async () => {
        await expect(staking1.connect(randomUser1).setPlasmaContract(plasma.address)).to.be.revertedWith('Only admin can call');
    });

    describe('Depositing LP Tokens', async () => {
        before(async () => {
            await createEnv();
            await staking1.connect(admin).setPlasmaContract(plasma.address);
        });

        it("Can't add  0 tokens to staking contract", async () => {
            await expect(staking1.connect(randomUser1).depositLpToken(randomUser1.address, 0)).to.be.revertedWith(
                'amount must be greater than 0'
            );
        });

        it('Cant despoit lp tokens to address(0)', async () => {
            await expect(staking1.connect(randomUser1).depositLpToken(zeroAddress, 0)).to.be.revertedWith('address can not be address(0)');
        });

        it('Deposit amount to staking contract', async () => {
            let amountToTest = BigNumber.from(10).pow(18); // 1 lp token
            await lptoken1.connect(admin).transfer(randomUser1.address, amountToTest.add(1));

            await lptoken1.connect(randomUser1).approve(staking1.address, amountToTest.add(1));
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, amountToTest);

            expect(await staking1.lpTokensLocked(randomUser1.address)).to.eq(amountToTest);
            expect(await (await staking1.lastDeposit(randomUser1.address)).amount).to.eq(amountToTest);

            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, 1);
            expect(await staking1.lpTokensLocked(randomUser1.address)).to.eq(amountToTest.add(1));
            expect(await (await staking1.lastDeposit(randomUser1.address)).amount).to.eq(amountToTest.add(1));
        });
    });

    describe('Unlocking Request for LP tokens', async () => {
        let maxLpTokenInThisTest = BigNumber.from(10).pow(18).mul(1000); // 1000 lp token

        beforeEach(async () => {
            await createEnv();
            await staking1.connect(admin).setPlasmaContract(plasma.address);
            await lptoken1.connect(admin).transfer(randomUser1.address, maxLpTokenInThisTest);

            await lptoken1.connect(randomUser1).approve(staking1.address, maxLpTokenInThisTest);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, maxLpTokenInThisTest);
        });

        it('Create Unlocking Request', async () => {
            await expect(staking1.connect(randomUser1).placeWithdrawRequest(maxLpTokenInThisTest))
                .to.emit(staking1, 'WithdrawlRequestForLpTokens')
                .withArgs(randomUser1.address, 1, maxLpTokenInThisTest);
        });

        it('Cannot create unlocking request if max amount is already placed in withdrawl request', async () => {
            let amountToTest = BigNumber.from(10).pow(18); // 1 lp token

            await staking1.connect(randomUser1).placeWithdrawRequest(maxLpTokenInThisTest);
            await expect(staking1.connect(randomUser1).placeWithdrawRequest(amountToTest)).to.be.revertedWith(
                'no remaining token left to place withdraw request'
            );
        });

        it('Cannot create unlocking request if max amount is already placed in withdrawl request - 2', async () => {
            let amountToTest = maxLpTokenInThisTest.div(2); // 1 lp token

            await staking1.connect(randomUser1).placeWithdrawRequest(amountToTest);
            await expect(staking1.connect(randomUser1).placeWithdrawRequest(amountToTest.add(1))).to.be.revertedWith(
                'no remaining token left to place withdraw request'
            );
        });
    });

    describe('Withdraw LP tokens', async () => {
        let maxLpTokenInThisTest = BigNumber.from(10).pow(18).mul(1000); // 1000 lp token

        beforeEach(async () => {
            await createEnv();
            await staking1.connect(admin).setPlasmaContract(plasma.address);
            await lptoken1.connect(admin).transfer(randomUser1.address, maxLpTokenInThisTest);

            await lptoken1.connect(randomUser1).approve(staking1.address, maxLpTokenInThisTest);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, maxLpTokenInThisTest);

            await expect(staking1.connect(randomUser1).placeWithdrawRequest(maxLpTokenInThisTest))
                .to.emit(staking1, 'WithdrawlRequestForLpTokens')
                .withArgs(randomUser1.address, 1, maxLpTokenInThisTest);
        });

        it("Can't withdraw before the lock time is passed", async () => {
            await expect(staking1.connect(randomUser1).withdraw(1, randomUser2.address)).to.be.revertedWith(
                'Can withdraw only after deadline'
            );
        });

        it('Withdraw LP tokens after deadline', async () => {
            await timeTravel(network, 7 * 86400);
            await blocksTravel(network, 10);
            await expect(staking1.connect(randomUser1).withdraw(1, randomUser2.address))
                .to.emit(staking1, 'Withdraw')
                .withArgs(randomUser1.address, randomUser2.address, 1, maxLpTokenInThisTest);
        });

        it("Can't use unplaced withdrawal requests", async () => {
            await timeTravel(network, 7 * 86400);
            await blocksTravel(network, 10);
            await expect(staking1.connect(randomUser1).withdraw(2, randomUser2.address)).to.be.revertedWith('Invalid Withdrawl Request');
        });

        it("Can't use same withdrawl request twice", async () => {
            await timeTravel(network, 7 * 86400);
            await blocksTravel(network, 10);
            await expect(staking1.connect(randomUser1).withdraw(1, randomUser2.address))
                .to.emit(staking1, 'Withdraw')
                .withArgs(randomUser1.address, randomUser2.address, 1, maxLpTokenInThisTest);
            await expect(staking1.connect(randomUser1).withdraw(1, randomUser2.address)).to.be.revertedWith('Invalid Withdrawl Request');
        });
    });

    describe('Claim Plasma Points', async () => {
        let lpTokensToTransfer = BigNumber.from(10).pow(21); //1000 lp tokens
        let plasmaPointForMonth = {
            0: BigNumber.from(10).pow(18), // 1 lp
            1: BigNumber.from(10).pow(19), // 10 lp
            2: BigNumber.from(10).pow(20), // 100 lp
            3: BigNumber.from(10).pow(20).mul(3), // 300 lp
            4: BigNumber.from(10).pow(21), //1000 lp
            5: BigNumber.from(10).pow(21).mul(5), //5000 lp
            6: BigNumber.from(10).pow(17), // 0.1 lp
        };

        beforeEach(async () => {
            await createEnv();
            await staking1.connect(admin).setPlasmaContract(plasma.address);
            await staking2.connect(admin).setPlasmaContract(plasma.address);

            await lptoken1.connect(admin).transfer(randomUser1.address, lpTokensToTransfer);
            await lptoken2.connect(admin).transfer(randomUser1.address, lpTokensToTransfer);

            await lptoken1.connect(admin).transfer(randomUser2.address, lpTokensToTransfer);
            await lptoken2.connect(admin).transfer(randomUser2.address, lpTokensToTransfer);

            await lptoken1.connect(admin).transfer(randomUser3.address, lpTokensToTransfer);
            await lptoken2.connect(admin).transfer(randomUser3.address, lpTokensToTransfer);
        });

        it('Check Months', async () => {
            expect(await staking1.getCurrentMonth()).to.eq(0);
            await timeTravel(network, 30 * 86400);
            await blocksTravel(network, 1);
            expect(await staking1.getCurrentMonth()).to.eq(1);
            await timeTravel(network, 30 * 86400);
            await blocksTravel(network, 1);
            expect(await staking1.getCurrentMonth()).to.eq(2);
            await timeTravel(network, 30 * 86400);
            await blocksTravel(network, 1);
            expect(await staking1.getCurrentMonth()).to.eq(3);
            await timeTravel(network, 30 * 86400);
            await blocksTravel(network, 1);
            expect(await staking1.getCurrentMonth()).to.eq(4);
        });

        it('Only admin can update plasma points per month ', async () => {
            await expect(staking1.connect(randomUser1).updatePlasmaPointsPerMonth(0, 12)).to.be.revertedWith('Only admin can call');
            await expect(staking1.connect(admin).updatePlasmaPointsPerMonth(0, 12))
                .to.emit(staking1, 'UpdatePlasmaPointsForMonth')
                .withArgs(0, 12);
        });

        it('If only one user deposit lp tokens he get all the plasma points of that month', async () => {
            let lpTokenToDeposit = BigNumber.from(10).pow(19); // 10 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDeposit);

            await timeTravel(network, 10 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser3.address))
                .to.emit(staking1, 'ClaimPlasma')
                .withArgs(randomUser3.address, plasmaPointForMonth[0]);
        });

        it('two users deposit lp tokens in same time, they should get approx same plasma points', async () => {
            let lpTokenToDeposit = BigNumber.from(10).pow(19); // 10 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDeposit);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDeposit);

            await timeTravel(network, 10 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await plasma.balanceOf(randomUser1.address),
                await plasma.balanceOf(randomUser2.address),
                'Diff should be less than 1 percent',
                pointZeroOnePercent
            );
        });

        it('two users deposit lp tokens in same time, user 1 tries to claim twice', async () => {
            let lpTokenToDeposit = BigNumber.from(10).pow(19); // 10 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDeposit);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDeposit);

            await timeTravel(network, 10 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await plasma.balanceOf(randomUser1.address),
                await plasma.balanceOf(randomUser2.address),
                'Diff should be less than 1 percent',
                pointZeroOnePercent
            );

            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');
        });

        it('three user deposit lp tokens in same time, they should get approx same plasma points', async () => {
            let lpTokenToDeposit = BigNumber.from(10).pow(19); // 10 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDeposit);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDeposit);

            await lptoken1.connect(randomUser3).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser3).depositLpToken(randomUser3.address, lpTokenToDeposit);

            await timeTravel(network, 10 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser3).claimPlasma(randomUser3.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await plasma.balanceOf(randomUser1.address),
                await plasma.balanceOf(randomUser2.address),
                'Diff should be less than 1 percent',
                pointZeroOnePercent
            );
            expectApproxEqual(
                await plasma.balanceOf(randomUser1.address),
                await plasma.balanceOf(randomUser3.address),
                'Diff should be less than 1 percent',
                pointZeroOnePercent
            );
        });

        it('if stake ratio is 1:2:3, reward ratio should be, 1:2:3 given time is same', async () => {
            let lpTokenToDepositForUser1 = BigNumber.from(10).pow(19); // 10 lp tokens
            let lpTokenToDepositForUser2 = BigNumber.from(10).pow(19).mul(2); // 20 lp tokens
            let lpTokenToDepositForUser3 = BigNumber.from(10).pow(19).mul(3); // 30 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDepositForUser1);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDepositForUser1);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDepositForUser2);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDepositForUser2);

            await lptoken1.connect(randomUser3).approve(staking1.address, lpTokenToDepositForUser3);
            await staking1.connect(randomUser3).depositLpToken(randomUser3.address, lpTokenToDepositForUser3);

            await timeTravel(network, 10 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser3).claimPlasma(randomUser3.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser1.address)).mul(2),
                await plasma.balanceOf(randomUser2.address),
                'User 1 balance should half of user 2',
                pointZeroOnePercent
            );

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser1.address)).mul(3),
                await plasma.balanceOf(randomUser3.address),
                'user 1 balance should be 1/3 of user3',
                pointZeroOnePercent
            );
        });

        it('if stake ratio is 1:2.5:5, time ratio is 5:2:1, reward ratio should be approximately same', async () => {
            let lpTokenToDepositForUser1 = BigNumber.from(10).pow(19); // 10 lp tokens
            let lpTokenToDepositForUser2 = BigNumber.from(10).pow(19).mul(5).div(2); // 20 lp tokens
            let lpTokenToDepositForUser3 = BigNumber.from(10).pow(19).mul(5); // 50 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDepositForUser1);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDepositForUser1);

            await timeTravel(network, 3 * 86400);
            await blocksTravel(network, 1);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDepositForUser2);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDepositForUser2);

            await timeTravel(network, 1 * 86400);
            await blocksTravel(network, 1);

            await lptoken1.connect(randomUser3).approve(staking1.address, lpTokenToDepositForUser3);
            await staking1.connect(randomUser3).depositLpToken(randomUser3.address, lpTokenToDepositForUser3);

            await timeTravel(network, 1 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser3).claimPlasma(randomUser3.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await plasma.balanceOf(randomUser1.address),
                await plasma.balanceOf(randomUser2.address),
                'User 1 balance should equal to user 2',
                pointZeroOnePercent
            );

            expectApproxEqual(
                await plasma.balanceOf(randomUser1.address),
                await plasma.balanceOf(randomUser3.address),
                'user 1 balance should be equal to user 3',
                pointZeroOnePercent
            );
        });

        it('if stake ratio is 1:2.5:5, time ratio is 5:2:0, reward ratio should be approximately 1:1:0', async () => {
            let lpTokenToDepositForUser1 = BigNumber.from(10).pow(19); // 10 lp tokens
            let lpTokenToDepositForUser2 = BigNumber.from(10).pow(19).mul(5).div(2); // 20 lp tokens
            let lpTokenToDepositForUser3 = BigNumber.from(10).pow(19).mul(5); // 50 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDepositForUser1);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDepositForUser1);

            await timeTravel(network, 3 * 86400);
            await blocksTravel(network, 1);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDepositForUser2);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDepositForUser2);

            await timeTravel(network, 2 * 86400);
            await blocksTravel(network, 1);

            await lptoken1.connect(randomUser3).approve(staking1.address, lpTokenToDepositForUser3);
            await staking1.connect(randomUser3).depositLpToken(randomUser3.address, lpTokenToDepositForUser3);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser3).claimPlasma(randomUser3.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await plasma.balanceOf(randomUser1.address),
                await plasma.balanceOf(randomUser2.address),
                'User 1 balance should equal to user 2',
                pointZeroOnePercent
            );
            // user 3 balance is manually checked
        });

        it('two users deposit lp tokens in same time, user 1 places withdraw request after half time, reward ratio should be 1:2', async () => {
            let lpTokenToDeposit = BigNumber.from(10).pow(19); // 10 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDeposit);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDeposit);

            await timeTravel(network, 5 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(randomUser1).placeWithdrawRequest(lpTokenToDeposit);

            await timeTravel(network, 5 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser1.address)).mul(2),
                await plasma.balanceOf(randomUser2.address),
                'User 1 balance should half of user 2',
                pointZeroOnePercent
            );
        });

        it('when deposit time is 2:1 with deposit amount being same, reward ratio should be 2:1', async () => {
            let lpTokenToDeposit = BigNumber.from(10).pow(19); // 10 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDeposit);

            await timeTravel(network, 5 * 86400);
            await blocksTravel(network, 1);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDeposit);

            await timeTravel(network, 5 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser2.address)).mul(2),
                await plasma.balanceOf(randomUser1.address),
                'User 1 balance should half of user 2',
                pointZeroOnePercent
            );
        });

        it('two users deposit lp tokens in same time, user 1 places withdraw request after half time, reward ratio should be 1:2, and user2 should be able to claim plasma after withdrawing', async () => {
            let lpTokenToDeposit = BigNumber.from(10).pow(19); // 10 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDeposit);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDeposit);

            await timeTravel(network, 7 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(randomUser1).placeWithdrawRequest(lpTokenToDeposit);

            await timeTravel(network, 7 * 86400);
            await blocksTravel(network, 1);

            // request count will be one as only 1 request is placed
            await expect(staking1.connect(randomUser1).withdraw(1, randomUser1.address))
                .to.emit(staking1, 'Withdraw')
                .withArgs(randomUser1.address, randomUser1.address, 1, lpTokenToDeposit);
            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser1.address)).mul(2),
                await plasma.balanceOf(randomUser2.address),
                'User 1 balance should half of user 2',
                pointZeroOnePercent
            );
        });

        it('Increase plasma reward Mid month by 50%, when deposit is in ratio of 1:2:3, reward ratio should be uneffected', async () => {
            let lpTokenToDepositForUser1 = BigNumber.from(10).pow(19); // 10 lp tokens
            let lpTokenToDepositForUser2 = BigNumber.from(10).pow(19).mul(2); // 20 lp tokens
            let lpTokenToDepositForUser3 = BigNumber.from(10).pow(19).mul(3); // 30 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDepositForUser1);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDepositForUser1);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDepositForUser2);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDepositForUser2);

            await lptoken1.connect(randomUser3).approve(staking1.address, lpTokenToDepositForUser3);
            await staking1.connect(randomUser3).depositLpToken(randomUser3.address, lpTokenToDepositForUser3);

            await timeTravel(network, 14 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser3).claimPlasma(randomUser3.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser1.address)).mul(2),
                await plasma.balanceOf(randomUser2.address),
                'User 1 balance should half of user 2',
                pointZeroOnePercent
            );

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser1.address)).mul(3),
                await plasma.balanceOf(randomUser3.address),
                'user 1 balance should be 1/3 of user3',
                pointZeroOnePercent
            );

            await timeTravel(network, 14 * 86400);
            await blocksTravel(network, 1);

            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0].mul(3).div(2));
            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser3).claimPlasma(randomUser3.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser1.address)).mul(2),
                await plasma.balanceOf(randomUser2.address),
                'User 1 balance should half of user 2',
                pointZeroOnePercent
            );

            expectApproxEqual(
                await (await plasma.balanceOf(randomUser1.address)).mul(3),
                await plasma.balanceOf(randomUser3.address),
                'user 1 balance should be 1/3 of user3',
                pointZeroOnePercent
            );
        });

        it('deposit ratio 1:1, reward should be 1:1, across 2 months if all params remained unchanged, when claim is made at end of 2 month', async () => {
            let lpTokenToDeposit = BigNumber.from(10).pow(19); // 10 lp tokens
            await lptoken1.connect(randomUser1).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser1).depositLpToken(randomUser1.address, lpTokenToDeposit);

            await lptoken1.connect(randomUser2).approve(staking1.address, lpTokenToDeposit);
            await staking1.connect(randomUser2).depositLpToken(randomUser2.address, lpTokenToDeposit);

            await timeTravel(network, 29 * 86400);
            await blocksTravel(network, 1);
            await staking1.connect(admin).updatePlasmaPointsPerMonth(0, plasmaPointForMonth[0]);

            await timeTravel(network, 30 * 86400);
            await blocksTravel(network, 1);
            await staking1.connect(admin).updatePlasmaPointsPerMonth(1, plasmaPointForMonth[1]);

            await expect(staking1.connect(randomUser1).claimPlasma(randomUser1.address)).to.emit(staking1, 'ClaimPlasma');

            await expect(staking1.connect(randomUser2).claimPlasma(randomUser2.address)).to.emit(staking1, 'ClaimPlasma');

            expectApproxEqual(
                await plasma.balanceOf(randomUser1.address),
                await plasma.balanceOf(randomUser2.address),
                'User 1 balance should half of user 2',
                pointZeroOnePercent
            );
        });
    });
});
