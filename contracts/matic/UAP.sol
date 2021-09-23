pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

// @duplicate-contract: the contract is kept only as a name reference. Use normal token contract latter
contract UAP is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER = keccak256('MINTER');

    constructor(
        string memory name,
        string memory symbol,
        uint256 init_supply,
        address minter
    ) ERC20(name, symbol) {
        _mint(msg.sender, init_supply);
        _setupRole(MINTER, minter);
    }

    function mint(address _to, uint256 _amount) public onlyMinter returns (uint256) {
        require(_amount != 0, 'Amount should be greater than o');
        _mint(_to, _amount);
        return _amount;
    }

    modifier onlyMinter() {
        require(hasRole(MINTER, msg.sender), 'Only Address with minter role can mint tokens');
        _;
    }
}
