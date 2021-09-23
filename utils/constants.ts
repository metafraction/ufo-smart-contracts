import { BigNumber } from '@ethersproject/bignumber';

export const mainnet = {
    uniswapFactoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    uniswapV2Router02: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    tokenCreationConstants: {
        name: 'X Token',
        symbol: 'XT',
        init_supply: BigNumber.from(1).mul(BigNumber.from(10).pow(23)),
    },
    Contracts: {
        DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    },
    Whale: {
        DAI: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    },
    testingAmountForDeposit: BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
};

export const goerli = {
    uniswapFactoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    uniswapV2Router02: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
};

export const zeroAddress = '0x0000000000000000000000000000000000000000';
