pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721Burnable.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721Holder.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721Pausable.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import './interfaces/IERC20Burnable.sol';
import './WeaponStorage.sol';

contract Weapons is ERC721, ERC721Burnable, ERC721Holder, WeaponStorage {
    using SafeMath for uint256;

    enum WeaponType {
        type1,
        type2,
        type3
    }

    struct WeaponDetails {
        uint256 id;
        WeaponType weaponType;
        uint256 power; // 100,000 means 100 power
    }

    mapping(uint256 => WeaponDetails) public weaponStore;
    IERC20Burnable uapContract;

    uint256 public totalNumberOfWeapons;
    uint256 uapBurnedPerRatingInrease = 10000000000000;

    event CreatedWeapon(uint256 indexed id, address owner);
    event SetUapContract(address indexed _uapContract);
    event UpgradedWeapon(uint256 indexed id, uint256 newPower, uint256 uapBurned);

    constructor(address _admin, address _gameServer) ERC721('Weapons', 'Weapons') WeaponStorage(_admin, _gameServer) {}

    function setUapContract(address _uapContract) public onlyAdmin {
        uapContract = IERC20Burnable(_uapContract);
        emit SetUapContract(_uapContract);
    }

    function CreateWeaponType1(address _to) public onlyAdmin {
        totalNumberOfWeapons = totalNumberOfWeapons.add(1);
        weaponStore[totalNumberOfWeapons] = WeaponDetails(totalNumberOfWeapons, WeaponType.type1, 100000);
        _safeMint(_to, totalNumberOfWeapons);
    }

    function CreateWeaponType2(address _to) public onlyAdmin {
        totalNumberOfWeapons = totalNumberOfWeapons.add(1);
        weaponStore[totalNumberOfWeapons] = WeaponDetails(totalNumberOfWeapons, WeaponType.type2, 50000);
        _safeMint(_to, totalNumberOfWeapons);
    }

    function CreateWeaponType3(address _to) public onlyAdmin {
        totalNumberOfWeapons = totalNumberOfWeapons.add(1);
        weaponStore[totalNumberOfWeapons] = WeaponDetails(totalNumberOfWeapons, WeaponType.type3, 10000);
        _safeMint(_to, totalNumberOfWeapons);
    }

    function UpgradeWeapon(uint256 id, uint256 increasePower) public {
        require(id != 0, 'Cannot update weapon 0');
        weaponStore[id].power = weaponStore[id].power.add(increasePower);
        uint256 uapToBurn = increasePower.mul(uapBurnedPerRatingInrease);
        uapContract.burnFrom(msg.sender, uapToBurn);
        emit UpgradedWeapon(id, weaponStore[id].power, uapToBurn);
    }
}
