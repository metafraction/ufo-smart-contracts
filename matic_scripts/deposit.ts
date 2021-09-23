import * as dotenv from 'dotenv';
dotenv.config();
import { MaticPOSClient } from '@maticnetwork/maticjs';
import HDWalletProvider from '@truffle/hdwallet-provider';
import constants from '../constant.json';

// console.log(process.env);

const parentProvider = new HDWalletProvider(`${process.env.GOERLI_PRIVATE_KEY}`, process.env.GOERLI_RPC);
const maticProvider = new HDWalletProvider(`${process.env.GOERLI_PRIVATE_KEY}`, process.env.GOERLI_RPC);

const maticPOSClient = new MaticPOSClient({
    network: 'testnet',
    version: 'mumbai',
    parentProvider,
    maticProvider,
});

async function main() {
    let amount = '1000000000000000000000'; //1000 lp tokens
    // console.log({parent: parentProvider.getAddress()})
    // console.log({matic: parentProvider.getAddress()})
    let tx = await maticPOSClient.depositERC20ForUser(constants.goerli.ufo_token, parentProvider.getAddress(), amount, {
        from: parentProvider.getAddress(),
        gasPrice: '3000000000',
    });

    console.log(tx);
    //0xad8ae5c167ca54d909462f9b4ea98a2942a6d934379e5cc9571f3d8ac873b98d
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
