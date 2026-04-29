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
 *  • Plagiarism checking — an off-chain ORACLE_ROLE operator submits scores.
 *  • Reviewer selection  — uses on-chain pseudo-randomness (block-based)
 *                          to select reviewers from a registered pool.
 *
 * @dev Only the PublicationRegistry contract (set via `setPublicationRegistry`)
 *      is allowed to initiate oracle requests. An authorized ORACLE_ROLE
 *      address (the off-chain oracle operator) fulfills plagiarism checks.
 *
 *      Reviewer selection uses keccak256(abi.encodePacked(block.prevrandao,
 *      block.timestamp, msId)) as the randomness seed. This is suitable for
 *      a testnet / academic publication system where the economic incentive
 *      to manipulate block randomness is negligible.
 */
contract ReviewOracle is AccessControl {
    // ──────────────────────────────── Constants ────────────────────────────────────

    /// @notice Role for the PublicationRegistry contract.
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    /// @notice Role for the off-chain oracle operator that submits plagiarism scores.
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice Number of reviewers to select per manuscript.
    uint256 public constant NUM_REVIEWERS = 3;

    // ──────────────────────────────── State ────────────────────────────────────────

    /// @notice Address of the PublicationRegistry contract.
    address public publicationRegistry;

    /// @notice Pool of registered reviewer addresses.
    address[] public reviewerPool;

    /// @notice Auto-incrementing request ID counter for plagiarism checks.
    uint256 public nextRequestId;

    /// @notice Request ID → manuscript ID (for plagiarism check tracking).
    mapping(uint256 => uint256) public requestToMs;

    /// @notice Request ID → whether the request has been fulfilled.
    mapping(uint256 => bool) public requestFulfilled;

    // ──────────────────────────────── Custom Errors ────────────────────────────────

    error RegistryNotSet();
    error ReviewerPoolTooSmall(uint256 required, uint256 actual);
    error ReviewerAlreadyRegistered(address reviewer);
    error ReviewerNotFound(address reviewer);
    error OracleZeroAddress();
    error RequestAlreadyFulfilled(uint256 requestId);
    error RequestNotFound(uint256 requestId);
    error InvalidScore(uint256 score);

    // ──────────────────────────────── Events ───────────────────────────────────────

    /// @notice Emitted when a plagiarism check is requested (consumed by off-chain oracle).
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

    /// @notice Emitted when reviewers are randomly selected for a manuscript.
    event RandomReviewersSelected(
        uint256 indexed msId,
        address[] reviewers
    );

    event ReviewerAdded(address indexed reviewer);
    event ReviewerRemoved(address indexed reviewer);

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

    /**
     * @notice Add a reviewer address to the eligible reviewer pool.
     * @param reviewer The address to add.
     */
    function addReviewer(
        address reviewer
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (reviewer == address(0)) revert OracleZeroAddress();

        // Check for duplicates
        for (uint256 i = 0; i < reviewerPool.length; i++) {
            if (reviewerPool[i] == reviewer)
                revert ReviewerAlreadyRegistered(reviewer);
        }

        reviewerPool.push(reviewer);
        emit ReviewerAdded(reviewer);
    }

    /**
     * @notice Remove a reviewer address from the pool.
     * @param reviewer The address to remove.
     */
    function removeReviewer(
        address reviewer
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 length = reviewerPool.length;
        for (uint256 i = 0; i < length; i++) {
            if (reviewerPool[i] == reviewer) {
                // Swap with last element and pop
                reviewerPool[i] = reviewerPool[length - 1];
                reviewerPool.pop();
                emit ReviewerRemoved(reviewer);
                return;
            }
        }
        revert ReviewerNotFound(reviewer);
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
        uint256 requestId = nextRequestId++;
        requestToMs[requestId] = msId;

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
        if (requestId >= nextRequestId) revert RequestNotFound(requestId);
        if (requestFulfilled[requestId])
            revert RequestAlreadyFulfilled(requestId);
        if (score > 100) revert InvalidScore(score);

        requestFulfilled[requestId] = true;
        uint256 msId = requestToMs[requestId];

        emit PlagiarismCheckFulfilled(requestId, msId, score);

        IPublicationRegistryCallback(publicationRegistry).fulfillPlagiarism(
            msId,
            score
        );
    }

    // ──────────────────── Random Reviewer Selection ───────────────────────────────

    /**
     * @notice Select random reviewers for a manuscript using on-chain randomness.
     * @dev Called by PublicationRegistry (REGISTRY_ROLE). Uses block.prevrandao
     *      and block.timestamp as entropy sources with Fisher-Yates selection.
     *      This is sufficient for academic publication where miner manipulation
     *      incentive is negligible.
     * @param msId The manuscript ID.
     */
    function requestRandomReviewers(
        uint256 msId
    ) external onlyRole(REGISTRY_ROLE) {
        if (reviewerPool.length < NUM_REVIEWERS)
            revert ReviewerPoolTooSmall(NUM_REVIEWERS, reviewerPool.length);

        address[] memory selected = new address[](NUM_REVIEWERS);

        // Generate seed from on-chain entropy
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    msId,
                    reviewerPool.length
                )
            )
        );

        // Fisher-Yates-style selection
        uint256 poolSize = reviewerPool.length;
        uint256[] memory indices = new uint256[](poolSize);
        for (uint256 i = 0; i < poolSize; i++) {
            indices[i] = i;
        }

        uint256 remaining = poolSize;
        for (uint256 i = 0; i < NUM_REVIEWERS; i++) {
            uint256 rand = uint256(keccak256(abi.encode(seed, i)));
            uint256 idx = rand % remaining;

            selected[i] = reviewerPool[indices[idx]];

            // Swap selected index with the last valid index
            indices[idx] = indices[remaining - 1];
            remaining--;
        }

        emit RandomReviewersSelected(msId, selected);

        IPublicationRegistryCallback(publicationRegistry)
            .fulfillRandomReviewers(msId, selected);
    }

    // ──────────────────────────────── View ─────────────────────────────────────────

    /// @notice Returns the current number of reviewers in the pool.
    function getReviewerPoolSize() external view returns (uint256) {
        return reviewerPool.length;
    }

    /// @notice Returns the full reviewer pool.
    function getReviewerPool() external view returns (address[] memory) {
        return reviewerPool;
    }
}
