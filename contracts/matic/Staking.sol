// SPDX-License-Identifier: Unlicense
pragma solidity >= 0.6.0 < 0.8.0;

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

struct Locked {
    uint256 amount;
    uint256 startDay;
    uint256 endDay;
    uint256 weight;
}

struct WithdrawalRequest {
    uint256 amount;
    uint256 releaseTime;
}

contract Staking is AccessControl, ERC20 {
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

    mapping(address => Deposit)  public lastDeposit;
    mapping(address => uint256)  public lpTokensLocked;
    mapping(uint256 => uint256)  public maxRewardPerMonth;
    mapping(address => uint256)  public totalLpTokensInWithdrawlRequests;
    mapping(address => uint256)  public withdrawRequestCount;
    mapping(address => Locked[]) public lockedDeposit;
    mapping(address => uint256)  public lockedDepositIndex;

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
    ) ERC20('Staking Shares', 'SHRS') {
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

    modifier onlyIfAmountIsLeft(uint256 _amount) {
        uint256 _amountRemaining = lpTokensLocked[msg.sender].sub(totalLpTokensInWithdrawlRequests[msg.sender]);
        require(_amountRemaining >= _amount, 'no remaining token left to place withdraw request');
        _;
    }

    // --- PUBLIC ---

    function claimPlasma(address _to) public {
        _deposit(msg.sender, 0);
        uint256 _currentBalance = balanceOf(msg.sender);
        uint256 possiblePlasmaPoints = possiblePlasmaPointsCurrentMonth();
        uint256 plasmaToGenerate = (possiblePlasmaPoints.sub(plasmaClaimedTillNow)).mul(_currentBalance).div(balanceOf(deadAccount));
        require(possiblePlasmaPoints >= plasmaClaimedTillNow.add(plasmaToGenerate), "Can't mint more than current month permits");

        plasmaClaimedTillNow = plasmaClaimedTillNow.add(plasmaToGenerate);
        plasmaContract.mint(_to, plasmaToGenerate);

        _burn(msg.sender, _currentBalance);
        _burn(deadAccount, _currentBalance);
        emit ClaimPlasma(_to, plasmaToGenerate);
    }

    /**
     * @dev deposit ufo token with a locking period, set blockCount to minimum unlocking period,
     * set weight based on month, push locking period into lockedDeposit mapping, and call depositLpToken
     */
    function depositUfoLocked(address _to, uint256 _amount, uint256 _month) public returns (bool) {
        require(_month == 0 || _month == 1 || _month == 3 || _month == 9 || _month == 21, 'month is not valid');
        require(_to != address(0), 'address can not be address(0)');
        require(_amount != 0, 'amount must be greater than 0');
        require(lpToken.balanceOf(msg.sender) >= _amount, 'user balance must be greater than or equal to amount');
        uint256 weight;
        uint256 currentDay = getCurrentDay();
        uint256 endDay = currentDay.add(_month.mul(30));
 
        if      (_month == 0)  { weight = 100; }
        else if (_month == 3)  { weight = 125; }
        else if (_month == 3)  { weight = 150; }
        else if (_month == 9)  { weight = 200; }
        else if (_month == 21) { weight = 300; }

        totalWeightedLocked = totalWeightedLocked.add(_amount.mul(weight).div(100));
        lockedDeposit[msg.sender].push(Locked(_amount, currentDay, endDay, weight));
        lpToken.safeTransferFrom(msg.sender, address(this), _amount);
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
        uint256 rewardAmount;
        uint256 daysPassed;
        uint256 startIndex = lockedDepositIndex[msg.sender];
        uint256 currentDay = getCurrentDay();

        for (uint256 i = startIndex; i < lockedDeposit[msg.sender].length; i++) {
            Locked memory deposit = lockedDeposit[msg.sender][i];
            daysPassed = currentDay.sub(deposit.startDay);
            if (daysPassed == 0) continue;
            rewardAmount = rewardAmount.add(deposit.amount.mul(deposit.weight.div(100)));
            if (currentDay > deposit.endDay) {
                uint256 daysPassedEndDay = currentDay.sub(deposit.endDay);
                rewardAmount = rewardAmount.add(deposit.amount.div(totalWeightedLocked).div(daysPassed));
            }
            rewardAmount = rewardAmount.add(rewardAmount.div(totalWeightedLocked).div(daysPassed));
            lockedDepositIndex[msg.sender]++;
            deposit.startDay = currentDay;
        }

        plasmaContract.transferFrom(address(this), msg.sender, rewardAmount);
        emit WithdrawReward(msg.sender, rewardAmount);
    }

    function getRewardAmount(address _address) public view returns (uint256) {
        uint256 rewardAmount;
        uint256 daysPassed;
        uint256 startIndex = lockedDepositIndex[_address];
        uint256 currentDay = getCurrentDay();

        for (uint256 i = startIndex; i < lockedDeposit[_address].length; i++) {
            Locked memory deposit = lockedDeposit[_address][i];
            daysPassed = currentDay.sub(deposit.startDay);
            if (daysPassed == 0) continue;
            rewardAmount = rewardAmount.add(deposit.amount.div(totalWeightedLocked).div(daysPassed));
        }

        return rewardAmount;
    }

    // --- PUBLIC MODIFIER ---

    function placeWithdrawRequest(uint256 _amount) public onlyIfAmountIsLeft(_amount) {
        _withdrawRequest(msg.sender, _amount);
    }

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
        _mintForExistingWeight(_d, _to);

        lastDeposit[_to] = Deposit(_d.amount.add(_amount), block.timestamp);
        lpTokensLocked[_to] = lpTokensLocked[_to].add(_amount);

        totalLpTokensLockedInThisContract = totalLpTokensLockedInThisContract.add(_amount);
        totalLpTokenLockedInThisContractLastUpdatedAt = block.timestamp;

        emit DepositLpTokens(_to, _amount);
    }

    function _mintForExistingWeight(Deposit memory _d, address _to) internal {
        uint256 _existingWeight = _d.amount.mul(block.timestamp.sub(_d.lastUpdated));
        uint256 _existingTotalWeight = (totalLpTokensLockedInThisContract.sub(totalLpTokensInWithdrawlRequestsInThisContract))
            .mul(block.timestamp.sub(totalLpTokenLockedInThisContractLastUpdatedAt)
        );

        if (_existingWeight != 0) {
            _mint(_to, _existingWeight);
        }

        if (_existingTotalWeight != 0) {
            _mint(deadAccount, _existingTotalWeight);
        }
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
