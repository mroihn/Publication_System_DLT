// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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

library DOILib {
    string internal constant DOI_PREFIX = "10.55121";
    function buildDOI(
        uint256 msId,
        uint256 version
    ) internal view returns (string memory doi) {
        uint256 year = _blockYear();
        doi = string(
            abi.encodePacked(
                DOI_PREFIX,
                "/",
                _uint2str(year),
                ".",
                _uint2str(block.chainid),
                ".",
                _uint2str(msId),
                ".",
                _uint2str(version)
            )
        );
    }

    function _blockYear() private view returns (uint256) {
        return 1970 + block.timestamp / 31_556_952;
    }

    function _uint2str(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

contract PublicationRegistry is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    EIP712Upgradeable
{
    using DOILib for uint256;

    enum Status {
        SUBMITTED,           // 0 — initial state
        CHECKING,            // 1 — plagiarism check in progress
        UNDER_REVIEW,        // 2 — assigned to reviewers
        REVISION_REQUESTED,  // 3 — majority said REVISE
        ACCEPTED,            // 4 — majority said ACCEPT
        REJECTED,            // 5 — rejected (plagiarism, editor desk-reject, or review)
        PUBLISHED,           // 6 — fee paid, DOI minted
        PENDING_EDITOR       // 7 — plagiarism passed, awaiting editor screening (workflow-wise
                             //     it sits between CHECKING and UNDER_REVIEW; appended here so the
                             //     UUPS upgrade keeps stored status values 0-6 valid)
    }

    enum Verdict {
        ACCEPT,
        REJECT,
        REVISE
    }

    struct Manuscript {
        uint256 id;
        address author;
        string cid;
        string metadata;
        Status status;
        uint256 version;
        uint256 plagiarismScore;
        address[] reviewers;
        uint256 acceptCount;
        uint256 rejectCount;
        uint256 reviseCount;
        uint256 reviewCount;
        string doi;
        string field; // subject field assigned by the editor (append-only for upgrade safety)
    }

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant RESEARCHER_ROLE = keccak256("RESEARCHER_ROLE");
    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // EIP-712 type hashes
    bytes32 private constant SUBMIT_MANUSCRIPT_TYPEHASH = keccak256(
        "SubmitManuscript(string cid,string metadata,uint256 nonce)"
    );
    bytes32 private constant REVISE_MANUSCRIPT_TYPEHASH = keccak256(
        "ReviseManuscript(uint256 msId,string newCid,uint256 nonce)"
    );
    bytes32 private constant SUBMIT_REVIEW_TYPEHASH = keccak256(
        "SubmitReview(uint256 msId,string comments,uint8 verdict,uint256 nonce)"
    );

    uint256 public constant PLAGIARISM_THRESHOLD = 30;
    uint256 public constant PUBLICATION_FEE = 100 * 1e18;
    uint256 public constant REVIEWER_INCENTIVE = 10 * 1e18;

    IDOIToken public doiToken;
    IERC20 public journalToken;
    IReviewOracle public reviewOracle;
    uint256 public nextManuscriptId;

    mapping(uint256 => Manuscript) private _manuscripts;
    mapping(uint256 => mapping(address => bool)) public hasReviewed;
    mapping(uint256 => mapping(address => string)) public reviewHashes;
    mapping(address => uint256) public nonces;
    // Editor-verified subject fields per reviewer (latest set overwrites). Appended for upgrade safety.
    mapping(address => string[]) private _verifiedReviewerFields;

    error InvalidState(uint256 msId, Status expected, Status actual);
    error NotAuthor(uint256 msId, address caller);
    error NotAssignedReviewer(uint256 msId, address caller);
    error AlreadyReviewed(uint256 msId, address reviewer);
    error InsufficientAllowance(uint256 required, uint256 actual);
    error ManuscriptNotFound(uint256 msId);
    error PlagiarismThresholdExceeded(uint256 msId, uint256 score);
    error TransferFailed();
    error ZeroAddress();
    error InvalidSignature();

    event ManuscriptSubmitted(uint256 indexed msId, address indexed author, string cid);
    event DecisionMade(uint256 indexed msId, Status decision);
    event IncentivePaid(address indexed reviewer, uint256 amount);
    event ManuscriptRevised(uint256 indexed msId, string newCid, uint256 version);
    event ReviewSubmitted(uint256 indexed msId, address indexed reviewer, Verdict verdict, string reviewCid);
    event ReviewersAssigned(uint256 indexed msId, address[] reviewers);
    event DOIMinted(uint256 indexed msId, uint256 indexed doiTokenId);
    event DOIRegistered(uint256 indexed msId, string doi, uint256 indexed doiTokenId);
    event EditorReviewed(uint256 indexed msId, bool approved, string field, string editorCid);
    event ReviewerFieldsVerified(address indexed reviewer, string[] fields);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _doiToken,
        address _journalToken,
        address _reviewOracle,
        address admin
    ) public initializer {
        if (_doiToken == address(0) || _journalToken == address(0) || _reviewOracle == address(0) || admin == address(0))
            revert ZeroAddress();

        __AccessControl_init();
        __EIP712_init("PublicationRegistry", "1");

        doiToken = IDOIToken(_doiToken);
        journalToken = IERC20(_journalToken);
        reviewOracle = IReviewOracle(_reviewOracle);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, _reviewOracle);
    }

    // Returns hardcoded name to avoid needing __EIP712_init on upgrade
    function _EIP712Name() internal pure override returns (string memory) {
        return "PublicationRegistry";
    }

    function _EIP712Version() internal pure override returns (string memory) {
        return "1";
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function submitManuscript(
        string calldata cid,
        string calldata metadata,
        uint256 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyRole(OPERATOR_ROLE) returns (uint256 msId) {
        bytes32 structHash = keccak256(abi.encode(
            SUBMIT_MANUSCRIPT_TYPEHASH,
            keccak256(bytes(cid)),
            keccak256(bytes(metadata)),
            nonce
        ));
        address actualAuthor = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        if (actualAuthor == address(0)) revert InvalidSignature();
        if (nonces[actualAuthor] != nonce) revert InvalidSignature();
        unchecked { nonces[actualAuthor]++; }

        msId = nextManuscriptId++;
        Manuscript storage ms = _manuscripts[msId];
        ms.id = msId;
        ms.author = actualAuthor;
        ms.cid = cid;
        ms.metadata = metadata;
        ms.status = Status.CHECKING;
        ms.version = 1;

        emit ManuscriptSubmitted(msId, actualAuthor, cid);
        reviewOracle.requestPlagiarismCheck(msId, cid);
    }

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

        // Plagiarism passed — wait for an editor to screen and categorize the manuscript
        // before any reviewers are requested.
        ms.status = Status.PENDING_EDITOR;
        emit DecisionMade(msId, Status.PENDING_EDITOR);
    }

    // Editor screening (backend-relayed via OPERATOR_ROLE; editor identity is enforced
    // off-chain by the backend's JWT role). Approve → assign field, move to UNDER_REVIEW
    // and request reviewers; reject → desk-reject the manuscript.
    function submitEditorReview(
        uint256 msId,
        bool approve,
        string calldata field,
        string calldata editorCid
    ) external onlyRole(OPERATOR_ROLE) {
        _requireState(msId, Status.PENDING_EDITOR);
        Manuscript storage ms = _manuscripts[msId];

        if (approve) {
            ms.field = field;
            ms.status = Status.UNDER_REVIEW;
            emit EditorReviewed(msId, true, field, editorCid);
            emit DecisionMade(msId, Status.UNDER_REVIEW);
            reviewOracle.requestRandomReviewers(msId);
        } else {
            ms.status = Status.REJECTED;
            emit EditorReviewed(msId, false, field, editorCid);
            emit DecisionMade(msId, Status.REJECTED);
        }
    }

    // Records a reviewer's editor-verified subject fields on-chain (backend-relayed).
    // Overwrites any previous set — the latest verification wins.
    function verifyReviewerFields(
        address reviewer,
        string[] calldata fields
    ) external onlyRole(OPERATOR_ROLE) {
        if (reviewer == address(0)) revert ZeroAddress();
        _verifiedReviewerFields[reviewer] = fields;
        emit ReviewerFieldsVerified(reviewer, fields);
    }

    function fulfillRandomReviewers(
        uint256 msId,
        address[] calldata reviewers
    ) external onlyRole(ORACLE_ROLE) {
        Manuscript storage ms = _manuscripts[msId];
        _requireState(msId, Status.UNDER_REVIEW);

        ms.reviewers = reviewers;

        emit ReviewersAssigned(msId, reviewers);
    }

    // Caller must have OPERATOR_ROLE. Actual reviewer is recovered from the EIP-712 signature.
    // The user signs (msId, comments, verdict, nonce); the backend uploads comments to IPFS
    // and passes the resulting reviewCid separately — not covered by the signature.
    function submitReview(
        uint256 msId,
        string calldata reviewCid,
        Verdict verdict,
        string calldata comments,
        uint256 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyRole(OPERATOR_ROLE) {
        bytes32 structHash = keccak256(abi.encode(
            SUBMIT_REVIEW_TYPEHASH,
            msId,
            keccak256(bytes(comments)),
            uint8(verdict),
            nonce
        ));
        address actualReviewer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        if (actualReviewer == address(0)) revert InvalidSignature();
        if (nonces[actualReviewer] != nonce) revert InvalidSignature();
        unchecked { nonces[actualReviewer]++; }

        _requireState(msId, Status.UNDER_REVIEW);
        if (!_isAssignedReviewer(msId, actualReviewer))
            revert NotAssignedReviewer(msId, actualReviewer);
        if (hasReviewed[msId][actualReviewer])
            revert AlreadyReviewed(msId, actualReviewer);

        hasReviewed[msId][actualReviewer] = true;
        reviewHashes[msId][actualReviewer] = reviewCid;
        Manuscript storage ms = _manuscripts[msId];
        ms.reviewCount++;

        if (verdict == Verdict.ACCEPT) ms.acceptCount++;
        else if (verdict == Verdict.REJECT) ms.rejectCount++;
        else ms.reviseCount++;

        emit ReviewSubmitted(msId, actualReviewer, verdict, reviewCid);

        if (ms.reviewCount == ms.reviewers.length) {
            _evaluateDecision(msId);
        }
    }

    function reviseManuscript(
        uint256 msId,
        string calldata newCid,
        uint256 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyRole(OPERATOR_ROLE) {
        bytes32 structHash = keccak256(abi.encode(
            REVISE_MANUSCRIPT_TYPEHASH,
            msId,
            keccak256(bytes(newCid)),
            nonce
        ));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        if (_manuscripts[msId].author != signer) revert NotAuthor(msId, signer);
        if (nonces[signer] != nonce) revert InvalidSignature();
        unchecked { nonces[signer]++; }

        _requireState(msId, Status.REVISION_REQUESTED);
        Manuscript storage ms = _manuscripts[msId];
        ms.cid = newCid;
        ms.version++;
        ms.status = Status.CHECKING;

        _resetReviewState(msId);

        emit ManuscriptRevised(msId, newCid, ms.version);
        reviewOracle.requestPlagiarismCheck(msId, newCid);
    }

    // payPublicationFee is called directly by the author's wallet (no relayer needed).
    // RESEARCHER_ROLE check removed — _requireAuthor is sufficient since ms.author is now
    // the user's wallet address (set by ecrecover in submitManuscript).
    function payPublicationFee(
        uint256 msId
    ) external {
        _requireState(msId, Status.ACCEPTED);
        _requireAuthor(msId);

        uint256 totalCost = PUBLICATION_FEE;
        uint256 allowed = journalToken.allowance(msg.sender, address(this));
        if (allowed < totalCost)
            revert InsufficientAllowance(totalCost, allowed);

        bool success = journalToken.transferFrom(
            msg.sender,
            address(this),
            totalCost
        );
        if (!success) revert TransferFailed();

        address[] memory reviewers = _manuscripts[msId].reviewers;
        for (uint256 i = 0; i < reviewers.length; i++) {
            bool paid = journalToken.transfer(reviewers[i], REVIEWER_INCENTIVE);
            if (!paid) revert TransferFailed();
            emit IncentivePaid(reviewers[i], REVIEWER_INCENTIVE);
        }

        Manuscript storage ms = _manuscripts[msId];
        string memory doi = DOILib.buildDOI(msId, ms.version);
        ms.doi = doi;

        string memory tokenURI_ = string(
            abi.encodePacked(
                "ipfs://",
                ms.cid,
                "?doi=",
                doi
            )
        );
        uint256 doiTokenId = doiToken.mint(msg.sender, tokenURI_);

        ms.status = Status.PUBLISHED;

        emit DOIMinted(msId, doiTokenId);
        emit DOIRegistered(msId, doi, doiTokenId);
        emit DecisionMade(msId, Status.PUBLISHED);
    }

    function addResearcher(
        address researcher
    ) external onlyRole(ADMIN_ROLE) {
        grantRole(RESEARCHER_ROLE, researcher);
    }

    function addReviewer(
        address reviewer
    ) external onlyRole(ADMIN_ROLE) {
        grantRole(REVIEWER_ROLE, reviewer);
    }

    function addOperator(
        address operator
    ) external onlyRole(ADMIN_ROLE) {
        grantRole(OPERATOR_ROLE, operator);
    }

    function getManuscript(
        uint256 msId
    ) external view returns (Manuscript memory) {
        if (msId >= nextManuscriptId) revert ManuscriptNotFound(msId);
        return _manuscripts[msId];
    }

    function getStatus(uint256 msId) external view returns (Status) {
        if (msId >= nextManuscriptId) revert ManuscriptNotFound(msId);
        return _manuscripts[msId].status;
    }

    function getReviewers(
        uint256 msId
    ) external view returns (address[] memory) {
        if (msId >= nextManuscriptId) revert ManuscriptNotFound(msId);
        return _manuscripts[msId].reviewers;
    }

    // Subject field assigned by the editor. The oracle reads this to pick field-matched reviewers.
    function getField(uint256 msId) external view returns (string memory) {
        if (msId >= nextManuscriptId) revert ManuscriptNotFound(msId);
        return _manuscripts[msId].field;
    }

    function getVerifiedFields(
        address reviewer
    ) external view returns (string[] memory) {
        return _verifiedReviewerFields[reviewer];
    }

    function _evaluateDecision(uint256 msId) internal {
        Manuscript storage ms = _manuscripts[msId];
        uint256 majority = (ms.reviewers.length / 2) + 1;

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

    function _resetReviewState(uint256 msId) internal {
        Manuscript storage ms = _manuscripts[msId];

        for (uint256 i = 0; i < ms.reviewers.length; i++) {
            delete hasReviewed[msId][ms.reviewers[i]];
            delete reviewHashes[msId][ms.reviewers[i]];
        }

        ms.acceptCount = 0;
        ms.rejectCount = 0;
        ms.reviseCount = 0;
        ms.reviewCount = 0;
        delete ms.reviewers;
    }

    function _requireState(uint256 msId, Status expected) internal view {
        Status actual = _manuscripts[msId].status;
        if (actual != expected) revert InvalidState(msId, expected, actual);
    }

    function _requireAuthor(uint256 msId) internal view {
        if (_manuscripts[msId].author != msg.sender)
            revert NotAuthor(msId, msg.sender);
    }

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

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(ADMIN_ROLE) {}
}
