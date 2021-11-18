pragma solidity >=0.6.0 <0.8.5;

import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IERC20Mintable.sol';

struct Deposit {
  uint256 amount;
  uint256 lastUpdated;
}

struct Locked {
  uint256 amount;
  uint256 startDay;
  uint256 endDay;
  uint256 weight;
  uint256 lastWithdrawalDay;
}

struct WithdrawalRequest {
  uint256 amount;
  uint256 releaseTime;
}

contract Staking is AccessControl {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  IERC20 public lpToken;
  IERC20Mintable public plasmaContract;

  bytes32 public constant ADMIN = keccak256('ADMIN');

  uint256 public plasmaClaimedTillNow;
  uint256 public possibleTotalPlasmaPoints;
  uint256 public startTime;
  uint256 public totalLpTokenLockedInThisContractLastUpdatedAt;
  uint256 public totalLpTokensLockedInThisContract;
  uint256 public totalLpTokensInWithdrawlRequestsInThisContract;
  uint256 public totalWeightedLocked;
  uint256 public withdrawBufferTime;

  mapping(address => Deposit) public lastDeposit;
  mapping(address => uint256) public lpTokensLocked;
  mapping(uint256 => uint256) public maxRewardPerMonth;
  mapping(address => uint256) public totalLpTokensInWithdrawlRequests;
  mapping(address => uint256) public withdrawRequestCount;
  mapping(address => Locked[]) public lockedDeposit;

  mapping(address => mapping(uint256 => WithdrawalRequest)) public withdrawRequests;

  // @modify: modify with a proper variable name. the addresses should be a random
  address deadAccount = 0x000000000000000000000000000000000000dEaD;

  // Events
  event AddPlamsa(uint256 _amount);
  event ClaimPlasma(address indexed _to, uint256 amount);
  event DepositLpTokens(address indexed _to, uint256 _amount);
  event DepositUfoLocked(address indexed _from, uint256 indexed _month);
  event SetPlasmaContract(address indexed _plasmaContract);
  event UpdatePlasmaPointsForMonth(uint256 indexed _month, uint256 points);
  event Withdraw(address indexed _from, address to, uint256 _requestCount, uint256 _amount);
  event WithdrawAmount(address indexed _to, uint256 _amount);
  event WithdrawReward(address indexed _to, uint256 _amount);
  event WithdrawlRequestForLpTokens(address indexed _from, uint256 _requestCount, uint256 _amount);

  constructor(
    address _admin,
    address _lpToken,
    uint256 _withdrawBufferTime
  ) {
    _setupRole(ADMIN, _admin);
    lpToken = IERC20(_lpToken);
    startTime = block.timestamp;
    withdrawBufferTime = _withdrawBufferTime.mul(1 days);
    totalLpTokenLockedInThisContractLastUpdatedAt = block.timestamp;
  }

  // --- MODIFIER ---

  modifier onlyAdmin() {
    require(hasRole(ADMIN, msg.sender), 'Only admin can call');
    _;
  }

  // --- PUBLIC ---

  /**
   * @dev deposit ufo token with a locking period, set blockCount to minimum unlocking period,
   * set weight based on month, push locking period into lockedDeposit mapping, and call depositLpToken
   */
  function depositUfoLocked(
    address _to,
    uint256 _amount,
    uint256 _month
  ) public returns (bool) {
    require(_month == 0 || _month == 1 || _month == 3 || _month == 9 || _month == 21, 'month is not valid');
    require(_to != address(0), 'address can not be address(0)');
    require(_amount != 0, 'amount must be greater than 0');
    require(lpToken.balanceOf(msg.sender) >= _amount, 'user balance must be greater than or equal to amount');
    uint256 weight;
    uint256 currentDay = getCurrentDay();
    uint256 endDay = currentDay.add(_month.mul(30));

    if (_month == 0) {
      weight = 100;
    } else if (_month == 1) {
      weight = 125;
    } else if (_month == 3) {
      weight = 150;
    } else if (_month == 9) {
      weight = 200;
    } else if (_month == 21) {
      weight = 300;
    }

    totalWeightedLocked = totalWeightedLocked.add(_amount.mul(weight).div(100));
    lockedDeposit[msg.sender].push(Locked(_amount, currentDay, endDay, weight, currentDay));
    lpToken.safeTransferFrom(msg.sender, address(this), _amount);
    _deposit(_to, _amount);
    emit DepositUfoLocked(msg.sender, _month);
  }

  function withdraw(uint256 _requestCount, address _to) public {
    require(_to != address(0), 'Address Cannot be 0');
    _withdraw(_requestCount, _to);
  }

  /**
   * @dev withdraw the orignal amount that was staked after the locking period is over, also account for when
   * multiple deposit transactions take place
   */
  function withdrawAmount(uint256 index) public {
    uint256 lockedAmount;

    Locked memory deposit = lockedDeposit[msg.sender][index];
    if (getCurrentDay() >= deposit.endDay && deposit.amount > 0) {
      lockedAmount = deposit.amount;
      totalWeightedLocked = totalWeightedLocked.sub(lockedAmount);
      deposit.amount = 0;
      lpToken.safeTransferFrom(address(this), msg.sender, lockedAmount);
      emit WithdrawAmount(msg.sender, lockedAmount);
    }
  }

  /**
   * @dev withdraw the reward amount that is accumulated after locking period, also account for when multiple
   * deposit transactions take place
   */
  function withdrawReward() public {
    uint256 rewardAmount = getRewardAmount(msg.sender);
    require(rewardAmount > 0, 'No reward to withdraw');

    uint256 currentDay = getCurrentDay();
    uint256 daysPassed;

    for (uint256 i = 0; i < lockedDeposit[msg.sender].length; i++) {
      Locked memory deposit = lockedDeposit[msg.sender][i];
      if (deposit.amount == 0) continue;

      daysPassed = currentDay.sub(deposit.lastWithdrawalDay);
      if (daysPassed == 0) continue;
      deposit.lastWithdrawalDay = currentDay;
    }

    plasmaClaimedTillNow = plasmaClaimedTillNow.add(rewardAmount);

    plasmaContract.mint(msg.sender, rewardAmount);
    emit WithdrawReward(msg.sender, rewardAmount);
  }

  function getRewardAmount(address _address) public view returns (uint256) {
    uint256 rewardAmount;
    uint256 daysPassed;
    uint256 currentDay = getCurrentDay();
    uint256 availablePlasmaToHarvest = possibleTotalPlasmaPoints.sub(plasmaClaimedTillNow);
    for (uint256 i = 0; i < lockedDeposit[_address].length; i++) {
      Locked memory deposit = lockedDeposit[_address][i];
      if (deposit.amount == 0) continue;

      daysPassed = currentDay.sub(deposit.lastWithdrawalDay);
      if (daysPassed == 0) continue;

      if (currentDay > deposit.endDay) {
        uint256 stakeDays = deposit.endDay.sub(deposit.lastWithdrawalDay);
        uint256 additionalDays = currentDay.sub(deposit.endDay);
        rewardAmount.add(deposit.amount.mul(deposit.weight.div(100)).mul(availablePlasmaToHarvest.div(30)).mul(stakeDays).div(totalWeightedLocked)); // Weightx for staked days
        rewardAmount.add(deposit.amount.mul(availablePlasmaToHarvest.div(30)).mul(additionalDays).div(totalWeightedLocked)); // 1x for remaining days
      } else {
        uint256 stakeDays = currentDay.sub(deposit.lastWithdrawalDay);
        rewardAmount.add(deposit.amount.mul(deposit.weight.div(100)).mul(availablePlasmaToHarvest.div(30)).mul(stakeDays).div(totalWeightedLocked)); // weightx for the number of days staked.
      }
    }

    return rewardAmount;
  }

  // --- PUBLIC MODIFIER ---

  function setPlasmaContract(address _plasmaContract) public onlyAdmin {
    plasmaContract = IERC20Mintable(_plasmaContract);
    emit SetPlasmaContract(_plasmaContract);
  }

  // --- PUBLIC VIEW ---

  function getCurrentDay() public view returns (uint256) {
    uint256 _ts = block.timestamp;
    uint256 _day = (_ts.sub(startTime)).div(1 days);
    return _day;
  }

  function getCurrentMonth() public view returns (uint256) {
    uint256 _ts = block.timestamp;
    uint256 _month = (_ts.sub(startTime)).div(30 days);
    return _month;
  }

  function possiblePlasmaPointsCurrentMonth() public view returns (uint256) {
    uint256 _month = getCurrentMonth();
    return maxRewardPerMonth[_month];
  }

  // --- INTERNAL ---

  function _deposit(address _to, uint256 _amount) internal {
    Deposit memory _d = lastDeposit[_to];

    lastDeposit[_to] = Deposit(_d.amount.add(_amount), block.timestamp);
    lpTokensLocked[_to] = lpTokensLocked[_to].add(_amount);

    totalLpTokensLockedInThisContract = totalLpTokensLockedInThisContract.add(_amount);
    totalLpTokenLockedInThisContractLastUpdatedAt = block.timestamp;

    emit DepositLpTokens(_to, _amount);
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

  // --- EXTERNAL ---

  // assumption: we assume that plasma points are not modifyable after month complete
  function updatePlasmaPointsPerMonth(uint256 _month, uint256 _points) external onlyAdmin {
    uint256 current_month = getCurrentMonth();
    require(_month >= current_month, 'Cannot update plasma points of the past');
    require(_points > maxRewardPerMonth[_month], 'Can not decrease the plasma points during update');

    possibleTotalPlasmaPoints = possibleTotalPlasmaPoints.add(_points).sub(maxRewardPerMonth[_month]);
    maxRewardPerMonth[_month] = _points;
    emit UpdatePlasmaPointsForMonth(_month, _points);
  }
}
