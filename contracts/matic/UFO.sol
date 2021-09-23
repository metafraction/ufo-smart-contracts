pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721Burnable.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721Holder.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721Pausable.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import './interfaces/IERC20Burnable.sol';
import './interfaces/IERC20Mintable.sol';
import './UFOStorage.sol';

contract UFO is ERC721, ERC721Burnable, ERC721Holder, UFOStorage {
    using SafeMath for uint256;

    enum UfoType {
        origin,
        alpha,
        beta
    }

    struct UfoDetails {
        uint256 id;
        uint256 rating; // 100,000 means 100 rating
        bool special;
        bool paused;
        uint256 lastUpdated;
        UfoType ufoType;
        uint256 unclaimedUap;
        uint256[] features;
        uint256[] values;
    }

    mapping(uint256 => UfoDetails) public ufoStore;

    uint256 public totalNumberOfUFOs;
    IERC20Burnable plasmaContract;
    IERC20Mintable uapContract;

    uint256 costUfoEp = uint256(1000).mul(10**18);

    constructor(
        address _admin,
        address _gameServer,
        address _breeder
    ) ERC721('UFO', 'UFO') UFOStorage(_admin, _gameServer, _breeder) {}

    event SetPlasmaContract(address indexed _plasmaContract);
    event SetUapContract(address indexed _uapContract);

    event UpdateUfo(uint256 indexed, uint256 feature, uint256 value);
    event IncreaseUfoRating(uint256 indexed, uint256 ratingIncreased);
    event DecreaseUfoRating(uint256 indexed, uint256 ratingDecreased);
    event UpdateUfoRating(uint256 indexed, uint256 latestRating);
    event PauseRatingUdpate(uint256 indexed);
    event UnpauseRatingUdpate(uint256 indexed);

    event AddUnclaimedUap(uint256 indexed, uint256 uapAdded, uint256 totalUnclaimedUap);
    event ClaimUap(uint256 indexed, address to, uint256 amount);

    function setPlasmaContract(address _plasmaContract) public onlyAdmin {
        plasmaContract = IERC20Burnable(_plasmaContract);
        emit SetPlasmaContract(_plasmaContract);
    }

    function setUapContract(address _uapContract) public onlyAdmin {
        uapContract = IERC20Mintable(_uapContract);
        emit SetUapContract(_uapContract);
    }

    function CreateOrigin() public {
        plasmaContract.burnFrom(msg.sender, costUfoEp);
        totalNumberOfUFOs = totalNumberOfUFOs.add(1);

        uint256 init_ratings = uint256(100000).add(_getRandomness() % 100000);

        UfoDetails memory ufo = _generateUfoWithRandomFeatures(totalNumberOfUFOs, init_ratings);
        ufo.ufoType = UfoType.origin;
        ufoStore[totalNumberOfUFOs] = ufo;
        _safeMint(msg.sender, totalNumberOfUFOs);
    }

    function CreateAlpha(address _to) public onlyBreeder {
        totalNumberOfUFOs = totalNumberOfUFOs.add(1);
        UfoDetails memory ufo = _generateUfoWithRandomFeatures(totalNumberOfUFOs, 0);
        ufo.ufoType = UfoType.beta;
        ufoStore[totalNumberOfUFOs] = ufo;
        _safeMint(_to, totalNumberOfUFOs);
    }

    function CreateBeta(address _to) public onlyBreeder {
        totalNumberOfUFOs = totalNumberOfUFOs.add(1);
        UfoDetails memory ufo = _generateUfoWithRandomFeatures(totalNumberOfUFOs, 0);
        ufo.ufoType = UfoType.alpha;
        ufoStore[totalNumberOfUFOs] = ufo;
        _safeMint(_to, totalNumberOfUFOs);
    }

    function IncreaseRatingMultipleUfo(uint256[] memory ids, uint256[] memory amountsToIncrease) public onlyGameServer {
        require(ids.length == amountsToIncrease.length, 'Ids and amountsToIncrease should be of same length');
        for (uint256 index = 0; index < ids.length; index++) {
            IncreaseRatingSingleUfo(ids[index], amountsToIncrease[index]);
        }
    }

    function DecreaseRatingMultipleUfo(uint256[] memory ids, uint256[] memory amountsToDecrease) public onlyGameServer {
        require(ids.length == amountsToDecrease.length, 'Ids and amountsToIncrease should be of same length');
        for (uint256 index = 0; index < ids.length; index++) {
            DecreaseRatingSingleUfo(ids[index], amountsToDecrease[index]);
        }
    }

    function ChangeAbsoluteRatingMultipleUfo(uint256[] memory ids, uint256[] memory newRatings) public onlyGameServer {
        require(ids.length == newRatings.length, 'Ids and new ratings should be of same length');
        for (uint256 index = 0; index < ids.length; index++) {
            ChangeAbsoluteRating(ids[index], newRatings[index]);
        }
    }

    function IncreaseRatingSingleUfo(uint256 id, uint256 amountToInrease) public onlyGameServer {
        require(!ufoStore[id].paused, 'Cannot update UFO if rating update is paused');
        if (ufoStore[id].special) {
            amountToInrease = amountToInrease.mul(3);
        }
        ufoStore[id].rating = ufoStore[id].rating.add(amountToInrease);
        ufoStore[id].lastUpdated = block.timestamp;
        emit IncreaseUfoRating(id, amountToInrease);
        emit UpdateUfoRating(id, ufoStore[id].rating);
    }

    function DecreaseRatingSingleUfo(uint256 id, uint256 amountToDecrease) public onlyGameServer {
        require(!ufoStore[id].paused, 'Cannot update UFO if rating update is paused');
        if (ufoStore[id].special) {
            amountToDecrease = amountToDecrease.mul(3);
        }
        if (ufoStore[id].rating < amountToDecrease) {
            ufoStore[id].rating = 0;
        } else {
            ufoStore[id].rating = ufoStore[id].rating.sub(amountToDecrease);
        }
        ufoStore[id].lastUpdated = block.timestamp;
        emit DecreaseUfoRating(id, amountToDecrease);
        emit UpdateUfoRating(id, ufoStore[id].rating);
    }

    function ChangeAbsoluteRating(uint256 id, uint256 newRating) public onlyGameServer {
        require(!ufoStore[id].paused, 'Cannot update UFO if rating update is paused');
        ufoStore[id].rating = newRating;
        ufoStore[id].lastUpdated = block.timestamp;
        emit UpdateUfoRating(id, newRating);
    }

    function PauseMultiUfoRatingUpdate(uint256[] memory ids) public onlyGameServer {
        for (uint256 index = 0; index < ids.length; index++) {
            PauseRatingUdpate(ids[index]);
        }
    }

    function UnpauseMultiUfoRatingUpdate(uint256[] memory ids) public onlyGameServer {
        for (uint256 index = 0; index < ids.length; index++) {
            UnpauseRatingUdpate(ids[index]);
        }
    }

    function PauseUfoRatingUpdate(uint256 id) public onlyGameServer {
        ufoStore[id].paused = true;
        emit PauseRatingUdpate(id);
    }

    function UnPauseUfoRatingUpdate(uint256 id) public onlyGameServer {
        ufoStore[id].paused = false;
        emit UnpauseRatingUdpate(id);
    }

    function _generateUfoWithRandomFeatures(uint256 id, uint256 init_rating) internal view returns (UfoDetails memory _ufo) {
        require(featureCounts != 0, 'Cannot generate UFO if features count is 0');
        _ufo.id = id;
        _ufo.rating = init_rating;
        _ufo.features = new uint256[](featureCounts);
        _ufo.values = new uint256[](featureCounts);
        _ufo.lastUpdated = block.timestamp;
        uint256 randomness = _getRandomness();
        for (uint256 index = 1; index <= featureCounts; index++) {
            require(possibilityCount[index] != 0, 'Cannot generate UFO if possibility count is 0');
            uint256 possibilities = possibilityCount[index];
            _ufo.features[index.sub(1)] = index;
            _ufo.values[index.sub(1)] = (uint256(sha256(abi.encode(randomness.add(index)))) % possibilities).add(1);
        }

        // @test: only for testing
        if (randomness % 10 == 0) {
            _ufo.special = true;
        }
    }

    function addUnclaimedUapForMultipleUfo(uint256[] memory ids, uint256[] memory amounts) public onlyGameServer {
        require(ids.length == amounts.length, 'Ids and amounts must of same length');
        for (uint256 index = 0; index < ids.length; index++) {
            addUnclaimedUap(ids[index], amounts[index]);
        }
    }

    function addUnclaimedUap(uint256 id, uint256 amount) public onlyGameServer {
        ufoStore[id].unclaimedUap = ufoStore[id].unclaimedUap.add(amount);
        emit AddUnclaimedUap(id, amount, ufoStore[id].unclaimedUap);
    }

    function claimUap(uint256 id, address to) public onlyOwnerOf(id) {
        uapContract.mint(to, ufoStore[id].unclaimedUap);
        emit ClaimUap(id, to, ufoStore[id].unclaimedUap);
        ufoStore[id].unclaimedUap = 0;
    }


    // @modify: find a way to get randomness from chainlink oracle
    function _getRandomness() internal view returns (uint256) {
        return uint256(blockhash(block.number));
    }

    function updateSingleUfo(
        uint256 id,
        uint256[] memory features,
        uint256[] memory new_outputs
    ) public onlyGameServer {
        require(_exists(id), 'Can only token that exists');
        require(features.length == new_outputs.length, 'Features and new outputs array must be of same length');
        for (uint256 index = 0; index < features.length; index++) {
            uint256 _feature = features[index];
            uint256 _value = new_outputs[index];
            require(featureTypes[_feature].valid, 'Features needs to exists to be updated');
            require(featureTypePossibilities[_feature][_value].valid, 'Feature Possibility needs to exists to be updated');
            ufoStore[id].values[_feature.sub(1)] = _value;
            emit UpdateUfo(id, _feature, _value);
        }
    }

    function updateMultipleUfo(
        uint256[] memory ids,
        uint256[][] memory features,
        uint256[][] memory new_outputs
    ) public onlyGameServer {
        require(features.length == new_outputs.length, 'Features and new_outputs length should be same');
        require(features.length == ids.length, 'Ids and new_outputs length should be same');
        for (uint256 index = 0; index < ids.length; index++) {
            updateSingleUfo(ids[index], features[index], new_outputs[index]);
        }
    }

    modifier onlyOwnerOf(uint256 id) {
        require(ownerOf(id) == msg.sender, 'Only Breeder contract can call this');
        _;
    }

    function getUfoFeatures(uint256 ufoId) public view returns (uint256[] memory) {
        return ufoStore[ufoId].features;
    }

    function getUfoValues(uint256 ufoId) public view returns (uint256[] memory) {
        return ufoStore[ufoId].values;
    }

    function getOtherUfoDetails(uint256 ufoId)
        public
        view
        returns (
            uint256,
            bool,
            bool,
            uint256,
            UfoType,
            uint256
        )
    {
        return (
            ufoStore[ufoId].rating,
            ufoStore[ufoId].special,
            ufoStore[ufoId].paused,
            ufoStore[ufoId].lastUpdated,
            ufoStore[ufoId].ufoType,
            ufoStore[ufoId].unclaimedUap
        );
    }
}
