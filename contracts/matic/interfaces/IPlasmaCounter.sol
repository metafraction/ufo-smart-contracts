pragma solidity >=0.6.0 <0.8.0;

interface IPlasmaCounter {
    function getAllocationFraction(address _stakingContract) external view returns (uint256 num, uint256 den);
}
