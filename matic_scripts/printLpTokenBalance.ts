import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import DeployHelper from '../utils/deployer';
import constants from '../constant.json';

async function main() {
    // We get the contract to deploy
    let [admin]: SignerWithAddress[] = await ethers.getSigners();
    let deployHelper: DeployHelper = new DeployHelper(admin);
    let token = await deployHelper.helper.getXToken(constants.goerli.pos_lp_tokens);
    console.table({
        tokenName: await token.name(),
        symbol: await token.symbol(),
        totalSupply: await token.totalSupply(),
        balance: await token.balanceOf(admin.address),
    });

    token = await deployHelper.helper.getXToken(constants.goerli.pos_ufo_token);
    console.table({
        tokenName: await token.name(),
        symbol: await token.symbol(),
        totalSupply: await token.totalSupply(),
        balance: await token.balanceOf(admin.address),
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
