// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DOIToken
 * @notice ERC-721 non-fungible token representing a published article.
 * @dev Each token's metadata URI points to an IPFS document containing the
 *      article's DOI information. Only the PublicationRegistry (granted
 *      MINTER_ROLE) may mint new DOI tokens.
 */
contract DOIToken is ERC721, ERC721URIStorage, AccessControl {
    /// @notice Role identifier for the address allowed to mint DOI NFTs.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Running counter for token IDs.
    uint256 private _nextTokenId;

    // ──────────────────────────────── Custom Errors ────────────────────────────────

    /// @notice Thrown when minting to the zero address.
    error MintToZeroAddress();

    // ──────────────────────────────── Events ───────────────────────────────────────

    /**
     * @notice Emitted when a reader posts a comment hash against a published DOI.
     * @param doiId   The token ID of the DOI NFT.
     * @param reader  The address of the commenter.
     * @param hash    The keccak-256 hash of the comment content (stored off-chain).
     */
    event CommentPosted(
        uint256 indexed doiId,
        address indexed reader,
        bytes32 hash
    );

    // ──────────────────────────────── Constructor ──────────────────────────────────

    constructor() ERC721("DOIToken", "DOI") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // MINTER_ROLE is granted post-deployment to PublicationRegistry
    }

    // ──────────────────────────────── External ─────────────────────────────────────

    /**
     * @notice Mint a new DOI NFT for a published article.
     * @param to        Recipient (the article's author).
     * @param tokenURI_ IPFS URI pointing to the article's DOI metadata.
     * @return tokenId  The newly minted token ID.
     */
    function mint(
        address to,
        string memory tokenURI_
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        if (to == address(0)) revert MintToZeroAddress();

        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);
    }

    /**
     * @notice Post a comment hash against a published DOI NFT.
     * @dev Anyone may call this. The actual comment content lives off-chain;
     *      only its hash is recorded for indexing / integrity purposes.
     * @param doiId The token ID of the DOI NFT.
     * @param hash  The keccak-256 hash of the comment content.
     */
    function postComment(uint256 doiId, bytes32 hash) external {
        // Ensure the DOI token exists (ownerOf reverts for non-existent tokens)
        ownerOf(doiId);
        emit CommentPosted(doiId, msg.sender, hash);
    }

    // ──────────────────────────────── Overrides ────────────────────────────────────

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
