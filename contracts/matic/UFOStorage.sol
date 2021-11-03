pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

contract UFOStorage is AccessControl {
    using SafeMath for uint256;

    struct Feature {
        bool valid;
        string featureName;
    }

    struct Possibility {
        bool valid;
        string possibilityName;
    }

    mapping(uint256 => Feature) public featureTypes;
    uint256 public featureCounts;

    mapping(uint256 => mapping(uint256 => Possibility)) public featureTypePossibilities;
    mapping(uint256 => uint256) possibilityCount;

    bytes32 public constant ADMIN = keccak256('ADMIN');
    bytes32 public constant GAME_SERVER = keccak256('GAME SERVER');
    bytes32 public constant BREEDER = keccak256('BREEDER');

    address public admin;
    address public breeder;
    address public gameServer;

    constructor(
        address _admin,
        address _gameServer,
        address _breeder
    ) {
        admin = _admin;
        breeder = _breeder;
        gameServer = _gameServer;

        _setupRole(ADMIN, _admin);
        _setupRole(GAME_SERVER, _gameServer);
        _setupRole(BREEDER, _breeder);
    }

    event RegisterFeature(uint256 indexed featureIndex, string featureName);
    event RegisterPossibility(uint256 indexed featureIndex, uint256 indexed featurePossibility, string possibilityName);

    modifier onlyAdmin() {
        require(hasRole(ADMIN, msg.sender), 'Only admin can call');
        _;
    }

    modifier onlyGameServer() {
        require(hasRole(GAME_SERVER, msg.sender), 'Only gameServer can call');
        _;
    }

    modifier onlyBreeder() {
        require(hasRole((BREEDER), msg.sender), 'Only Breeder contract can call this');
        _;
    }

    function registerFeatureType(string memory featureName) external onlyAdmin {
        featureCounts = featureCounts.add(1);
        uint256 featureIndex = featureCounts;

        require(featureTypes[featureIndex].valid == false, "Can't register if feature type is already registered");
        featureTypes[featureIndex] = Feature(true, featureName);
        emit RegisterFeature(featureIndex, featureName);
    }

    function registerFeaturePossibility(uint256 featureIndex, string memory possibilityName) external onlyAdmin {
        uint256 _temp = possibilityCount[featureIndex].add(1);
        possibilityCount[featureIndex] = _temp;

        uint256 featurePossibility = _temp;
        require(featureTypes[featureIndex].valid, 'Can only register possiblity for a valid feature type');
        require(
            featureTypePossibilities[featureIndex][featurePossibility].valid == false,
            "Can't register if possibility type is already registered"
        );
        featureTypePossibilities[featureIndex][featurePossibility] = Possibility(true, possibilityName);
        emit RegisterPossibility(featureIndex, featurePossibility, possibilityName);
    }
}
