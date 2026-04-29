// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title JournalToken
 * @notice ERC-20 utility token used for publication fees and reviewer incentive payouts.
 * @dev The admin (deployer) is granted MINTER_ROLE to mint the initial supply and
 *      additional tokens as needed. The PublicationRegistry contract does NOT need
 *      MINTER_ROLE — it transfers tokens that the author has already approved via
 *      ERC-20 allowance.
 */
contract JournalToken is ERC20, AccessControl {
    /// @notice Role identifier for addresses allowed to mint new tokens.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ──────────────────────────────── Custom Errors ────────────────────────────────

    /// @notice Thrown when a mint is attempted with a zero amount.
    error MintAmountZero();

    /// @notice Thrown when minting to the zero address.
    error MintToZeroAddress();

    // ──────────────────────────────── Constructor ──────────────────────────────────

    /**
     * @param initialSupply The number of whole tokens to mint to the deployer
     *                      (automatically scaled by 10^decimals).
     */
    constructor(uint256 initialSupply) ERC20("JournalToken", "JRT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);

        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    // ──────────────────────────────── External ─────────────────────────────────────

    /**
     * @notice Mint new JRT tokens.
     * @param to      Recipient of the minted tokens.
     * @param amount  Amount of tokens (in wei) to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert MintToZeroAddress();
        if (amount == 0) revert MintAmountZero();
        _mint(to, amount);
    }
}
