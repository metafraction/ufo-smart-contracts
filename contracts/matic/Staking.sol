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

    uint256 public possibleTotalPlasmaPoints;
    uint256 public startTime;
    uint256 public totalLpTokensLockedInThisContract;
    uint256 public totalWeightedLocked;

    mapping(address => uint256) public lpTokensLocked;
    mapping(uint256 => uint256) public maxRewardPerMonth;
    mapping(address => uint256) public plasmaClaimedTillNow;
    mapping(address => Locked[]) public lockedDeposit;

    // Events
    event DepositUfoLocked(address indexed _from, uint256 indexed _month);
    event SetPlasmaContract(address indexed _plasmaContract);
    event UpdatePlasmaPointsForMonth(uint256 indexed _month, uint256 points);
    event WithdrawAmount(address indexed _to, uint256 _amount);
    event WithdrawReward(address indexed _to, uint256 _amount);

    constructor(address _admin, address _lpToken) {
        _setupRole(ADMIN, _admin);
        lpToken = IERC20(_lpToken);
        startTime = block.timestamp;
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
    function depositUfoLocked(uint256 _amount, uint256 _month) public returns (bool) {
        require(_month == 0 || _month == 1 || _month == 3 || _month == 9 || _month == 21, 'month is not valid');
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
        lpTokensLocked[msg.sender] = lpTokensLocked[msg.sender].add(_amount);
        totalLpTokensLockedInThisContract = totalLpTokensLockedInThisContract.add(_amount);

        lpToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit DepositUfoLocked(msg.sender, _month);
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
            totalWeightedLocked = totalWeightedLocked.sub(lockedAmount.mul(deposit.weight).div(100));
            totalLpTokensLockedInThisContract = totalLpTokensLockedInThisContract.sub(deposit.amount);
            lpTokensLocked[msg.sender] = lpTokensLocked[msg.sender].sub(deposit.amount);
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

        plasmaClaimedTillNow[msg.sender] = plasmaClaimedTillNow[msg.sender].add(rewardAmount);

        plasmaContract.mint(msg.sender, rewardAmount);
        emit WithdrawReward(msg.sender, rewardAmount);
    }

    function getRewardAmount(address _address) public view returns (uint256) {
        uint256 rewardAmount;
        uint256 daysPassed;
        uint256 currentDay = getCurrentDay();
        uint256 currentMonth = getCurrentMonth();
        uint256 availablePlasma = possibleTotalPlasmaPoints.div(currentMonth.add(1).mul(30)); // divide by nbr of days the plasma has been allotted
        for (uint256 i = 0; i < lockedDeposit[_address].length; i++) {
            Locked memory deposit = lockedDeposit[_address][i];
            if (deposit.amount == 0) continue;

            daysPassed = currentDay.sub(deposit.lastWithdrawalDay);
            if (daysPassed == 0) continue;
            uint256 weightedDeposit = deposit.amount.mul(deposit.weight).div(100);

            if (currentDay > deposit.endDay) {
                uint256 stakeDays = deposit.endDay.sub(deposit.lastWithdrawalDay);
                uint256 additionalDays = currentDay.sub(deposit.endDay);

                // Formula -> Weighted average of the staked amount * (Available Plasma / Nbr contract days) * Nbr days staked
                // Available Plasma -> Total Plasma Points - Plasma Claimed Till Now
                // Weighted average of the staked amount -> Staked Amount * (Weight / 100) / total weighted staked
                // Nbr contract days -> Total number of days the contract has been running
                // Nbr days staked -> Number of days passed since last withdrawal

                rewardAmount = rewardAmount.add(weightedDeposit.mul(availablePlasma).mul(stakeDays).div(totalWeightedLocked)); // weightx for the stake days
                rewardAmount = rewardAmount.add(deposit.amount.mul(availablePlasma).mul(additionalDays).div(totalWeightedLocked)); // 1x for remaining days
            } else {
                uint256 stakeDays = currentDay.sub(deposit.lastWithdrawalDay);
                rewardAmount = rewardAmount.add(weightedDeposit.mul(availablePlasma).mul(stakeDays).div(totalWeightedLocked)); // weightx for the number of days staked.
            }
        }
        uint256 claimedPlasma = plasmaClaimedTillNow[_address];
        rewardAmount = rewardAmount.sub(claimedPlasma);

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
