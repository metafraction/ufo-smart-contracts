import { BigNumberish, BytesLike, Signer } from 'ethers';

import { XToken } from '../../typechain/XToken';
import { UAP } from '../../typechain/UAP';
import { ERC20 } from '../../typechain/ERC20';
import { IUniswapV2Factory } from '../../typechain/IUniswapV2Factory';
import { IUniswapV2Pair } from '../../typechain/IUniswapV2Pair';
import { IUniswapV2Router02 } from '../../typechain/IUniswapV2Router02';

import { XToken__factory } from '../../typechain/factories/XToken__factory';
import { UAP__factory } from '../../typechain/factories/UAP__factory';
import { ERC20__factory } from '../../typechain/factories/ERC20__factory';
import { IUniswapV2Factory__factory } from '../../typechain/factories/IUniswapV2Factory__factory';
import { IUniswapV2Pair__factory } from '../../typechain/factories/IUniswapV2Pair__factory';
import { IUniswapV2Router02__factory } from '../../typechain/factories/IUniswapV2Router02__factory';

import { IlockTokens } from '../../typechain/IlockTokens';
import { IlockTokens__factory } from '../../typechain/factories/IlockTokens__factory';

import { Address } from 'hardhat-deploy/dist/types';

export default class DeployHelperContracts {
    private _deployerSigner: Signer;

    constructor(deployerSigner: Signer) {
        this._deployerSigner = deployerSigner;
    }

    public async getIlockToken(contractAddress: Address): Promise<IlockTokens> {
        return await IlockTokens__factory.connect(contractAddress, this._deployerSigner);
    }

    public async getUniswapV2Router02(uniswapV2Router02: Address): Promise<IUniswapV2Router02> {
        return await IUniswapV2Router02__factory.connect(uniswapV2Router02, this._deployerSigner);
    }

    public async getUniswapV2Factory(uniswapV2Factory: Address): Promise<IUniswapV2Factory> {
        return await IUniswapV2Factory__factory.connect(uniswapV2Factory, this._deployerSigner);
    }

    public async getUniswapV2Pair(uniswapV2Pair: Address): Promise<IUniswapV2Pair> {
        return await IUniswapV2Pair__factory.connect(uniswapV2Pair, this._deployerSigner);
    }

    public async getMockERC20(tokenAddress: Address): Promise<ERC20> {
        return await new ERC20__factory(this._deployerSigner).attach(tokenAddress);
    }

    public async deployXToken(name: string, symbol: string, init_supply: BigNumberish, minter: string): Promise<XToken> {
        return await new XToken__factory(this._deployerSigner).deploy(name, symbol, init_supply, minter);
    }

    public async getXToken(tokenAddress: Address): Promise<XToken> {
        return new XToken__factory(this._deployerSigner).attach(tokenAddress);
    }

    public async deployUAP(name: string, symbol: string, init_supply: BigNumberish, minter: string): Promise<UAP> {
        return await new UAP__factory(this._deployerSigner).deploy(name, symbol, init_supply, minter);
    }

    public async getUAP(tokenAddress: Address): Promise<UAP> {
        return new UAP__factory(this._deployerSigner).attach(tokenAddress);
    }
}
