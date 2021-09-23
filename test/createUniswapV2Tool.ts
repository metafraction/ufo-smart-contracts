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

import { mainnet as hardhatConstants } from '../utils/constants';

const { tokenCreationConstants, uniswapFactoryAddress, Contracts, Whale, testingAmountForDeposit, uniswapV2Router02 } = hardhatConstants;

describe('Create Uniswap V2 Pool', async () => {
    let admin: SignerWithAddress;
    let user: SignerWithAddress;

    let xtoken: XToken;
    let uniswapFactory: IUniswapV2Factory;
    let DaiTokenContract: ERC20;
    let DAIWhale: any;
    let uniswapPair: IUniswapV2Pair;
    let uniswapRouter: IUniswapV2Router02;

    before(async () => {
        [admin, user] = await ethers.getSigners();
        let deployHelper = new DeployHelper(admin);
        let { name, symbol, init_supply } = tokenCreationConstants;
        xtoken = await deployHelper.helper.deployXToken(name, symbol, init_supply, admin.address);
        uniswapFactory = await deployHelper.helper.getUniswapV2Factory(uniswapFactoryAddress);

        await network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [Whale.DAI],
        });

        await admin.sendTransaction({
            to: Whale.DAI,
            value: ethers.utils.parseEther('100'),
        });

        DAIWhale = await ethers.provider.getSigner(Whale.DAI);

        DaiTokenContract = await deployHelper.helper.getMockERC20(Contracts.DAI);
        await DaiTokenContract.connect(DAIWhale).transfer(admin.address, BigNumber.from('10').pow(23)); // 10,000 DAI

        await expect(uniswapFactory.connect(admin).createPair(DaiTokenContract.address, xtoken.address)).to.emit(
            uniswapFactory,
            'PairCreated'
        );

        let [token1, token2] = [DaiTokenContract.address, xtoken.address].sort((a, b) =>
            BigNumber.from(a).gt(BigNumber.from(b)) ? 1 : -1
        );
        let pairAddress = await uniswapFactory.getPair(token1, token2);
        uniswapPair = await deployHelper.helper.getUniswapV2Pair(pairAddress);
        uniswapRouter = await deployHelper.helper.getUniswapV2Router02(uniswapV2Router02);
    });

    it('Deposit Liquidity Tokens into uniswap pair', async () => {
        await xtoken.connect(admin).transfer(user.address, testingAmountForDeposit);
        await DaiTokenContract.connect(admin).transfer(user.address, testingAmountForDeposit);

        await xtoken.connect(user).approve(uniswapRouter.address, testingAmountForDeposit);
        await DaiTokenContract.connect(user).approve(uniswapRouter.address, testingAmountForDeposit);

        expect(await uniswapPair.balanceOf(user.address)).to.be.eq(0); // before adding liquidity
        let tx = uniswapRouter
            .connect(user)
            .addLiquidity(
                xtoken.address,
                DaiTokenContract.address,
                testingAmountForDeposit,
                testingAmountForDeposit,
                testingAmountForDeposit.div(2),
                testingAmountForDeposit.div(2),
                user.address,
                BigNumber.from('999999999999')
            );
        await expect(tx).to.emit(uniswapPair, 'Mint');
    });
});
