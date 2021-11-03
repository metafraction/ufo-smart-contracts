import hre from 'hardhat';
const ethers = hre.ethers;

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import DeployHelper from '../utils/deployer';
import { Breeder } from '../typechain/Breeder';
import { UFO } from '../typechain/UFO';
import { UAP } from '../typechain/UAP';

async function main() {
    let [admin, gameServer]: SignerWithAddress[] = await ethers.getSigners();
    let deployHelper: DeployHelper = new DeployHelper(admin);

    let breeder: Breeder = await deployHelper.matic.deployBreeder(admin.address);
    await induceDelay(10000);
    await verifyBreeder(breeder.address, [admin.address]);

    let ufo: UFO = await deployHelper.matic.deployUFO(admin.address, gameServer.address, breeder.address);
    await induceDelay(10000);
    await verifyUFO(ufo.address, [admin.address, gameServer.address, breeder.address]);

    await ufo.connect(admin).setPlasmaContract('0x1b3DF545885eE8811060cca44C98204caE127711'); // ask @blaziken for this address

    let uap: UAP = await deployHelper.helper.deployUAP('UAP', 'UAP', 0, ufo.address);
    await induceDelay(10000);
    await verifyUAP(uap.address, ['UAP', 'UAP', 0, ufo.address]);

    await ufo.connect(admin).setUapContract(uap.address);

    await registerFeatures(ufo, admin);
    await induceDelay(10000);
    await registerPossilibities(ufo, admin);

    console.table({
        uap: uap.address,
        ufo: ufo.address,
        breeder: breeder.address,
    });
}

async function verifyUAP(address: string, constructorArguments: any[]) {
    console.log(`Started verification`);
    await hre.run('verify:verify', {
        address,
        constructorArguments,
        contract: 'contracts/matic/UAP.sol:UAP',
    });

    return 'UAP Verified';
}

async function verifyUFO(address: string, constructorArguments: any[]) {
    console.log(`Started verification`);
    await hre.run('verify:verify', {
        address,
        constructorArguments,
        contract: 'contracts/matic/UFO.sol:UFO',
    });

    return 'UFO Verified';
}

async function verifyBreeder(address: string, constructorArguments: any[]) {
    console.log(`Started verification`);
    await hre.run('verify:verify', {
        address,
        constructorArguments,
        contract: 'contracts/matic/Breeder.sol:Breeder',
    });

    return 'Breeder Verified';
}

main().then(console.log).catch(console.log);

async function induceDelay(ts: number) {
    console.log(`Inducing delay of ${ts} ms`);
    return new Promise((resolve) => {
        setTimeout(resolve, ts);
    });
}

async function registerFeatures(ufo: UFO, admin: SignerWithAddress) {
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
        console.log(`Trying to add feature ${feature} : (${index + 1}/${features.length}) to UFO`);
        await ufo.connect(admin).registerFeatureType(feature);
        await induceDelay(10000);
    }
}

async function registerPossilibities(ufo: UFO, admin: SignerWithAddress) {
    let possibility = [
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'],
    ];

    for (let index = 0; index < possibility.length; index++) {
        const possibilityArray = possibility[index];
        for (let j = 0; j < possibilityArray.length; j++) {
            const element = possibilityArray[j];
            console.log(`Trying to add possibility ${element} : for feature index: (${index + 1})`);
            await ufo.connect(admin).registerFeaturePossibility(index + 1, element);
            await induceDelay(10000);
        }
    }
}
