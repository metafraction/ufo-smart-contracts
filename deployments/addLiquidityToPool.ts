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
    let amountToDeposit = BigNumber.from(1000000).mul(BigNumber.from(10).pow(18));

    console.log('Creating adding liquidity to pool');
    let [admin] = await ethers.getSigners();
    let deployHelper = new DeployHelper(admin);
    let uniswapPair = await deployHelper.helper.getUniswapV2Pair('0x1098c9973D6c634A9A85676f9f5987391c3C646B');
    let uniswapRouter: IUniswapV2Router02 = await deployHelper.helper.getUniswapV2Router02(hardhatConstants.uniswapV2Router02);

    let xtoken: ERC20 = await deployHelper.helper.getXToken('0x2f85A194D8B5AD4EcBF89E1C2DB3e1a14dD5a5FD');
    let ytoken: ERC20 = await deployHelper.helper.getXToken('0x9C8883a4C5b2D4498A0BFC8F72fc68c5fd36E4D3');

    console.log('Approving X1 Tokens');
    await xtoken.connect(admin).approve(uniswapRouter.address, amountToDeposit);
    console.log('Approving Y1 Tokens');
    await ytoken.connect(admin).approve(uniswapRouter.address, amountToDeposit);
    console.log('Trying to Add Liquidity to pool');
    await uniswapRouter
        .connect(admin)
        .addLiquidity(
            xtoken.address,
            ytoken.address,
            amountToDeposit,
            amountToDeposit,
            amountToDeposit.div(2),
            amountToDeposit.div(2),
            admin.address,
            BigNumber.from('999999999999'),
            { gasLimit: BigNumber.from('10000000') }
        );

    console.log('Added Liquidity Successfully');
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
