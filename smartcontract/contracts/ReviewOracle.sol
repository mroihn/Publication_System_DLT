// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IPublicationRegistryCallback {
    function fulfillPlagiarism(uint256 msId, uint256 score) external;
    function fulfillRandomReviewers(
        uint256 msId,
        address[] calldata reviewers
    ) external;
}

contract ReviewOracle is AccessControl {
    
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    address public publicationRegistry;
    uint256 public nextPlagiarismRequestId;
    uint256 public nextReviewerRequestId;
    mapping(uint256 => uint256) public plagiarismRequestToMs;
    mapping(uint256 => bool) public plagiarismRequestFulfilled;
    mapping(uint256 => uint256) public reviewerRequestToMs;
    mapping(uint256 => bool) public reviewerRequestFulfilled;

    error RegistryNotSet();
    error OracleZeroAddress();
    error RequestAlreadyFulfilled(uint256 requestId);
    error RequestNotFound(uint256 requestId);
    error InvalidScore(uint256 score);
    error InvalidReviewerCount(uint256 count);

    event PlagiarismCheckRequested(
        uint256 indexed requestId,
        uint256 indexed msId,
        string cid
    );

    event PlagiarismCheckFulfilled(
        uint256 indexed requestId,
        uint256 indexed msId,
        uint256 score
    );

    event ReviewerSelectionRequested(
        uint256 indexed requestId,
        uint256 indexed msId
    );

    event ReviewerSelectionFulfilled(
        uint256 indexed requestId,
        uint256 indexed msId,
        address[] reviewers
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    function setPublicationRegistry(
        address registry
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (registry == address(0)) revert OracleZeroAddress();

        if (publicationRegistry != address(0)) {
            _revokeRole(REGISTRY_ROLE, publicationRegistry);
        }

        publicationRegistry = registry;
        _grantRole(REGISTRY_ROLE, registry);
    }

    function requestPlagiarismCheck(
        uint256 msId,
        string calldata cid
    ) external onlyRole(REGISTRY_ROLE) {
        uint256 requestId = nextPlagiarismRequestId++;
        plagiarismRequestToMs[requestId] = msId;

        emit PlagiarismCheckRequested(requestId, msId, cid);
    }

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

    function requestRandomReviewers(
        uint256 msId
    ) external onlyRole(REGISTRY_ROLE) {
        uint256 requestId = nextReviewerRequestId++;
        reviewerRequestToMs[requestId] = msId;

        emit ReviewerSelectionRequested(requestId, msId);
    }

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

    function getPublicationRegistry() external view returns (address) {
        return publicationRegistry;
    }
}
