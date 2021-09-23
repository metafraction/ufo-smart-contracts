import { Network } from 'hardhat/types';
import { BigNumberish } from '@ethersproject/bignumber';
import { BigNumber } from 'ethers';
import { assert, expect } from 'chai';

export async function timeTravel(network: Network, time: number) {
    await network.provider.request({
        method: 'evm_increaseTime',
        params: [time],
    });
}

export async function blocksTravel(network: Network, blocks: number) {
    for (let index = 0; index < blocks; index++) {
        await network.provider.request({
            method: 'evm_mine',
            params: [],
        });
    }
}

// delta = 10**18 means 1 percent
export function expectApproxEqual(a: BigNumberish, b: BigNumberish, errorMsg: string, delta: BigNumber = BigNumber.from(10).pow(16)) {
    let e18 = BigNumber.from(10).pow(18);
    let _a: BigNumber = BigNumber.from(a);
    let _b: BigNumber = BigNumber.from(b);
    let aGreaterThanB = _a.gte(_b);
    if (aGreaterThanB) {
        _a = BigNumber.from(a);
        _b = BigNumber.from(b);
    } else {
        _a = BigNumber.from(b);
        _b = BigNumber.from(a);
    }
    let _delta = _a.sub(_b).mul(e18).div(_a);
    // expect(_delta).lte(delta, errorMsg);
    assert(_delta.lte(delta), errorMsg);
}

export const onePercent = BigNumber.from(10).pow(16);
export const pointOnePercent = BigNumber.from(10).pow(15);
export const pointZeroOnePercent = BigNumber.from(10).pow(14);
