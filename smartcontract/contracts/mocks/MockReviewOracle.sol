// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockReviewOracle
 * @notice A minimal mock of the ReviewOracle for local testing.
 *         Implements the IReviewOracle interface but does nothing
 *         on plagiarism/VRF requests — allowing the test harness
 *         to call PublicationRegistry's fulfill* functions directly.
 */
contract MockReviewOracle {
    event PlagiarismCheckRequested(uint256 msId, string cid);
    event RandomReviewersRequested(uint256 msId);

    function requestPlagiarismCheck(
        uint256 msId,
        string calldata cid
    ) external {
        emit PlagiarismCheckRequested(msId, cid);
        // No-op — test harness will call fulfillPlagiarism directly
    }

    function requestRandomReviewers(uint256 msId) external {
        emit RandomReviewersRequested(msId);
        // No-op — test harness will call fulfillRandomReviewers directly
    }
}
