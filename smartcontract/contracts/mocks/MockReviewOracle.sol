// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockReviewOracle
 * @notice A minimal mock of the ReviewOracle for local testing.
 *         Implements the IReviewOracle interface but does nothing
 *         on plagiarism/reviewer-selection requests — allowing the
 *         test harness to call PublicationRegistry's fulfill* functions
 *         directly, simulating the off-chain oracle callback flow.
 */
contract MockReviewOracle {
    event PlagiarismCheckRequested(uint256 indexed requestId, uint256 indexed msId, string cid);
    event ReviewerSelectionRequested(uint256 indexed requestId, uint256 indexed msId);

    uint256 public nextPlagiarismRequestId;
    uint256 public nextReviewerRequestId;

    function requestPlagiarismCheck(
        uint256 msId,
        string calldata cid
    ) external {
        emit PlagiarismCheckRequested(nextPlagiarismRequestId++, msId, cid);
        // No-op — test harness will call fulfillPlagiarism directly on the Registry
    }

    function requestRandomReviewers(uint256 msId) external {
        emit ReviewerSelectionRequested(nextReviewerRequestId++, msId);
        // No-op — test harness will call fulfillRandomReviewers directly on the Registry
    }
}
