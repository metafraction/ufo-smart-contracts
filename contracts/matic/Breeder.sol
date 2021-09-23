pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import './interfaces/IUFO.sol';

contract Breeder is AccessControl, IERC721Receiver {
    using SafeMath for uint256;

    struct BreedingCell {
        uint256 ufo1;
        uint256 ufo2;
        uint256 unlockTime;
        address receiver;
        address requestCreator;
    }

    address public admin;
    bytes32 public constant ADMIN = keccak256('ADMIN');

    IERC721 ufoContract;
    IUFO ufoContractGenerator;

    uint256 public lockTime = 7 days;

    mapping(uint256 => BreedingCell) breedingRoom;
    uint256 public breedingRoomCounter;

    event ChangeLockTime(uint256 newLockTime);
    event StartBreeding(uint256 indexed ufo1, uint256 indexed ufo2, uint256 releaseTime);
    event CancelBreeding(uint256 indexed breedingCellNumber, uint256 indexed ufo1, uint256 ufo2);
    event CompleteBreeding(uint256 indexed breedingCellNumber, uint256 indexed ufo1, uint256 ufo2);

    constructor(address _admin) {
        admin = _admin;
        _setupRole(ADMIN, _admin);
    }

    function changeAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }

    function changeLockTimeDays(uint256 newLockTime) external onlyAdmin {
        lockTime = newLockTime.mul(1 days);
        emit ChangeLockTime(newLockTime);
    }

    function setUfoContract(address _ufoContract) external onlyAdmin {
        ufoContract = IERC721(_ufoContract);
        ufoContractGenerator = IUFO(_ufoContract);
    }

    function lockUFOsForBreeding(
        uint256 ufo1,
        uint256 ufo2,
        address _receiver
    ) external {
        require(ufo1 != ufo2, "Same UFOs can't breed");
        require(ufoContract.ownerOf(ufo1) == msg.sender, 'Only owner of ufo can breed');
        require(ufoContract.ownerOf(ufo2) == msg.sender, 'Only owner of ufo can breed');

        ufoContract.safeTransferFrom(msg.sender, address(this), ufo1);
        ufoContract.safeTransferFrom(msg.sender, address(this), ufo2);

        breedingRoomCounter = breedingRoomCounter.add(1);
        uint256 releaseTime = block.timestamp.add(lockTime);
        breedingRoom[breedingRoomCounter] = BreedingCell(ufo1, ufo2, releaseTime, _receiver, msg.sender);
        emit StartBreeding(ufo1, ufo2, releaseTime);
    }

    function getChildUfo(uint256 breedingCellNumber) external {
        require(breedingRoom[breedingCellNumber].receiver == msg.sender, 'Only receiver address can new UFO');
        require(block.timestamp > breedingRoom[breedingCellNumber].unlockTime, "Can't get child UFO while parents are breeding");

        ufoContractGenerator.CreateAlpha(msg.sender);
        ufoContract.approve(msg.sender, breedingRoom[breedingCellNumber].ufo1);
        ufoContract.approve(msg.sender, breedingRoom[breedingCellNumber].ufo2);
        emit CompleteBreeding(breedingCellNumber, breedingRoom[breedingCellNumber].ufo1, breedingRoom[breedingCellNumber].ufo2);
        delete breedingRoom[breedingCellNumber];
    }

    function releaseUfoWithoutBreeding(uint256 breedingCellNumber) external {
        require(breedingRoom[breedingCellNumber].requestCreator == msg.sender, 'Only receiver address can new UFO');
        ufoContract.approve(msg.sender, breedingRoom[breedingCellNumber].ufo1);
        ufoContract.approve(msg.sender, breedingRoom[breedingCellNumber].ufo2);
        emit CancelBreeding(breedingCellNumber, breedingRoom[breedingCellNumber].ufo1, breedingRoom[breedingCellNumber].ufo2);
        delete breedingRoom[breedingCellNumber];
    }

    //@incomplete: implement proper receiver
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        // to be complete
        return this.onERC721Received.selector;
    }

    modifier onlyAdmin() {
        require(hasRole(ADMIN, msg.sender), 'Only admin can call');
        _;
    }
}
