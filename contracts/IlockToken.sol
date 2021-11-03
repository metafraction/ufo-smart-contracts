pragma solidity >=0.6.0 <0.8.0;

interface IlockTokens {
    function depositId() external view returns (uint256 id);

    function withdrawTokens(uint256 id) external;

    function lockedToken(uint256 id)
        external
        view
        returns (
            address tokenAddress,
            address withdrawalAddress,
            uint256 tokenAmount,
            uint256 unlockTime,
            bool withdrawn
        );

    function lockTokens(
        address _tokenAddress,
        address _withdrawalAddress,
        uint256 _amount,
        uint256 _unlockTime
    ) external returns (uint256 _id);
}
