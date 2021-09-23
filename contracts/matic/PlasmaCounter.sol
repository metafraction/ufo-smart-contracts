pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';

// @unsed-contract: 
contract PlasmaCounter is AccessControl {
    using SafeMath for uint256;

    bytes32 public constant ADMIN = keccak256('ADMIN');

    uint256 public totalAllocation; // number to be used as fractions

    mapping(address => uint256) public stakingContractAllocation; // numbers to be used a fractions

    constructor(address _admin) {
        _setupRole(ADMIN, _admin);
    }

    function addAllocation(address _stakingContract, uint256 allocationToAdd) external {
        require(hasRole(ADMIN, msg.sender), 'Only Admin can edit the allocations');
        stakingContractAllocation[_stakingContract] = stakingContractAllocation[_stakingContract].add(allocationToAdd);
        totalAllocation = totalAllocation.add(allocationToAdd);
    }

    function removeAllocation(address _stakingContract, uint256 allocationToRemove) external {
        require(hasRole(ADMIN, msg.sender), 'Only Admin can edit the allocations');
        stakingContractAllocation[_stakingContract] = stakingContractAllocation[_stakingContract].sub(allocationToRemove);
        totalAllocation = totalAllocation.sub(allocationToRemove);
    }

    function getAllocationFraction(address _stakingContract) public view returns (uint256 num, uint256 den) {
        den = 10**18;
        num = stakingContractAllocation[_stakingContract].mul(den).div(totalAllocation);
    }
}
