// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
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
 * @notice Chainlink VRF v2.5 + Chainlink Functions oracle contract.
 *
 *  • VRF v2.5  – used to randomly select reviewers from a registered pool.
 *  • Functions – used to call an external plagiarism-check API and return
 *                the similarity score on-chain.
 *
 * @dev Only the PublicationRegistry contract (set via `setPublicationRegistry`)
 *      is allowed to initiate oracle requests. Callbacks are routed back to
 *      PublicationRegistry via the `IPublicationRegistryCallback` interface.
 *
 *      Polygon Amoy Testnet configuration:
 *        VRF Coordinator : 0x343300b5d84D444B2ADc9116FEF1bED02BE49Cf2
 *        Key Hash        : 0x816bedba8a50b294e5cbd47842baf240c2385f2eaf719edbd4f250a137a8c899
 *        Functions Router : 0xC22a79eBA640940ABB6dF0f7982cc119578E11De
 *        DON ID          : fun-polygon-amoy-1
 */
contract ReviewOracle is VRFConsumerBaseV2Plus, FunctionsClient, AccessControl {
    using FunctionsRequest for FunctionsRequest.Request;

    // ──────────────────────────────── Constants ────────────────────────────────────

    /// @notice Role for the PublicationRegistry contract.
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    /// @notice Number of reviewers to select per manuscript.
    uint256 public constant NUM_REVIEWERS = 3;

    // ──────────────────────── Chainlink VRF v2.5 Config ───────────────────────────

    /// @notice Key hash (gas lane) for Polygon Amoy.
    bytes32 public immutable i_keyHash;

    /// @notice VRF subscription ID.
    uint256 public immutable i_vrfSubId;

    /// @notice Callback gas limit for VRF fulfillment.
    uint32 public constant VRF_CALLBACK_GAS_LIMIT = 300_000;

    /// @notice Number of block confirmations before VRF response.
    uint16 public constant VRF_REQUEST_CONFIRMATIONS = 3;

    /// @notice Number of random words requested (1 is enough to derive 3 indices).
    uint32 public constant VRF_NUM_WORDS = 1;

    // ────────────────────── Chainlink Functions Config ─────────────────────────────

    /// @notice Functions subscription ID.
    uint64 public immutable i_functionsSubId;

    /// @notice DON ID for Polygon Amoy (bytes32 encoding of "fun-polygon-amoy-1").
    bytes32 public immutable i_donId;

    /// @notice Callback gas limit for Functions fulfillment.
    uint32 public constant FUNCTIONS_CALLBACK_GAS_LIMIT = 300_000;

    /**
     * @notice JavaScript source executed by the Chainlink Functions DON.
     *         It fetches a plagiarism score for a given IPFS CID.
     *         The CID is passed as the first (and only) argument.
     */
    string public constant PLAGIARISM_JS_SOURCE =
        "const cid = args[0];"
        "const res = await Functions.makeHttpRequest({"
        "  url: `https://api.example.com/plagiarism?cid=${cid}`"
        "});"
        "if (res.error) throw Error('API error');"
        "return Functions.encodeUint256(res.data.score);";

    // ──────────────────────────────── State ────────────────────────────────────────

    /// @notice Address of the PublicationRegistry contract.
    address public publicationRegistry;

    /// @notice Pool of registered reviewer addresses.
    address[] public reviewerPool;

    /// @notice VRF requestId → manuscript ID.
    mapping(uint256 => uint256) public vrfRequestToMs;

    /// @notice Functions requestId → manuscript ID.
    mapping(bytes32 => uint256) public funcRequestToMs;

    // ──────────────────────────────── Custom Errors ────────────────────────────────

    error RegistryNotSet();
    error ReviewerPoolTooSmall(uint256 required, uint256 actual);
    error ReviewerAlreadyRegistered(address reviewer);
    error ReviewerNotFound(address reviewer);
    error OracleZeroAddress();

    // ──────────────────────────────── Events ───────────────────────────────────────

    event PlagiarismCheckRequested(uint256 indexed msId, bytes32 requestId);
    event PlagiarismCheckFulfilled(uint256 indexed msId, uint256 score);
    event RandomReviewersRequested(uint256 indexed msId, uint256 requestId);
    event RandomReviewersFulfilled(
        uint256 indexed msId,
        address[] reviewers
    );
    event ReviewerAdded(address indexed reviewer);
    event ReviewerRemoved(address indexed reviewer);

    // ──────────────────────────────── Constructor ──────────────────────────────────

    /**
     * @param vrfCoordinator    Chainlink VRF v2.5 Coordinator address.
     * @param keyHash           Gas-lane key hash for VRF.
     * @param vrfSubId          VRF subscription ID.
     * @param functionsRouter   Chainlink Functions Router address.
     * @param functionsSubId    Functions subscription ID.
     * @param donId             DON ID (bytes32).
     */
    constructor(
        address vrfCoordinator,
        bytes32 keyHash,
        uint256 vrfSubId,
        address functionsRouter,
        uint64 functionsSubId,
        bytes32 donId
    )
        VRFConsumerBaseV2Plus(vrfCoordinator)
        FunctionsClient(functionsRouter)
    {
        i_keyHash = keyHash;
        i_vrfSubId = vrfSubId;
        i_functionsSubId = functionsSubId;
        i_donId = donId;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
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

    // ──────────────────────── Plagiarism Check (Functions) ─────────────────────────

    /**
     * @notice Request a plagiarism check for a manuscript via Chainlink Functions.
     * @param msId The manuscript ID.
     * @param cid  The IPFS CID of the manuscript content.
     */
    function requestPlagiarismCheck(
        uint256 msId,
        string calldata cid
    ) external onlyRole(REGISTRY_ROLE) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(PLAGIARISM_JS_SOURCE);

        string[] memory args = new string[](1);
        args[0] = cid;
        req.setArgs(args);

        bytes32 requestId = _sendRequest(
            req.encodeCBOR(),
            i_functionsSubId,
            FUNCTIONS_CALLBACK_GAS_LIMIT,
            i_donId
        );

        funcRequestToMs[requestId] = msId;
        emit PlagiarismCheckRequested(msId, requestId);
    }

    /**
     * @dev Chainlink Functions callback — receives the plagiarism score.
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory /* err */
    ) internal override {
        uint256 msId = funcRequestToMs[requestId];
        uint256 score = abi.decode(response, (uint256));

        emit PlagiarismCheckFulfilled(msId, score);

        IPublicationRegistryCallback(publicationRegistry).fulfillPlagiarism(
            msId,
            score
        );
    }

    // ──────────────────── Random Reviewer Selection (VRF) ─────────────────────────

    /**
     * @notice Request random words to select reviewers for a manuscript.
     * @param msId The manuscript ID.
     */
    function requestRandomReviewers(
        uint256 msId
    ) external onlyRole(REGISTRY_ROLE) {
        if (reviewerPool.length < NUM_REVIEWERS)
            revert ReviewerPoolTooSmall(NUM_REVIEWERS, reviewerPool.length);

        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: i_keyHash,
                subId: i_vrfSubId,
                requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit: VRF_CALLBACK_GAS_LIMIT,
                numWords: VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );

        vrfRequestToMs[requestId] = msId;
        emit RandomReviewersRequested(msId, requestId);
    }

    /**
     * @dev Chainlink VRF v2.5 callback — derives 3 unique reviewer indices
     *      from a single random word using successive hashing.
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        uint256 msId = vrfRequestToMs[requestId];
        uint256 poolSize = reviewerPool.length;
        address[] memory selected = new address[](NUM_REVIEWERS);
        uint256 selectedCount = 0;

        // Use the single random word to derive multiple unique indices
        uint256 seed = randomWords[0];

        // Fisher-Yates-style selection using hashed seeds
        // We create a temporary copy of valid indices
        uint256[] memory indices = new uint256[](poolSize);
        for (uint256 i = 0; i < poolSize; i++) {
            indices[i] = i;
        }

        uint256 remaining = poolSize;
        for (uint256 i = 0; i < NUM_REVIEWERS && remaining > 0; i++) {
            // Derive a new pseudo-random value for each selection
            uint256 rand = uint256(keccak256(abi.encode(seed, i)));
            uint256 idx = rand % remaining;

            selected[selectedCount] = reviewerPool[indices[idx]];
            selectedCount++;

            // Swap selected index with the last valid index
            indices[idx] = indices[remaining - 1];
            remaining--;
        }

        emit RandomReviewersFulfilled(msId, selected);

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

    // ──────────────────────────── Interface Support ────────────────────────────────

    function supportsInterface(
        bytes4 interfaceId
    ) public pure override(AccessControl) returns (bool) {
        return
            interfaceId == type(AccessControl).interfaceId ||
            interfaceId == 0x01ffc9a7; // ERC165
    }
}
