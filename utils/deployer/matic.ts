import { BigNumberish, BytesLike, Signer } from 'ethers';
import { Staking } from '../../typechain/Staking';
import { Staking__factory } from '../../typechain/factories/Staking__factory';
import { Plasma } from '../../typechain/Plasma';
import { Plasma__factory } from '../../typechain/factories/Plasma__factory';
import { UFO } from '../../typechain/UFO';
import { UFO__factory } from '../../typechain/factories/UFO__factory';
import { Breeder } from '../../typechain/Breeder';
import { Breeder__factory } from '../../typechain/factories/Breeder__factory';
import { PlasmaCounter } from '../../typechain/PlasmaCounter';
import { PlasmaCounter__factory } from '../../typechain/factories/PlasmaCounter__factory';
export default class DeployMaticContracts {
    private _deployerSigner: Signer;

    constructor(deployerSigner: Signer) {
        this._deployerSigner = deployerSigner;
    }

    public async deployStaking(admin: string, lpToken: string, withdrawBufferTime: BigNumberish): Promise<Staking> {
        return new Staking__factory(this._deployerSigner).deploy(admin, lpToken, withdrawBufferTime);
    }

    public async getStaking(staking: string): Promise<Staking> {
        return new Staking__factory(this._deployerSigner).attach(staking);
    }

    public async deployPlasma(name: string, symbol: string, stakingContracts: string[], admin: string): Promise<Plasma> {
        return new Plasma__factory(this._deployerSigner).deploy(name, symbol, stakingContracts, admin);
    }

    public async getPlasma(plasma: string): Promise<Plasma> {
        return new Plasma__factory(this._deployerSigner).attach(plasma);
    }

    public async deployUFO(admin: string, gameServer: string, breeder: string): Promise<UFO> {
        return new UFO__factory(this._deployerSigner).deploy(admin, gameServer, breeder);
    }

    public async getUFO(contractAddress: string): Promise<UFO> {
        return new UFO__factory(this._deployerSigner).attach(contractAddress);
    }

    public async deployBreeder(admin: string): Promise<Breeder> {
        return new Breeder__factory(this._deployerSigner).deploy(admin);
    }

    public async getBreeder(contractAddress: string): Promise<Breeder> {
        return new Breeder__factory(this._deployerSigner).attach(contractAddress);
    }

    public async deployPlasmaCounter(admin: string): Promise<PlasmaCounter> {
        return new PlasmaCounter__factory(this._deployerSigner).deploy(admin);
    }

    public async getPlasmaCounter(contractAddress: string): Promise<PlasmaCounter> {
        return new PlasmaCounter__factory(this._deployerSigner).attach(contractAddress);
    }
}
