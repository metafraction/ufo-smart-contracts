import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { expect } from 'chai';

import DeployHelper from '../utils/deployer';
import { IlockTokens } from '../typechain/IlockTokens';

describe.skip('Lock Tokens', async () => {
    it('check deposit id', async () => {
        const [account]: SignerWithAddress[] = await ethers.getSigners();
        let deployHelper = new DeployHelper(account);
        let lockTokens: IlockTokens = await deployHelper.helper.getIlockToken('0xC77aab3c6D7dAb46248F3CC3033C856171878BD5');

        console.log({ depositId: await (await lockTokens.depositId()).toString() });
    });

    it('Checking Withdrawl', async () => {
        await network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: ['0x378ddb6914e32c4d9c0e08881d460ee9c6c73b82'],
        });

        let ufoDevSigner: SignerWithAddress = await ethers.getSigner('0x378ddb6914e32c4d9c0e08881d460ee9c6c73b82');
        let deployHelper = new DeployHelper(ufoDevSigner);
        let lockTokens: IlockTokens = await deployHelper.helper.getIlockToken('0xC77aab3c6D7dAb46248F3CC3033C856171878BD5');
        await lockTokens.withdrawTokens(1551);
    });

    it('Checking on mainnet', async () => {
        const [account]: SignerWithAddress[] = await ethers.getSigners();
        let deployHelper = new DeployHelper(account);
        let lockTokens: IlockTokens = await deployHelper.helper.getIlockToken('0xC77aab3c6D7dAb46248F3CC3033C856171878BD5');

        const withdrawlAddressToSearch = '0x378ddb6914e32c4d9c0e08881d460ee9c6c73b82'.toLowerCase();

        // start from 2040, 1st possible 1551
        for (let index = 1550; index > 0; index--) {
            let result = await lockTokens.lockedToken(index);
            let address = result.withdrawalAddress;
            address = address.toLowerCase();
            console.log(`Searching ${index} of 2040`);
            if (address == withdrawlAddressToSearch) {
                console.log({
                    address,
                    withdrawlAddressToSearch,
                });
                break;
            } else {
                console.table({ index, address, withdrawlAddressToSearch });
            }
        }
    });
});
