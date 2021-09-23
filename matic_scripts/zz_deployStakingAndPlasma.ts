import hre from 'hardhat';
const ethers = hre.ethers;

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import DeployHelper from '../utils/deployer';
import { BigNumber } from 'ethers';
import constants from '../constant.json';

async function main() {
    // We get the contract to deploy
    let amountToTest = '1000000000000000000'; // 1 lp token/ 1 ofo token
    let one_day = BigNumber.from(1).mul('86400000');
    let two_day = BigNumber.from(2).mul('86400000');

    let [admin]: SignerWithAddress[] = await ethers.getSigners();
    let deployHelper: DeployHelper = new DeployHelper(admin);

    let stakingContract = await deployHelper.matic.deployStaking(admin.address, constants.goerli.pos_lp_tokens, one_day); // currently set to 1 day.
    console.log({ stakingContract: stakingContract.address });
    await induceDelay(10000);
    let stakingContract2 = await deployHelper.matic.deployStaking(admin.address, constants.goerli.pos_ufo_token, two_day); // currently set to 2 day.

    console.log({ stakingContract2: stakingContract2.address });
    await induceDelay(10000);
    let plasma = await deployHelper.matic.deployPlasma(
        'Plasma',
        'UFO-PSM',
        [stakingContract.address, stakingContract2.address],
        admin.address
    );
    console.log({ plasma: plasma.address });
    await induceDelay(10000);
    await stakingContract.setPlasmaContract(plasma.address);
    console.log('Setting plasma contract complete for staking contract1');
    await induceDelay(10000);
    await stakingContract2.setPlasmaContract(plasma.address);
    console.log('Setting plasma contract complete for staking contract2');

    try {
        await induceDelay(10000);
        await verifyPlasma(plasma.address, ['Plasma', 'UFO-PSM', [stakingContract.address, stakingContract2.address], admin.address]);
    } catch (ex) {
        console.log('Plasma verification error');
        console.log(ex);
    }
    try {
        await induceDelay(10000);
        await verifyStaking(stakingContract.address, [admin.address, constants.goerli.pos_lp_tokens, one_day]);
    } catch (ex) {
        console.log('staking verification error');
        console.log(ex);
    }

    try {
        await induceDelay(10000);
        await verifyStaking(stakingContract2.address, [admin.address, constants.goerli.pos_ufo_token, two_day]);
    } catch (ex) {
        console.log('staking2 verification error');
        console.log(ex);
    }

    console.table({
        plasma: plasma.address,
        stakingContract: stakingContract.address,
        stakingContract2: stakingContract2.address,
        pos_lp_tokens: constants.goerli.pos_lp_tokens,
        pos_ufo_tokens: constants.goerli.pos_ufo_token,
        admin: admin.address,
    });

    let lpToken = await deployHelper.helper.getMockERC20(constants.goerli.pos_lp_tokens);
    await lpToken.connect(admin).approve(stakingContract.address, amountToTest);
    await induceDelay(10000);
    await stakingContract.connect(admin).depositLpToken(admin.address, amountToTest);

    lpToken = await deployHelper.helper.getMockERC20(constants.goerli.pos_ufo_token);
    await induceDelay(10000);
    await lpToken.connect(admin).approve(stakingContract2.address, amountToTest);
    await induceDelay(10000);
    await stakingContract2.connect(admin).depositLpToken(admin.address, amountToTest);

    await induceDelay(10000);
    await stakingContract.connect(admin).updatePlasmaPointsPerMonth(0, '10000000000000000000000');

    await induceDelay(10000);
    await stakingContract2.connect(admin).updatePlasmaPointsPerMonth(0, '10000000000000000000000');
    return;
}

async function verifyPlasma(address: string, constructorArguments: any[]) {
    console.log(`Started verification`);
    await hre.run('verify:verify', {
        address,
        constructorArguments,
        contract: 'contracts/matic/Plasma.sol:Plasma',
    });

    return 'Plasma Verified';
}

async function verifyStaking(address: string, constructorArguments: any[]) {
    console.log(`Started verification`);
    await hre.run('verify:verify', {
        address,
        constructorArguments,
        contract: 'contracts/matic/Staking.sol:Staking',
    });

    return 'Staking Verified';
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

async function induceDelay(ts: number) {
    console.log(`Inducing delay of ${ts} ms`);
    return new Promise((resolve) => {
        setTimeout(resolve, ts);
    });
}
