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

import { goerli as hardhatConstants } from '../utils/constants';

async function main() {
    console.log('Creating Uniswap pool');
    let [admin] = await ethers.getSigners();
    let deployHelper = new DeployHelper(admin);
    let xtoken: ERC20 = await deployHelper.helper.getXToken('0x2f85A194D8B5AD4EcBF89E1C2DB3e1a14dD5a5FD');
    let ytoken: ERC20 = await deployHelper.helper.getXToken('0x9C8883a4C5b2D4498A0BFC8F72fc68c5fd36E4D3');
    let uniswapFactory: IUniswapV2Factory = await deployHelper.helper.getUniswapV2Factory(hardhatConstants.uniswapFactoryAddress);

    await uniswapFactory.connect(admin).createPair(xtoken.address, ytoken.address);
    await induceDelay(10000);
    let pairAddress = await uniswapFactory.getPair(xtoken.address, ytoken.address);
    console.log({ pairAddress }); //0x1098c9973D6c634A9A85676f9f5987391c3C646B
    // https://goerli.etherscan.io/address/0x1098c9973D6c634A9A85676f9f5987391c3C646B#code
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
