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
import { UFO } from '../typechain/UFO';
import { Breeder } from '../typechain/Breeder';
import { blocksTravel, timeTravel } from '../utils/helper';

describe('Generate and Update UFO', async () => {
    // create lp tokens before that

    let lptoken1: ERC20;
    let lptoken2: ERC20;

    let staking1: Staking;
    let staking2: Staking;

    let plasma: Plasma;
    let admin: SignerWithAddress;
    let gameServer: SignerWithAddress;
    let mockBreeder: SignerWithAddress;

    let ufo: UFO;

    beforeEach(async () => {
        [, admin, , , gameServer, , , mockBreeder] = await ethers.getSigners();
        let deployHelper = new DeployHelper(admin);
        lptoken1 = await deployHelper.helper.deployXToken('LP Token1', 'LP1', BigNumber.from('100000000000000000000000'), admin.address);
        lptoken2 = await deployHelper.helper.deployXToken('LP Token2', 'LP2', BigNumber.from('100000000000000000000000'), admin.address);

        staking1 = await deployHelper.matic.deployStaking(admin.address, lptoken1.address, 0);
        staking2 = await deployHelper.matic.deployStaking(admin.address, lptoken2.address, 0);

        plasma = await deployHelper.matic.deployPlasma('Plasma', 'UFO-PSM', [staking1.address, staking2.address], admin.address);

        await staking1.setPlasmaContract(plasma.address);
        await staking2.setPlasmaContract(plasma.address);
    });

    async function depositTokensToStakingContract(signer: SignerWithAddress, amountToTest: BigNumberish) {
        await lptoken1.connect(signer).approve(staking1.address, amountToTest);
        await staking1.connect(signer).depositLpToken(admin.address, amountToTest);

        await lptoken2.connect(signer).approve(staking2.address, amountToTest);
        await staking2.connect(signer).depositLpToken(admin.address, amountToTest);
    }

    async function updatePlasmaReward(signer: SignerWithAddress, rewardPerMonth: BigNumberish) {
        let currentMonth: BigNumberish = await staking1.getCurrentMonth();
        await staking1.connect(signer).updatePlasmaPointsPerMonth(currentMonth, rewardPerMonth);

        currentMonth = await staking2.getCurrentMonth();
        await staking2.connect(signer).updatePlasmaPointsPerMonth(currentMonth, rewardPerMonth);

        await staking1.connect(signer).claimPlasma(signer.address);
        await staking2.connect(signer).claimPlasma(signer.address);
    }

    describe('Basic LP Tokens check', async () => {
        it('Deposit LP Tokens', async () => {
            let amountToTest = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
            await depositTokensToStakingContract(admin, amountToTest);
        });

        it('Update reward per month and claim plasma', async () => {
            let amountToTest = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
            let rewardPerMonth = BigNumber.from(5500).mul(BigNumber.from(10).pow(18));

            await depositTokensToStakingContract(admin, amountToTest);
            await updatePlasmaReward(admin, rewardPerMonth);
        });
    });

    async function registerFeatures() {
        const features = [
            'SoldierHead',
            'SoldierChest',
            'SoldierHip',
            'SoldierLLArm',
            'SoldierLUArm',
            'SoldierRLArm',
            'SoldierRUArm',
            'SoldierLLLeg',
            'SoldierRULeg',
            'SoldierRLLeg',
            'SoldierLULeg',
        ];

        for (let index = 0; index < features.length; index++) {
            const feature = features[index];
            await ufo.connect(admin).registerFeatureType(feature);
        }
    }

    async function registerPossilibities() {
        let possibility = [
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
            ['Red', 'Black', 'Green', 'Pink'],
        ];

        for (let index = 0; index < possibility.length; index++) {
            const possibilityArray = possibility[index];
            for (let j = 0; j < possibilityArray.length; j++) {
                const element = possibilityArray[j];
                await ufo.connect(admin).registerFeaturePossibility(index + 1, element);
            }
        }
    }

    describe('Register UFO features', async () => {
        beforeEach(async () => {
            let deployHelper = new DeployHelper(admin);
            ufo = await deployHelper.matic.deployUFO(admin.address, gameServer.address, mockBreeder.address);
        });

        it('Register features in ufo', async () => {
            await registerFeatures();
        });

        it('Register Possibility', async () => {
            await registerFeatures();
            await registerPossilibities();
        });
    });

    describe('Generate Child UFO', async () => {
        let breeder: Breeder;
        let ufo1ForBreeding: BigNumberish;
        let ufo2ForBreeding: BigNumberish;

        beforeEach(async () => {
            let deployHelper = new DeployHelper(admin);
            breeder = await deployHelper.matic.deployBreeder(admin.address);

            ufo = await deployHelper.matic.deployUFO(admin.address, gameServer.address, breeder.address);
            await registerFeatures();
            await registerPossilibities();
            let amountToTest = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
            let rewardPerMonth = BigNumber.from(5500).mul(BigNumber.from(10).pow(18));

            await depositTokensToStakingContract(admin, amountToTest);
            await updatePlasmaReward(admin, rewardPerMonth);

            await ufo.connect(admin).setPlasmaContract(plasma.address);

            let amountToApprove = BigNumber.from(10000).mul(BigNumber.from(10).pow(18));

            await plasma.connect(admin).approve(ufo.address, amountToApprove);
            await ufo.connect(admin).CreateOrigin();
            ufo1ForBreeding = await ufo.totalNumberOfUFOs();

            await ufo.connect(admin).CreateOrigin();
            ufo2ForBreeding = await ufo.totalNumberOfUFOs();

            await breeder.connect(admin).setUfoContract(ufo.address);
        });

        it('Breeding before each test', async () => {
            await ufo.connect(admin).approve(breeder.address, ufo1ForBreeding);
            await ufo.connect(admin).approve(breeder.address, ufo2ForBreeding);

            await breeder.connect(admin).lockUFOsForBreeding(ufo1ForBreeding, ufo2ForBreeding, admin.address);
            let breederCell = await breeder.breedingRoomCounter();
            await timeTravel(network, 7 * 86400);
            await blocksTravel(network, 1);
            await breeder.connect(admin).getChildUfo(breederCell);

            let latestUfoId = await ufo.totalNumberOfUFOs();

            console.log({
                ufoFeatures: (await ufo.getUfoFeatures(latestUfoId)).map((a) => a.toString()),
                parent1UfoValues: (await ufo.getUfoValues(1)).map((a) => a.toString()),
                parent2UfoValues: (await ufo.getUfoValues(2)).map((a) => a.toString()),
                childUfoValues: (await ufo.getUfoValues(latestUfoId)).map((a) => a.toString()),
            });
        });
    });

    describe('Generate UFO and Update it', async () => {
        beforeEach(async () => {
            let deployHelper = new DeployHelper(admin);
            ufo = await deployHelper.matic.deployUFO(admin.address, gameServer.address, mockBreeder.address);
            await registerFeatures();
            await registerPossilibities();
            let amountToTest = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
            let rewardPerMonth = BigNumber.from(5500).mul(BigNumber.from(10).pow(18));

            await depositTokensToStakingContract(admin, amountToTest);
            await updatePlasmaReward(admin, rewardPerMonth);

            await ufo.connect(admin).setPlasmaContract(plasma.address);
        });

        it('Trying to generate UFO', async () => {
            let amountToApprove = BigNumber.from(10000).mul(BigNumber.from(10).pow(18));

            await plasma.connect(admin).approve(ufo.address, amountToApprove);
            await ufo.connect(admin).CreateOrigin();
            let latestUfoId = await ufo.totalNumberOfUFOs();
            console.log({
                ufoFeatures: (await ufo.getUfoFeatures(latestUfoId)).map((a) => a.toString()),
                ufoValues: (await ufo.getUfoValues(latestUfoId)).map((a) => a.toString()),
            });
        });

        it('Update UFO', async () => {
            let amountToApprove = BigNumber.from(10000).mul(BigNumber.from(10).pow(18));

            await plasma.connect(admin).approve(ufo.address, amountToApprove);
            await ufo.connect(admin).CreateOrigin();
            let latestUfoId = await ufo.totalNumberOfUFOs();
            let valuesBefore = await ufo.getUfoValues(latestUfoId);

            await ufo.connect(gameServer).updateSingleUfo(latestUfoId, [1], [1]);
            let valuesAfter = await ufo.getUfoValues(latestUfoId);

            console.log({ valuesBefore, valuesAfter });
        });

        it('Update Multiple UFOs', async () => {
            let amountToApprove = BigNumber.from(10000).mul(BigNumber.from(10).pow(18));
            await plasma.connect(admin).approve(ufo.address, amountToApprove);

            await ufo.connect(admin).CreateOrigin();
            let firstUfoId = await ufo.totalNumberOfUFOs();

            await ufo.connect(admin).CreateOrigin();
            let secondUfoId = await ufo.totalNumberOfUFOs();

            await ufo.connect(gameServer).updateMultipleUfo(
                [firstUfoId, secondUfoId],
                [
                    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
                    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
                ],
                [
                    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
                    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
                ]
            );

            let valuesAfterFor1stUfo = await ufo.getUfoValues(firstUfoId);
            let valuesAfterFor2ndUfo = await ufo.getUfoValues(secondUfoId);
            console.log({ valuesAfterFor1stUfo, valuesAfterFor2ndUfo });
        });
    });
});
