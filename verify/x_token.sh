#!/bin/bash
dotenv() {
    set -a
    [ -f .env ] && . .env
    set +a
}
dotenv
network=$1
contract_address=$2
echo "Starting etherscan verification of contract on $network blockchain..."

# hardhat verify --network $network --constructor-args ./verify/constructor_arguments.js --contract contracts/XToken.sol:XToken $contract_address
hardhat verify --network $network --constructor-args ./verify/x_token_param.js --contract contracts/XToken.sol:XToken $contract_address