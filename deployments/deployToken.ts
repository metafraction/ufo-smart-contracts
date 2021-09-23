import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import DeployHelper from '../utils/deployer';
import { BigNumber } from 'ethers';

async function main() {
    // We get the contract to deploy
    let [admin]: SignerWithAddress[] = await ethers.getSigners();
    let deployHelper: DeployHelper = new DeployHelper(admin);
    let x_token = await deployHelper.helper.deployXToken(
        'Y Base Token',
        'Y BT',
        BigNumber.from('5000000000').mul(BigNumber.from(10).pow(18)),
        admin.address
    );
    console.log({ x_token: x_token.address });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// 0x2f85A194D8B5AD4EcBF89E1C2DB3e1a14dD5a5FD
// 0x9C8883a4C5b2D4498A0BFC8F72fc68c5fd36E4D3
