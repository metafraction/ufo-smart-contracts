// SPDX-License-Identifier: Unlicense
pragma solidity >= 0.6.0 < 0.8.0;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import './interfaces/IERC20Mintable.sol';

contract Staking is AccessControl {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // -- Token Contracts --
    IERC20 public lpToken;
    IERC20Mintable public plasmaContract;

    // Admin account
    bytes32 public constant ADMIN = keccak256('ADMIN');

    // -- Counters --
    uint256 public possibleTotalPlasmaPoints;
    uint256 public startTime;
    uint256 public totalLpTokensLocked;

    // -- Mappings --
    mapping(uint256 => uint256)  public maxRewardPerMonth;
    mapping(address => uint256)  public plasmaClaimedTillNow;
    mapping(address => uint256)  public lastPlasmaClaimedDay;
    mapping(address => Locked[]) public lockedDeposit;
    mapping(uint256 => uint256)  public totalWeightedLockedForTheDay;
    mapping(address => uint256)  public lpTokensLocked;

    /**
     * @notice Object that represents each locked deposit
     * `amount` Total ufo tokens locked
     * `startDay` Start timestamp of lock
     * `endDay` End timestamp of lock
     * `weight` Integer value of month
     * `withdrawalDay` Day of withdrawl
     * `withdrawn` Amount withdrawn
     */
    struct Locked {
        uint256 amount;
        uint256 startDay;
        uint256 endDay;
        uint256 weight;
        uint256 withdrawalDay;
        bool withdrawn;
    }

    // Events
    event DepositUfoLocked   (address indexed _from, uint256 indexed _month, uint256 _amount);
    event SetPlasmaContract  (address indexed _contract);
    event UpdatePlasmaPoints (uint256 indexed _month, uint256 points);
    event WithdrawAmount     (address indexed _to, uint256 _amount, uint256 indexed _day);
    event WithdrawReward     (address indexed _to, uint256 _amount, uint256 indexed _day);

    /**
     * @notice Initializes contract and sets state variables.
     * @param _admin Address admin account
     * @param _lpToken Address of lptoken contract
     */
    constructor(address _admin, address _lpToken) {
        _setupRole(ADMIN, _admin);
        lpToken = IERC20(_lpToken);
        startTime = block.timestamp;
    }

    /**
     * @notice Modifier that checks if caller is `admin`.
     */
    modifier onlyAdmin() {
        require(hasRole(ADMIN, msg.sender), 'Only admin can call');
        _;
    }

    /**
     * @notice Deposit ufo token with a locking period, set blockCount to minimum unlocking period,
     * set weight based on month, push locking period into lockedDeposit mapping, and call depositLpToken.
     * @param _amount Total ufo tokens locked
     * @param _month Integer value of month
     * Requirements:
     *
     * - `month` must be a valid month.
     * - `amount` must be greater than 0.
     * - `msg.sender` balance of lp token must be greater than or equal to amount.
     *
     * Emits a {Transfer & DepositUfoLocked} event.
     */
    function depositUfoLocked(uint256 _amount, uint256 _month) public returns (bool) {
        require(_amount != 0, 'depositUfoLocked: Amount must be greater than 0');
        require(_month == 0 || _month == 1 || _month == 3 || _month == 9 || _month == 21, 'depositUfoLocked: Month is not valid');
        require(lpToken.balanceOf(msg.sender) >= _amount, 'depositUfoLocked: User balance must be greater than or equal to amount');

        uint256 weight;
        uint256 currentDay = getCurrentDay();
        uint256 currentTWL = getTWL(currentDay);
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

        lastPlasmaClaimedDay[msg.sender] = currentDay;
        totalWeightedLockedForTheDay[currentDay] = currentTWL.add(_amount.mul(weight).div(100));
        totalLpTokensLocked = totalLpTokensLocked.add(_amount);

        lockedDeposit[msg.sender].push(Locked(_amount, currentDay, endDay, weight, 0, false));
        lpTokensLocked[msg.sender] = lpTokensLocked[msg.sender].add(_amount);

        lpToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit DepositUfoLocked(msg.sender, _month, _amount);
    }

    /**
     * @notice Withdraw each individual amount that was staked after the locking period is over.
     * @param _index Position of locked deposit
     * Requirements:
     *
     * - `withdrawn` deposit must be false.
     * - `currentDay` must be greater than or equal to deposit `endDay`.
     *
     * Emits a {Transfer & WithdrawAmount} event.
     */
    function withdrawAmount(uint256 _index) public {
        uint256 currentDay = getCurrentDay();
        Locked storage deposit = lockedDeposit[msg.sender][_index];
        require(!deposit.withdrawn, 'withdrawAmount: Stake already withdrawn');
        require(currentDay >= deposit.endDay, 'withdrawAmount: Stake cannot be withdrawn during the locking period');

        uint256 lockedAmount = deposit.amount;
        uint256 currentTWL = getTWL(currentDay);

        totalWeightedLockedForTheDay[currentDay] = currentTWL.sub(deposit.amount.mul(deposit.weight).div(100));
        lpTokensLocked[msg.sender] = lpTokensLocked[msg.sender].sub(deposit.amount);
        totalLpTokensLocked = totalLpTokensLocked.sub(deposit.amount);

        deposit.withdrawn = true;
        deposit.withdrawalDay = currentDay;

        lpToken.safeTransfer(msg.sender, lockedAmount);
        emit WithdrawAmount(msg.sender, lockedAmount, currentDay);
    }

    /**
     * @notice Withdraw the reward amount that is accumulated after the locking period.
     * Requirements:
     *
     * - `rewardAmount` must be greater than 0.
     *
     * Emits a {Transfer & WithdrawReward} event.
     */
    function withdrawReward() public {
        uint256 currentDay = getCurrentDay();
        uint256 rewardAmount = getRewardAmount(msg.sender);
        require(rewardAmount > 0, 'No reward to withdraw');

        lastPlasmaClaimedDay[msg.sender] = currentDay;
        plasmaClaimedTillNow[msg.sender] = plasmaClaimedTillNow[msg.sender].add(rewardAmount);

        plasmaContract.mint(msg.sender, rewardAmount);
        emit WithdrawReward(msg.sender, rewardAmount, currentDay);
    }

    /**
     * @notice Gets the total reward amount for a given address.
     * @param _address Address of reward account
     */
    function getRewardAmount(address _address) public view returns (uint256) {
        uint256 rewardAmount;
        uint256 currentDay = getCurrentDay();
        uint256 plasmaClaimed = plasmaClaimedTillNow[_address];

        for (uint256 i = 0; i < lockedDeposit[_address].length; i++) {
            Locked memory deposit = lockedDeposit[_address][i];
            uint256 weightedDeposit = deposit.amount.mul(deposit.weight).div(100);

            if (currentDay < deposit.startDay) { continue; }

            if (deposit.weight == 100) {
                uint256 flexibleReward = getFlexibleReward(deposit, weightedDeposit, currentDay);
                rewardAmount = rewardAmount.add(flexibleReward);
                continue;
            }

            if (currentDay <= deposit.endDay) {
                uint256 withinLockedReward = getWithinLockedReward(deposit, weightedDeposit, currentDay);
                rewardAmount = rewardAmount.add(withinLockedReward);
                continue;
            }

            uint256 outsideLockedReward = getOutsideLockedReward(deposit, weightedDeposit);
            uint256 remainingReward = getRemainingReward(deposit, currentDay);
            rewardAmount = rewardAmount.add(outsideLockedReward).add(remainingReward);
        }

        return rewardAmount.sub(plasmaClaimed);
    }

    /**
     * @notice Gets flexible reward.
     * @param _deposit Locked deposit object
     * @param _currentDay Integer value of current day
     */
    function getFlexibleReward(Locked memory _deposit, uint256 _weightedDeposit, uint256 _currentDay) internal view returns (uint256 rewardAmount) {
        uint256 flexibleReward;
        uint256 flexEnd = _deposit.withdrawn ? _deposit.withdrawalDay : _currentDay;
        uint256 flexStart = _deposit.startDay;
        uint256 twl = getTWL(flexStart);

        while (flexStart < flexEnd) {
            uint256 flexPD = maxRewardPerMonth[flexStart.div(30)].div(30);
            flexibleReward = flexibleReward.add(_weightedDeposit.mul(flexPD).div(twl));
            flexStart = flexStart.add(1);
        }

        return rewardAmount.add(flexibleReward);
    }

    /**
     * @notice Gets within locked period reward (cannot be withdrawn during the locking period).
     * @param _deposit Locked deposit object
     * @param _weightedDeposit Calculated amount of weighted deposit
     * @param _currentDay Integer value of current day
     */
    function getWithinLockedReward(Locked memory _deposit, uint256 _weightedDeposit, uint256 _currentDay) internal view returns (uint256 rewardAmount) {
        uint256 withinLockedReward;
        uint256 wlEnd = _currentDay;
        uint256 wlStart = _deposit.startDay;
        uint256 twl = getTWL(wlStart);

        while (wlStart < wlEnd) {
            uint256 wlPD = maxRewardPerMonth[wlStart.div(30)].div(30);
            withinLockedReward = withinLockedReward.add(_weightedDeposit.mul(wlPD).div(twl));
            wlStart = wlStart.add(1);
        }

        return rewardAmount.add(withinLockedReward);
    }

    /**
     * @notice Gets outside locked period reward.
     * @param _deposit Locked deposit object
     * @param _weightedDeposit Calculated amount of weighted deposit
     */
    function getOutsideLockedReward(Locked memory _deposit, uint256 _weightedDeposit) internal view returns (uint256 rewardAmount) {
        uint256 outsideLockedReward;
        uint256 olEnd = _deposit.endDay;
        uint256 olStart = _deposit.startDay;
        uint256 twl = getTWL(olStart);

        while (olStart < olEnd) {
            uint256 olPD = maxRewardPerMonth[olStart.div(30)].div(30);
            outsideLockedReward = outsideLockedReward.add(_weightedDeposit.mul(olPD).div(twl));
            olStart = olStart.add(1);
        }

        return rewardAmount.add(outsideLockedReward);
    }

    /**
     * @notice Gets remaining reward.
     * @param _deposit Locked deposit object
     * @param _currentDay Integer value of current day
     */
    function getRemainingReward(Locked memory _deposit, uint256 _currentDay) internal view returns (uint256 rewardAmount) {
        uint256 remainingReward;
        uint256 remainingEnd = _deposit.withdrawn ? _deposit.withdrawalDay : _currentDay;
        uint256 remainingStart = _deposit.endDay; // end day is the start of the remaining period
        uint256 twl = getTWL(remainingStart);

        while (remainingStart < remainingEnd) {
            uint256 remainingPD = maxRewardPerMonth[remainingStart.div(30)].div(30);
            remainingReward = remainingReward.add(_deposit.amount.mul(100).mul(remainingPD).div(twl));
            remainingStart = remainingStart.add(1);
        }

        return rewardAmount.add(remainingReward);
    }

    /**
     * @notice Gets the total amount of weighted locked.
     * @param _day Integer value of day
     * return total weighted locked amount
     */
    function getTWL(uint256 _day) internal view returns (uint256 twl) {
        do {
            twl = totalWeightedLockedForTheDay[_day];
            _day = _day.sub(1);
        } while (twl == 0 && _day > 0);

        return twl;
    }

    /**
     * @notice Gets the current day.
     */
    function getCurrentDay() public view returns (uint256) {
        return block.timestamp.sub(startTime).div(1 days);
    }

    /**
     * @notice Gets the current month.
     */
    function getCurrentMonth() public view returns (uint256) {
        return block.timestamp.sub(startTime).div(30 days);
    }

    /**
     * @notice Updates the plasma points for only current/future month.
     * Requirements:
     *
     * - `month` must be greater than or equal to current month.
     * - `points` must be greater than the max reward for the month.
     *
     * Emits a {UpdatePlasmaPoints} event.
     */
    function updatePlasmaPointsPerMonth(uint256 _month, uint256 _points) external onlyAdmin {
        require(_month >= getCurrentMonth(), 'Cannot update plasma points of the past');
        require(_points > maxRewardPerMonth[_month], 'Can not decrease the plasma points during update');

        possibleTotalPlasmaPoints = possibleTotalPlasmaPoints.add(_points).sub(maxRewardPerMonth[_month]);
        maxRewardPerMonth[_month] = _points;

        emit UpdatePlasmaPoints(_month, _points);
    }

    /**
     * @notice Sets address of plasma contract.
     *
     * Emits a {SetPlasmaContract} event.
     */
    function setPlasmaContract(address _plasmaContract) public onlyAdmin {
        IERC20Mintable(_plasmaContract);
        emit SetPlasmaContract(_plasmaContract);
    }
}
