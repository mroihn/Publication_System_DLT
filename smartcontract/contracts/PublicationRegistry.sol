// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ──────────────────────────── External Interfaces ─────────────────────────────

interface IDOIToken {
    function mint(
        address to,
        string memory tokenURI_
    ) external returns (uint256 tokenId);
}

interface IReviewOracle {
    function requestPlagiarismCheck(
        uint256 msId,
        string calldata cid
    ) external;
    function requestRandomReviewers(uint256 msId) external;
}

/**
 * @title PublicationRegistry
 * @notice Core state-machine and controller for the decentralized publication
 *         system. Manages the full manuscript lifecycle from submission through
 *         peer review to publication.
 *
 * @dev Deployed behind a UUPS proxy for upgradeability.
 *
 *      State machine:
 *        SUBMITTED → CHECKING → UNDER_REVIEW → { ACCEPTED | REJECTED | REVISION_REQUESTED }
 *        ACCEPTED  → PUBLISHED  (via payPublicationFee)
 *        REVISION_REQUESTED → CHECKING  (via reviseManuscript)
 *
 *      Roles:
 *        ADMIN_ROLE      — contract governance, upgrades, configuration
 *        RESEARCHER_ROLE — manuscript submission and revision
 *        REVIEWER_ROLE   — submitting reviews
 *        ORACLE_ROLE     — reserved for ReviewOracle callbacks
 */
contract PublicationRegistry is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    // ──────────────────────────────── Enums ────────────────────────────────────────

    /// @notice Manuscript lifecycle states.
    enum Status {
        SUBMITTED,           // 0 — initial state
        CHECKING,            // 1 — plagiarism check in progress
        UNDER_REVIEW,        // 2 — assigned to reviewers
        REVISION_REQUESTED,  // 3 — majority said REVISE
        ACCEPTED,            // 4 — majority said ACCEPT
        REJECTED,            // 5 — rejected (plagiarism or review)
        PUBLISHED            // 6 — fee paid, DOI minted
    }

    /// @notice Reviewer verdict options.
    enum Verdict {
        ACCEPT,
        REJECT,
        REVISE
    }

    // ──────────────────────────────── Structs ─────────────────────────────────────

    /// @notice Core manuscript record.
    struct Manuscript {
        uint256 id;
        address author;
        string cid;          // IPFS CID of the latest version
        string metadata;     // JSON metadata string
        Status status;
        uint256 version;
        uint256 plagiarismScore;
        address[] reviewers;
        uint256 acceptCount;
        uint256 rejectCount;
        uint256 reviseCount;
        uint256 reviewCount; // total reviews submitted this round
    }

    // ──────────────────────────────── Roles ────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant RESEARCHER_ROLE = keccak256("RESEARCHER_ROLE");
    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // ──────────────────────────────── Config ───────────────────────────────────────

    /// @notice Maximum plagiarism score allowed (0-100). Scores above are rejected.
    uint256 public constant PLAGIARISM_THRESHOLD = 30;

    /// @notice Publication fee in JRT (wei).
    uint256 public constant PUBLICATION_FEE = 100 * 1e18;

    /// @notice Incentive paid to each reviewer in JRT (wei).
    uint256 public constant REVIEWER_INCENTIVE = 10 * 1e18;

    // ──────────────────────────────── State ────────────────────────────────────────

    /// @notice External contract references.
    IDOIToken public doiToken;
    IERC20 public journalToken;
    IReviewOracle public reviewOracle;

    /// @notice Auto-incrementing manuscript ID counter.
    uint256 public nextManuscriptId;

    /// @notice Manuscript ID → Manuscript data.
    mapping(uint256 => Manuscript) private _manuscripts;

    /// @notice Manuscript ID → reviewer address → has reviewed flag.
    mapping(uint256 => mapping(address => bool)) public hasReviewed;

    /// @notice Manuscript ID → reviewer address → review content hash.
    mapping(uint256 => mapping(address => bytes32)) public reviewHashes;

    // ──────────────────────────────── Custom Errors ────────────────────────────────

    error InvalidState(uint256 msId, Status expected, Status actual);
    error NotAuthor(uint256 msId, address caller);
    error NotAssignedReviewer(uint256 msId, address caller);
    error AlreadyReviewed(uint256 msId, address reviewer);
    error InsufficientAllowance(uint256 required, uint256 actual);
    error ManuscriptNotFound(uint256 msId);
    error PlagiarismThresholdExceeded(uint256 msId, uint256 score);
    error TransferFailed();
    error ZeroAddress();

    // ──────────────────────────────── Events ───────────────────────────────────────

    /// @notice Emitted when a new manuscript is submitted.
    event ManuscriptSubmitted(uint256 indexed msId, string cid);

    /// @notice Emitted when a manuscript status decision is made.
    event DecisionMade(uint256 indexed msId, Status decision);

    /// @notice Emitted when a reviewer receives their incentive payout.
    event IncentivePaid(address indexed reviewer, uint256 amount);

    /// @notice Emitted when a manuscript is revised and resubmitted.
    event ManuscriptRevised(uint256 indexed msId, string newCid, uint256 version);

    /// @notice Emitted when a review is submitted.
    event ReviewSubmitted(uint256 indexed msId, address indexed reviewer, Verdict verdict);

    /// @notice Emitted when reviewers are assigned to a manuscript.
    event ReviewersAssigned(uint256 indexed msId, address[] reviewers);

    /// @notice Emitted when the DOI NFT is minted upon publication.
    event DOIMinted(uint256 indexed msId, uint256 indexed doiTokenId);

    // ──────────────────────────────── Initializer ─────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice UUPS initializer — called once through the proxy.
     * @param _doiToken      Address of the DOIToken contract.
     * @param _journalToken  Address of the JournalToken contract.
     * @param _reviewOracle  Address of the ReviewOracle contract.
     * @param admin          Admin address to receive ADMIN_ROLE.
     */
    function initialize(
        address _doiToken,
        address _journalToken,
        address _reviewOracle,
        address admin
    ) public initializer {
        if (_doiToken == address(0) || _journalToken == address(0) || _reviewOracle == address(0) || admin == address(0))
            revert ZeroAddress();

        __AccessControl_init();

        doiToken = IDOIToken(_doiToken);
        journalToken = IERC20(_journalToken);
        reviewOracle = IReviewOracle(_reviewOracle);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, _reviewOracle);
    }

    // ──────────────────────────── Core Functions ──────────────────────────────────

    /**
     * @notice Submit a new manuscript. Automatically initiates a plagiarism check.
     * @param cid       IPFS CID of the manuscript content.
     * @param metadata  JSON-encoded metadata (title, abstract, authors, etc.).
     * @return msId     The assigned manuscript ID.
     */
    function submitManuscript(
        string calldata cid,
        string calldata metadata
    ) external onlyRole(RESEARCHER_ROLE) returns (uint256 msId) {
        msId = nextManuscriptId++;

        Manuscript storage ms = _manuscripts[msId];
        ms.id = msId;
        ms.author = msg.sender;
        ms.cid = cid;
        ms.metadata = metadata;
        ms.status = Status.CHECKING; // Skip SUBMITTED, go straight to CHECKING
        ms.version = 1;

        emit ManuscriptSubmitted(msId, cid);

        // Automatically initiate plagiarism check
        reviewOracle.requestPlagiarismCheck(msId, cid);
    }

    /**
     * @notice Callback from ReviewOracle with plagiarism score.
     * @dev Only callable by the ReviewOracle (ORACLE_ROLE).
     *      If score ≤ threshold → request random reviewers (UNDER_REVIEW).
     *      If score > threshold → REJECTED.
     * @param msId  The manuscript ID.
     * @param score The plagiarism similarity score (0-100).
     */
    function fulfillPlagiarism(
        uint256 msId,
        uint256 score
    ) external onlyRole(ORACLE_ROLE) {
        Manuscript storage ms = _manuscripts[msId];
        _requireState(msId, Status.CHECKING);

        ms.plagiarismScore = score;

        if (score > PLAGIARISM_THRESHOLD) {
            ms.status = Status.REJECTED;
            emit DecisionMade(msId, Status.REJECTED);
            return;
        }

        // Plagiarism check passed — request reviewer assignment via VRF
        ms.status = Status.UNDER_REVIEW;
        emit DecisionMade(msId, Status.UNDER_REVIEW);

        reviewOracle.requestRandomReviewers(msId);
    }

    /**
     * @notice Callback from ReviewOracle with randomly selected reviewers.
     * @dev Only callable by the ReviewOracle (ORACLE_ROLE).
     * @param msId      The manuscript ID.
     * @param reviewers Array of selected reviewer addresses.
     */
    function fulfillRandomReviewers(
        uint256 msId,
        address[] calldata reviewers
    ) external onlyRole(ORACLE_ROLE) {
        Manuscript storage ms = _manuscripts[msId];
        _requireState(msId, Status.UNDER_REVIEW);

        ms.reviewers = reviewers;

        emit ReviewersAssigned(msId, reviewers);
    }

    /**
     * @notice Submit a review for a manuscript.
     * @dev Only callable by a reviewer assigned to this manuscript and holding
     *      REVIEWER_ROLE. Decision logic triggers once all reviews are collected.
     * @param msId    The manuscript ID.
     * @param hash    Keccak-256 hash of the review content (stored off-chain).
     * @param verdict The reviewer's verdict: ACCEPT, REJECT, or REVISE.
     */
    function submitReview(
        uint256 msId,
        bytes32 hash,
        Verdict verdict
    ) external onlyRole(REVIEWER_ROLE) {
        Manuscript storage ms = _manuscripts[msId];
        _requireState(msId, Status.UNDER_REVIEW);

        // Verify caller is an assigned reviewer
        if (!_isAssignedReviewer(msId, msg.sender))
            revert NotAssignedReviewer(msId, msg.sender);

        // Prevent double-review
        if (hasReviewed[msId][msg.sender])
            revert AlreadyReviewed(msId, msg.sender);

        hasReviewed[msId][msg.sender] = true;
        reviewHashes[msId][msg.sender] = hash;
        ms.reviewCount++;

        if (verdict == Verdict.ACCEPT) ms.acceptCount++;
        else if (verdict == Verdict.REJECT) ms.rejectCount++;
        else ms.reviseCount++;

        emit ReviewSubmitted(msId, msg.sender, verdict);

        // Trigger decision logic once all assigned reviewers have submitted
        if (ms.reviewCount == ms.reviewers.length) {
            _evaluateDecision(msId);
        }
    }

    /**
     * @notice Revise a manuscript after REVISION_REQUESTED.
     * @dev Only the original author can revise. Increments the version counter
     *      and re-triggers the plagiarism check.
     * @param msId   The manuscript ID.
     * @param newCid The IPFS CID of the revised content.
     */
    function reviseManuscript(
        uint256 msId,
        string calldata newCid
    ) external onlyRole(RESEARCHER_ROLE) {
        Manuscript storage ms = _manuscripts[msId];
        _requireState(msId, Status.REVISION_REQUESTED);
        _requireAuthor(msId);

        ms.cid = newCid;
        ms.version++;
        ms.status = Status.CHECKING;

        // Reset review counters for the new round
        _resetReviewState(msId);

        emit ManuscriptRevised(msId, newCid, ms.version);

        // Re-trigger plagiarism check
        reviewOracle.requestPlagiarismCheck(msId, newCid);
    }

    /**
     * @notice Pay the publication fee, mint the DOI NFT, and distribute
     *         reviewer incentives.
     * @dev Only the original author can call this, and the manuscript must
     *      be in ACCEPTED state. The author must have approved sufficient
     *      JRT allowance to this contract beforehand.
     * @param msId The manuscript ID.
     */
    function payPublicationFee(
        uint256 msId
    ) external onlyRole(RESEARCHER_ROLE) {
        Manuscript storage ms = _manuscripts[msId];
        _requireState(msId, Status.ACCEPTED);
        _requireAuthor(msId);

        // Check allowance
        uint256 totalCost = PUBLICATION_FEE;
        uint256 allowed = journalToken.allowance(msg.sender, address(this));
        if (allowed < totalCost)
            revert InsufficientAllowance(totalCost, allowed);

        // Transfer publication fee from author to this contract
        bool success = journalToken.transferFrom(
            msg.sender,
            address(this),
            totalCost
        );
        if (!success) revert TransferFailed();

        // Distribute reviewer incentives
        address[] memory reviewers = ms.reviewers;
        for (uint256 i = 0; i < reviewers.length; i++) {
            bool paid = journalToken.transfer(reviewers[i], REVIEWER_INCENTIVE);
            if (!paid) revert TransferFailed();
            emit IncentivePaid(reviewers[i], REVIEWER_INCENTIVE);
        }

        // Mint DOI NFT to the author
        string memory doiURI = string(
            abi.encodePacked("ipfs://", ms.cid)
        );
        uint256 doiTokenId = doiToken.mint(msg.sender, doiURI);

        ms.status = Status.PUBLISHED;

        emit DOIMinted(msId, doiTokenId);
        emit DecisionMade(msId, Status.PUBLISHED);
    }

    // ──────────────────────────── Admin Functions ──────────────────────────────────

    /**
     * @notice Grant RESEARCHER_ROLE to an address.
     * @param researcher The address to grant the role to.
     */
    function addResearcher(
        address researcher
    ) external onlyRole(ADMIN_ROLE) {
        grantRole(RESEARCHER_ROLE, researcher);
    }

    /**
     * @notice Grant REVIEWER_ROLE to an address.
     * @param reviewer The address to grant the role to.
     */
    function addReviewer(
        address reviewer
    ) external onlyRole(ADMIN_ROLE) {
        grantRole(REVIEWER_ROLE, reviewer);
    }

    // ──────────────────────────────── View Functions ───────────────────────────────

    /**
     * @notice Get the full manuscript record.
     * @param msId The manuscript ID.
     * @return The Manuscript struct (excluding mappings).
     */
    function getManuscript(
        uint256 msId
    ) external view returns (Manuscript memory) {
        if (msId >= nextManuscriptId) revert ManuscriptNotFound(msId);
        return _manuscripts[msId];
    }

    /**
     * @notice Get the current status of a manuscript.
     * @param msId The manuscript ID.
     * @return The current Status enum value.
     */
    function getStatus(uint256 msId) external view returns (Status) {
        if (msId >= nextManuscriptId) revert ManuscriptNotFound(msId);
        return _manuscripts[msId].status;
    }

    /**
     * @notice Get the list of reviewers assigned to a manuscript.
     * @param msId The manuscript ID.
     * @return Array of reviewer addresses.
     */
    function getReviewers(
        uint256 msId
    ) external view returns (address[] memory) {
        if (msId >= nextManuscriptId) revert ManuscriptNotFound(msId);
        return _manuscripts[msId].reviewers;
    }

    // ──────────────────────────── Internal Helpers ─────────────────────────────────

    /**
     * @dev Evaluate the majority verdict and transition the manuscript state.
     *      Decision rules (for 3 reviewers):
     *        2+ ACCEPT → ACCEPTED
     *        2+ REJECT → REJECTED
     *        2+ REVISE → REVISION_REQUESTED
     *        No clear majority → REVISION_REQUESTED (conservative)
     */
    function _evaluateDecision(uint256 msId) internal {
        Manuscript storage ms = _manuscripts[msId];
        uint256 majority = (ms.reviewers.length / 2) + 1; // e.g. 2 for 3 reviewers

        if (ms.acceptCount >= majority) {
            ms.status = Status.ACCEPTED;
            emit DecisionMade(msId, Status.ACCEPTED);
        } else if (ms.rejectCount >= majority) {
            ms.status = Status.REJECTED;
            emit DecisionMade(msId, Status.REJECTED);
        } else if (ms.reviseCount >= majority) {
            ms.status = Status.REVISION_REQUESTED;
            emit DecisionMade(msId, Status.REVISION_REQUESTED);
        } else {
            // No clear majority — conservative default
            ms.status = Status.REVISION_REQUESTED;
            emit DecisionMade(msId, Status.REVISION_REQUESTED);
        }
    }

    /**
     * @dev Reset review-related state for a new review round (after revision).
     */
    function _resetReviewState(uint256 msId) internal {
        Manuscript storage ms = _manuscripts[msId];

        // Clear hasReviewed flags for previous reviewers
        for (uint256 i = 0; i < ms.reviewers.length; i++) {
            delete hasReviewed[msId][ms.reviewers[i]];
            delete reviewHashes[msId][ms.reviewers[i]];
        }

        // Reset counters
        ms.acceptCount = 0;
        ms.rejectCount = 0;
        ms.reviseCount = 0;
        ms.reviewCount = 0;
        delete ms.reviewers;
    }

    /**
     * @dev Require that the manuscript is in the expected state.
     */
    function _requireState(uint256 msId, Status expected) internal view {
        Status actual = _manuscripts[msId].status;
        if (actual != expected) revert InvalidState(msId, expected, actual);
    }

    /**
     * @dev Require that msg.sender is the manuscript author.
     */
    function _requireAuthor(uint256 msId) internal view {
        if (_manuscripts[msId].author != msg.sender)
            revert NotAuthor(msId, msg.sender);
    }

    /**
     * @dev Check whether an address is in the manuscript's assigned reviewer list.
     */
    function _isAssignedReviewer(
        uint256 msId,
        address reviewer
    ) internal view returns (bool) {
        address[] memory reviewers = _manuscripts[msId].reviewers;
        for (uint256 i = 0; i < reviewers.length; i++) {
            if (reviewers[i] == reviewer) return true;
        }
        return false;
    }

    // ──────────────────────────── UUPS Authorization ──────────────────────────────

    /**
     * @dev Authorize contract upgrades — restricted to ADMIN_ROLE.
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(ADMIN_ROLE) {}
}
