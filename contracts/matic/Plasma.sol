// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

contract Plasma is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER = keccak256('MINTER');
    bytes32 public constant ADMIN = keccak256('ADMIN');

    bool paused;

    event Paused();

    constructor(
        string memory name,
        string memory symbol,
        address[] memory stakingContracts,
        address admin
    ) ERC20(name, symbol) {
        for (uint256 index = 0; index < stakingContracts.length; index++) {
            _setupRole(MINTER, stakingContracts[index]);
        }
        _setupRole(ADMIN, admin);
    }

    function mint(address _to, uint256 _amount) external onlyWhenNotPaused returns (uint256) {
        require(hasRole(MINTER, msg.sender), 'Only staking contract can mint');
        require(_amount != 0, 'Amount to mint cannot be zero');
        _mint(_to, _amount);
        return _amount;
    }

    function pause() external {
        require(hasRole(ADMIN, msg.sender), 'Only Admin can pause the minting');
        paused = true;
        emit Paused();
    }

    modifier onlyWhenNotPaused() {
        require(!paused, "Can't when minting is paused");
        _;
    }
}
