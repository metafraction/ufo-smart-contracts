pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import './interfaces/IERC20Mintable.sol';

struct Deposit {
    uint256 amount;
    uint256 lastUpdated;
}

struct WithdrawalRequest {
    uint256 amount;
    uint256 releaseTime;
}

struct Locked {
  uint256 amount;
  uint256 weight;
  uint256 blockCount;
}

contract Staking is AccessControl, ERC20 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN = keccak256('ADMIN');
    uint256 public constant blocksPerDay = 6300;
    uint256 public withdrawBufferTime;

    uint256 public startTime;
    uint256 public totalWeightedLocked;

    IERC20Mintable public plasmaContract;
    IERC20 public lpToken;

    mapping(address => Deposit) public lastDeposit;
    mapping(address => uint256) public lpTokensLocked;
    mapping(address => uint256) public totalLpTokensInWithdrawlRequests;
    mapping(address => uint256) public withdrawRequestCount;
    mapping(address => mapping(uint256 => WithdrawalRequest)) public withdrawRequests;
    mapping(uint256 => uint256) maxRewardPerMonth;
    mapping(address => Locked) public lockedDeposit;
    mapping(address => uint256) public totalUserDeposited;

    uint256 public totalLpTokensLockedInThisContract;
    uint256 public totalLpTokenLockedInThisContractLastUpdatedAt;

    uint256 public totalLpTokensInWithdrawlRequestsInThisContract;

    uint256 public plasmaClaimedTillNow;
    uint256 public possibleTotalPlasmaPoints;

    // @modify: modify with a proper variable name. the addresses should be a random
    address eeee = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    constructor(
        address _admin,
        address _lpToken,
        uint256 _withdrawBufferTime
    ) ERC20('Staking Shares', 'SHRS') {
        _setupRole(ADMIN, _admin);
        lpToken = IERC20(_lpToken);
        startTime = block.timestamp;
        withdrawBufferTime = _withdrawBufferTime.mul(1 days);
        totalLpTokenLockedInThisContractLastUpdatedAt = block.timestamp;
    }

    event SetPlasmaContract(address indexed _plasmaContract);
    event DepositLpTokens(address indexed _to, uint256 _amount);
    event DepositUfoLocked(address indexed _from, uint256 indexed _month);
    event WithdrawlRequestForLpTokens(address indexed _from, uint256 _requestCount, uint256 _amount);
    event Withdraw(address indexed _from, address to, uint256 _requestCount, uint256 _amount);
    event WithdrawLocked(address indexed _to, uint256 _amount);
    event AddPlamsa(uint256 _amount);
    event ClaimPlasma(address indexed _to, uint256 amount);
    event UpdatePlasmaPointsForMonth(uint256 indexed _month, uint256 points);

    function setPlasmaContract(address _plasmaContract) public onlyAdmin {
        plasmaContract = IERC20Mintable(_plasmaContract);
        emit SetPlasmaContract(_plasmaContract);
    }

    function depositLpToken(address _to, uint256 _amount) public {
        require(_to != address(0), 'address can not be address(0)');
        require(_amount != 0, 'amount must be greater than 0');
        require(lpToken.balanceOf(msg.sender) >= _amount, 'user balance must be greater than or equal to amount');
        lpToken.safeTransferFrom(msg.sender, address(this), _amount);
        _deposit(_to, _amount);
    }

    function depositUfoLocked(address _to, uint256 _amount, uint256 _month) public returns (bool) {
        require(_month == 1 || _month == 3 || _month == 9 || _month == 21, 'month is not valid'); 

        lockedDeposit[msg.sender].blockCount = block.number + blocksPerDay.mul(30).mul(_month);
        lockedDeposit[msg.sender].amount = _amount; 

        if(_month == 1) {
          lockedDeposit[msg.sender].weight = 125;
        } else if(_month == 3) {
          lockedDeposit[msg.sender].weight = 150;
        } else if(_month == 9) {
          lockedDeposit[msg.sender].weight = 200;
        } else if(_month == 21) {
          lockedDeposit[msg.sender].weight = 300;
        }

        totalWeightedLocked += _amount.mul(lockedDeposit[msg.sender].weight);

        depositLpToken(_to, _amount);

        emit DepositUfoLocked(msg.sender, _month);
    }

    function withdrawLocked() public {
        require(block.number >= lockedDeposit[msg.sender].blockCount, 'locking period still in progress');

        uint256 reward = 0;

        //uint256 reward = lockedDeposit[msg.sender].weight; // divide by 100
        uint256 amount = totalUserDeposited[msg.sender] + reward;
        lpToken.safeTransferFrom(address(this), msg.sender, amount);

        totalUserDeposited[msg.sender] = 0;

        emit WithdrawLocked(msg.sender, amount);
    }

    function _mintForExistingWeight(Deposit memory _d, address _to) internal {
        uint256 _existingWeight = _d.amount.mul(block.timestamp.sub(_d.lastUpdated));
        uint256 _existingTotalWeight = (totalLpTokensLockedInThisContract.sub(totalLpTokensInWithdrawlRequestsInThisContract)).mul(
            block.timestamp.sub(totalLpTokenLockedInThisContractLastUpdatedAt)
        );

        if (_existingWeight != 0) {
            _mint(_to, _existingWeight);
        }
        if (_existingTotalWeight != 0) {
            _mint(eeee, _existingTotalWeight);
        }
    }

    function _deposit(address _to, uint256 _amount) internal {
        Deposit memory _d = lastDeposit[_to];
        _mintForExistingWeight(_d, _to);

        lastDeposit[_to] = Deposit(_d.amount.add(_amount), block.timestamp);
        lpTokensLocked[_to] = lpTokensLocked[_to].add(_amount);

        totalLpTokensLockedInThisContract = totalLpTokensLockedInThisContract.add(_amount);
        totalLpTokenLockedInThisContractLastUpdatedAt = block.timestamp;
  
        totalUserDeposited[msg.sender] += _amount;

        emit DepositLpTokens(_to, _amount);
    }

    function placeWithdrawRequest(uint256 _amount) public onlyIfAmountIsfLeft(_amount) {
        _withdrawRequest(msg.sender, _amount);
    }

    function _withdrawRequest(address _from, uint256 _amount) internal {
        uint256 requestCount = withdrawRequestCount[_from].add(1);
        Deposit memory _d = lastDeposit[_from];
        _mintForExistingWeight(_d, _from);

        lastDeposit[_from] = Deposit(_d.amount.sub(_amount), block.timestamp);
        withdrawRequestCount[_from] = requestCount;
        withdrawRequests[_from][requestCount] = WithdrawalRequest(_amount, block.timestamp.add(withdrawBufferTime));
        totalLpTokensInWithdrawlRequests[msg.sender] = totalLpTokensInWithdrawlRequests[msg.sender].add(_amount);

        totalLpTokensInWithdrawlRequestsInThisContract = totalLpTokensInWithdrawlRequestsInThisContract.add(_amount);
        totalLpTokenLockedInThisContractLastUpdatedAt = block.timestamp;

        emit WithdrawlRequestForLpTokens(_from, requestCount, _amount);
    }

    function withdraw(uint256 _requestCount, address _to) public {
        require(_to != address(0), 'Address Cannot be 0');
        _withdraw(_requestCount, _to);
    }

    function _withdraw(uint256 _requestCount, address _to) internal {
        WithdrawalRequest memory _w = withdrawRequests[msg.sender][_requestCount];
        require(_w.amount != 0, 'Invalid Withdrawl Request');
        require(block.timestamp > _w.releaseTime, 'Can withdraw only after deadline');
        lpTokensLocked[msg.sender] = lpTokensLocked[msg.sender].sub(_w.amount);
        totalLpTokensInWithdrawlRequests[msg.sender] = totalLpTokensInWithdrawlRequests[msg.sender].sub(_w.amount);
        totalLpTokensInWithdrawlRequestsInThisContract = totalLpTokensInWithdrawlRequestsInThisContract.sub(_w.amount);
        totalLpTokensLockedInThisContract = totalLpTokensLockedInThisContract.sub(_w.amount);

        lpToken.safeTransfer(_to, _w.amount);
        emit Withdraw(msg.sender, _to, _requestCount, _w.amount);
        withdrawRequests[msg.sender][_requestCount].amount = 0;
    }

    function claimPlasma(address _to) public {
        _deposit(msg.sender, 0);

        uint256 _currentBalance = balanceOf(msg.sender);
        uint256 possiblePlasmaPossible = possiblePlasmaPointsCurrentMonth();
        uint256 plasmaToGenerate = (possiblePlasmaPossible.sub(plasmaClaimedTillNow)).mul(_currentBalance).div(balanceOf(eeee));
        require(possiblePlasmaPossible >= plasmaClaimedTillNow.add(plasmaToGenerate), "Can't mint more than current month permits");
        plasmaClaimedTillNow = plasmaClaimedTillNow.add(plasmaToGenerate);
        plasmaContract.mint(_to, plasmaToGenerate);
        _burn(msg.sender, _currentBalance);
        _burn(eeee, _currentBalance);
        emit ClaimPlasma(_to, plasmaToGenerate);
    }

    function possiblePlasmaPointsCurrentMonth() public view returns (uint256) {
        uint256 _month = getCurrentMonth();
        return maxRewardPerMonth[_month];
    }

    function getCurrentMonth() public view returns (uint256) {
        uint256 _ts = block.timestamp;
        uint256 _month = (_ts.sub(startTime)).div(30 days);
        return _month;
    }

    // assumption: we assume that plasma points are not modifyable after month complete
    function updatePlasmaPointsPerMonth(uint256 _month, uint256 _points) external onlyAdmin {
        uint256 _ts = block.timestamp;
        uint256 _current_month = (_ts.sub(startTime)).div(30 days);
        require(_month >= _current_month, 'Cannot update plasma points of the past');
        require(_points > maxRewardPerMonth[_month], 'Can not decrease the plasma points during update');
        possibleTotalPlasmaPoints = possibleTotalPlasmaPoints.add(_points).sub(maxRewardPerMonth[_month]);
        maxRewardPerMonth[_month] = _points;
        emit UpdatePlasmaPointsForMonth(_month, _points);
    }

    modifier onlyAdmin() {
        require(hasRole(ADMIN, msg.sender), 'Only admin can call');
        _;
    }

    modifier onlyIfAmountIsfLeft(uint256 _amount) {
        uint256 _amountRemaining = lpTokensLocked[msg.sender].sub(totalLpTokensInWithdrawlRequests[msg.sender]);
        require(_amountRemaining >= _amount, 'no remaining token left to place withdraw request');
        _;
    }
}
