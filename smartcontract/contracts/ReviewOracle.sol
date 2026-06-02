// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title IPublicationRegistryCallback
 * @notice Callback interface implemented by PublicationRegistry so the oracle
 *         can push plagiarism scores and reviewer assignments back.
 */
interface IPublicationRegistryCallback {
    function fulfillPlagiarism(uint256 msId, uint256 score) external;
    function fulfillRandomReviewers(
        uint256 msId,
        address[] calldata reviewers
    ) external;
}

/**
 * @title ReviewOracle
 * @notice Custom oracle contract for the decentralized publication system.
 *
 *  • Plagiarism checking  — an off-chain ORACLE_ROLE operator submits scores.
 *  • Reviewer selection   — emits an event consumed by the off-chain oracle
 *                           operator, which maintains the reviewer registry
 *                           (with competency tiers) and calls back with the
 *                           selected addresses. This avoids any on-chain
 *                           randomness manipulation risk and keeps reviewer
 *                           metadata (competency tiers) off-chain.
 *
 * @dev Only the PublicationRegistry contract (set via `setPublicationRegistry`)
 *      is allowed to initiate oracle requests. An authorized ORACLE_ROLE
 *      address (the off-chain oracle operator) fulfills both plagiarism checks
 *      and reviewer selections.
 */
contract ReviewOracle is AccessControl {
    // ──────────────────────────────── Constants ────────────────────────────────────

    /// @notice Role for the PublicationRegistry contract.
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    /// @notice Role for the off-chain oracle operator (fulfills requests).
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // ──────────────────────────────── State ────────────────────────────────────────

    /// @notice Address of the PublicationRegistry contract.
    address public publicationRegistry;

    /// @notice Auto-incrementing request ID counter for plagiarism checks.
    uint256 public nextPlagiarismRequestId;

    /// @notice Auto-incrementing request ID counter for reviewer selections.
    uint256 public nextReviewerRequestId;

    /// @notice Plagiarism request ID → manuscript ID.
    mapping(uint256 => uint256) public plagiarismRequestToMs;

    /// @notice Plagiarism request ID → whether the request has been fulfilled.
    mapping(uint256 => bool) public plagiarismRequestFulfilled;

    /// @notice Reviewer selection request ID → manuscript ID.
    mapping(uint256 => uint256) public reviewerRequestToMs;

    /// @notice Reviewer selection request ID → whether the request has been fulfilled.
    mapping(uint256 => bool) public reviewerRequestFulfilled;

    // ──────────────────────────────── Custom Errors ────────────────────────────────

    error RegistryNotSet();
    error OracleZeroAddress();
    error RequestAlreadyFulfilled(uint256 requestId);
    error RequestNotFound(uint256 requestId);
    error InvalidScore(uint256 score);
    error InvalidReviewerCount(uint256 count);

    // ──────────────────────────────── Events ───────────────────────────────────────

    /**
     * @notice Emitted when a plagiarism check is requested.
     *         Consumed by the off-chain oracle operator.
     */
    event PlagiarismCheckRequested(
        uint256 indexed requestId,
        uint256 indexed msId,
        string cid
    );

    /// @notice Emitted when the oracle fulfills a plagiarism check.
    event PlagiarismCheckFulfilled(
        uint256 indexed requestId,
        uint256 indexed msId,
        uint256 score
    );

    /**
     * @notice Emitted when reviewer selection is requested.
     *         The off-chain oracle operator listens for this event,
     *         selects reviewers from its competency-tiered registry,
     *         then calls `fulfillReviewerSelection`.
     */
    event ReviewerSelectionRequested(
        uint256 indexed requestId,
        uint256 indexed msId
    );

    /// @notice Emitted when the oracle fulfills a reviewer selection.
    event ReviewerSelectionFulfilled(
        uint256 indexed requestId,
        uint256 indexed msId,
        address[] reviewers
    );

    // ──────────────────────────────── Constructor ──────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    // ──────────────────────────── Admin Functions ──────────────────────────────────

    /**
     * @notice Set the PublicationRegistry address and grant it REGISTRY_ROLE.
     * @param registry The PublicationRegistry proxy address.
     */
    function setPublicationRegistry(
        address registry
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (registry == address(0)) revert OracleZeroAddress();

        // Revoke from old registry if previously set
        if (publicationRegistry != address(0)) {
            _revokeRole(REGISTRY_ROLE, publicationRegistry);
        }

        publicationRegistry = registry;
        _grantRole(REGISTRY_ROLE, registry);
    }

    // ──────────────────────── Plagiarism Check ─────────────────────────────────────

    /**
     * @notice Request a plagiarism check for a manuscript.
     * @dev Called by PublicationRegistry (REGISTRY_ROLE). Emits an event
     *      that the off-chain oracle operator listens for. The operator
     *      then calls `fulfillPlagiarismCheck()` with the result.
     * @param msId The manuscript ID.
     * @param cid  The IPFS CID of the manuscript content.
     */
    function requestPlagiarismCheck(
        uint256 msId,
        string calldata cid
    ) external onlyRole(REGISTRY_ROLE) {
        uint256 requestId = nextPlagiarismRequestId++;
        plagiarismRequestToMs[requestId] = msId;

        emit PlagiarismCheckRequested(requestId, msId, cid);
    }

    /**
     * @notice Fulfill a plagiarism check request with the similarity score.
     * @dev Called by the off-chain oracle operator (ORACLE_ROLE).
     * @param requestId The request ID from the PlagiarismCheckRequested event.
     * @param score     The plagiarism similarity score (0-100).
     */
    function fulfillPlagiarismCheck(
        uint256 requestId,
        uint256 score
    ) external onlyRole(ORACLE_ROLE) {
        if (requestId >= nextPlagiarismRequestId) revert RequestNotFound(requestId);
        if (plagiarismRequestFulfilled[requestId])
            revert RequestAlreadyFulfilled(requestId);
        if (score > 100) revert InvalidScore(score);

        plagiarismRequestFulfilled[requestId] = true;
        uint256 msId = plagiarismRequestToMs[requestId];

        emit PlagiarismCheckFulfilled(requestId, msId, score);

        IPublicationRegistryCallback(publicationRegistry).fulfillPlagiarism(
            msId,
            score
        );
    }

    // ──────────────────── Reviewer Selection ──────────────────────────────────────

    /**
     * @notice Request reviewer selection for a manuscript.
     * @dev Called by PublicationRegistry (REGISTRY_ROLE). Emits an event
     *      consumed by the off-chain oracle operator, which maintains the
     *      competency-tiered reviewer registry and selects an odd number
     *      of qualified reviewers. The operator then calls
     *      `fulfillReviewerSelection()` with the chosen addresses.
     * @param msId The manuscript ID.
     */
    function requestRandomReviewers(
        uint256 msId
    ) external onlyRole(REGISTRY_ROLE) {
        uint256 requestId = nextReviewerRequestId++;
        reviewerRequestToMs[requestId] = msId;

        emit ReviewerSelectionRequested(requestId, msId);
    }

    /**
     * @notice Fulfill a reviewer selection request with chosen reviewer addresses.
     * @dev Called by the off-chain oracle operator (ORACLE_ROLE).
     *      The reviewer count MUST be an odd number ≥ 3 to guarantee a majority
     *      verdict is always reachable.
     * @param requestId The request ID from the ReviewerSelectionRequested event.
     * @param reviewers Array of selected reviewer addresses (must be odd length ≥ 3).
     */
    function fulfillReviewerSelection(
        uint256 requestId,
        address[] calldata reviewers
    ) external onlyRole(ORACLE_ROLE) {
        if (requestId >= nextReviewerRequestId) revert RequestNotFound(requestId);
        if (reviewerRequestFulfilled[requestId])
            revert RequestAlreadyFulfilled(requestId);
        // Enforce odd count ≥ 3 so majority verdict is always achievable
        if (reviewers.length < 3 || reviewers.length % 2 == 0)
            revert InvalidReviewerCount(reviewers.length);

        reviewerRequestFulfilled[requestId] = true;
        uint256 msId = reviewerRequestToMs[requestId];

        emit ReviewerSelectionFulfilled(requestId, msId, reviewers);

        IPublicationRegistryCallback(publicationRegistry)
            .fulfillRandomReviewers(msId, reviewers);
    }

    // ──────────────────────────────── View ─────────────────────────────────────────

    /// @notice Returns the address of the configured publication registry.
    function getPublicationRegistry() external view returns (address) {
        return publicationRegistry;
    }
}
