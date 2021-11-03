pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

contract WeaponStorage is AccessControl {
    using SafeMath for uint256;

    bytes32 public constant ADMIN = keccak256('ADMIN');
    bytes32 public constant GAME_SERVER = keccak256('GAME SERVER');

    address public admin;

    constructor(address _admin, address _gameServer) {
        admin = _admin;
        _setupRole(ADMIN, _admin);
        _setupRole(GAME_SERVER, _gameServer);
    }

    modifier onlyAdmin() {
        require(hasRole(ADMIN, msg.sender), 'Only admin can call');
        _;
    }

    modifier onlyGameServer() {
        require(hasRole(GAME_SERVER, msg.sender), 'Only gameServer can call');
        _;
    }
}
