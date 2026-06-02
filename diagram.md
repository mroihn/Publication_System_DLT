### Contract Interaction Diagram

```mermaid
sequenceDiagram
    participant R as Researcher
    participant PR as PublicationRegistry
    participant RO as ReviewOracle
    participant OO as Off-chain Oracle Operator
    participant JT as JournalToken
    participant DOI as DOIToken
    participant Rev as Reviewers

    R->>PR: submitManuscript(cid, metadata)
    PR->>RO: requestPlagiarismCheck(msId, cid)
    Note over RO: Emits PlagiarismCheckRequested
    
    OO->>RO: fulfillPlagiarismCheck(requestId, score)
    RO->>PR: fulfillPlagiarism(msId, score)
    
    alt score ≤ threshold
        PR->>RO: requestRandomReviewers(msId)
        Note over RO: Selects via block.prevrandao
        RO->>PR: fulfillRandomReviewers(msId, reviewers[])
        
        loop Each Reviewer (3x)
            Rev->>PR: submitReview(msId, hash, verdict)
        end
        
        alt Majority ACCEPT
            PR-->>PR: Status → ACCEPTED
            R->>JT: approve(registry, fee)
            R->>PR: payPublicationFee(msId)
            PR->>JT: transferFrom(author, registry, fee)
            PR->>JT: transfer(reviewer, incentive) × 3
            PR->>DOI: mint(author, tokenId, uri)
            PR-->>PR: Status → PUBLISHED
        else Majority REVISE
            PR-->>PR: Status → REVISION_REQUESTED
            R->>PR: reviseManuscript(msId, newCid)
            Note over PR: Re-enters CHECKING state
        else Majority REJECT
            PR-->>PR: Status → REJECTED
        endz
    else score > threshold
        PR-->>PR: Status → REJECTED
    end
```

## Architecture

```mermaid
graph TD
    R[Researcher] -->|submitManuscript| PR[PublicationRegistry<br/>UUPS Proxy]
    PR -->|requestPlagiarismCheck| RO[ReviewOracle]
    OO[Off-chain Oracle Operator] -->|fulfillPlagiarismCheck| RO
    RO -->|fulfillPlagiarism| PR
    PR -->|requestRandomReviewers| RO
    RO -->|fulfillRandomReviewers| PR
    REV[Reviewers] -->|submitReview| PR
    R -->|payPublicationFee| PR
    PR -->|transferFrom / transfer| JT[JournalToken<br/>ERC-20]
    PR -->|mint| DOI[DOIToken<br/>ERC-721]
```

## State Machine

```mermaid
stateDiagram-v2
    [*] --> CHECKING: submitManuscript()
    CHECKING --> UNDER_REVIEW: plagiarism ≤ 30
    CHECKING --> REJECTED: plagiarism > 30
    UNDER_REVIEW --> ACCEPTED: majority ACCEPT
    UNDER_REVIEW --> REJECTED: majority REJECT
    UNDER_REVIEW --> REVISION_REQUESTED: majority REVISE
    REVISION_REQUESTED --> CHECKING: reviseManuscript()
    ACCEPTED --> PUBLISHED: payPublicationFee()
    PUBLISHED --> [*]
    REJECTED --> [*]
```

## Manuscript Revision Flow

```mermaid
sequenceDiagram
    participant R as Researcher
    participant PR as PublicationRegistry
    participant RO as ReviewOracle
    participant OO as Off-chain Oracle Operator

    Note over R, PR: Pre-condition: Status = REVISION_REQUESTED
    R->>PR: reviseManuscript(msId, newCid)
    PR-->>PR: Increment version
    PR-->>PR: Reset review counts
    PR-->>PR: Status → CHECKING
    PR->>RO: requestPlagiarismCheck(msId, newCid)
    Note over RO: Emits PlagiarismCheckRequested
    
    OO->>RO: fulfillPlagiarismCheck(requestId, score)
    RO->>PR: fulfillPlagiarism(msId, score)
    
    alt score ≤ 30
        PR-->>PR: Status → UNDER_REVIEW
        PR->>RO: requestRandomReviewers(msId)
        Note over PR, RO: Flow continues as normal...
    else score > 30
        PR-->>PR: Status → REJECTED
    end
```

## DOI Token Usage

```mermaid
sequenceDiagram
    participant PR as PublicationRegistry
    participant DOI as DOIToken
    participant R as Reader/Researcher
    participant IPFS as IPFS

    Note over PR, DOI: After fee payment
    PR->>DOI: mint(author, uri)
    DOI-->>PR: tokenId
    
    Note over R, DOI: Usage & Interaction
    R->>DOI: ownerOf(tokenId)
    DOI-->>R: authorAddress
    R->>DOI: tokenURI(tokenId)
    DOI-->>R: ipfs://...
    R->>IPFS: Fetch content
    IPFS-->>R: PDF/Metadata
    
    Note over R, DOI: Peer Discussion
    R->>DOI: postComment(tokenId, hash)
    DOI-->>DOI: Emit CommentPosted
```