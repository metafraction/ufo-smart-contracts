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
    let tx = await maticPOSClient.approveERC20ForDeposit(constants.goerli.ufo_token, amount, { from: parentProvider.getAddress() });
    console.log(tx);
    //0xf935ae88ca4f7431db70482577e602a815f372592e9248fdee9eb63eaecc3330
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
