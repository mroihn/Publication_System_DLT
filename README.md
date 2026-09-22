# Blockchain-Based Scientific Publication Framework

**If the app feels very slow, try the `with_indexer` branch.** This branch reads every manuscript directly from the blockchain on each request, so pages that list many manuscripts wait on one RPC call per manuscript. The `with_indexer` branch keeps a PostgreSQL copy of the on-chain data, kept in sync by a background indexer, and serves reads from it instead.

## Prerequisites

- Docker with Docker Compose
- Node.js 22 and Go 1.23 (only needed to deploy contracts or run services outside Docker)
- A wallet private key funded with Sepolia ETH
- An Ethereum Sepolia RPC endpoint from a dedicated provider (Infura, Alchemy, …). Free public RPCs have been observed to drop `eth_getLogs` results, which makes the manuscript history incomplete.
- Optional: a [Pinata](https://pinata.cloud) JWT for real IPFS uploads, and a Google OAuth client ID for identity verification

## 1. Deploy the smart contracts

Skip this step if you reuse contracts that are already deployed.

```bash
cd smartcontract
npm install
cp .env.example .env        # fill PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY (optional)

npx hardhat run scripts/deploy.js --network sepolia
```

The script prints four addresses (`JournalToken`, `DOIToken`, `ReviewOracle`, `PublicationRegistry`). Then grant the backend relayer wallet the `OPERATOR_ROLE` on the registry:

```bash
REGISTRY_CONTRACT_ADDRESS=<PublicationRegistry address> \
  npx hardhat run scripts/grant-roles.js --network sepolia
```

By default the role goes to the deployer wallet. Set `OPERATOR_ADDRESS` to grant it to a different wallet. Note the block number of the deployment (visible on Etherscan); the backend uses it as the starting block for log queries.

Optional, verify on Etherscan:

```bash
npx hardhat verify --network sepolia <JournalToken address> 1000000
npx hardhat verify --network sepolia <DOIToken address>
npx hardhat verify --network sepolia <ReviewOracle address>
npx hardhat verify --network sepolia <PublicationRegistry proxy address>
```

## 2. Configure environment files

Copy each example file and fill in the values:

```bash
cp backend-go/.env.example   backend-go/.env
cp oracle/.env.example       oracle/.env
cp frontend/.env.local.example frontend/.env.local
```

| Value | `backend-go/.env` | `oracle/.env` | `frontend/.env.local` |
|---|---|---|---|
| `PublicationRegistry` (proxy) | `REGISTRY_CONTRACT_ADDRESS` | — (see below) | `NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS` |
| `ReviewOracle` | `REVIEW_ORACLE_CONTRACT_ADDRESS` | `REVIEW_ORACLE_ADDRESS` | — |
| `DOIToken` | `DOI_TOKEN_CONTRACT_ADDRESS` | — | `NEXT_PUBLIC_DOI_TOKEN_ADDRESS` |
| `JournalToken` | — | — | `NEXT_PUBLIC_JOURNAL_TOKEN_ADDRESS` |
| Deployment block | `REGISTRY_DEPLOY_BLOCK` | — | — |
| RPC endpoint | `RPC_URL` | `SEPOLIA_RPC_URL` | `NEXT_PUBLIC_RPC_URL` |
| Relayer / oracle wallet key | `OPERATOR_PRIVATE_KEY` | `ORACLE_PRIVATE_KEY` | — |

Other values:

- `backend-go/.env`: set `JWT_SECRET` to a long random string. `PINATA_JWT` enables real IPFS uploads (empty returns a mock CID). `GOOGLE_CLIENT_ID` enables identity verification.
- `oracle/.env`: `PLAGIARISM_API_URL` is an optional external checker; the oracle POSTs `{ "cid": "..." }` and expects `{ "score": 0-100 }`. Leave it empty to use the built-in mock score. `REVIEWER_*` and `NUM_REVIEWERS` are no longer used; reviewers are selected by the backend from editor-verified reviewer fields.
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3001/api/v1`. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must equal the backend `GOOGLE_CLIENT_ID`.
- The `ORACLE_ROLE` is granted to the deployer wallet at deploy time, so `ORACLE_PRIVATE_KEY` must be the deployer key unless you grant the role elsewhere.

When running with Docker Compose, also create a `.env` file in the repository root. Compose reads it for variable substitution, and these two values take precedence over the per-service files:

```bash
cat > .env <<'EOF'
REGISTRY_CONTRACT_ADDRESS=<PublicationRegistry address>   # passed to the oracle container
JWT_SECRET=<long random string>                           # overrides backend-go/.env; defaults to "supersecret"
EOF
```

## 3. Run with Docker Compose

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001/api/v1 (health: `/api/v1/health`) |
| PostgreSQL | `localhost:5433` (user/password `postgres`, database `publish_db`) |

The frontend's `NEXT_PUBLIC_*` values are baked in when the image is built, so run `docker compose up --build` again after changing `frontend/.env.local`.

Database migrations run automatically every time the backend starts; they are idempotent and also seed the demo accounts below. Compose overrides the database host for the backend and sets a shared `ORACLE_SHARED_SECRET` for backend and oracle, so those need no manual configuration.

## Run services individually (development)

Start only the database with Docker, then run each service in its own terminal:

```bash
docker compose up -d database

# backend (the database is exposed on host port 5433)
cd backend-go && DB_PORT=5433 go run ./cmd/main.go

# oracle
cd oracle && npm install && BACKEND_URL=http://localhost:3001 npm start

# frontend
cd frontend && npm install && npm run dev
```

Outside Compose, set the same `ORACLE_SHARED_SECRET` value in `backend-go/.env` and `oracle/.env`; the oracle uses it to request reviewer sessions from the backend.

## Demo accounts

| Role | Email | Password | Categories |
|---|---|---|---|
| Editor (all categories) | `editor@desci.local` | `editor123` | all |
| Editor | `editor.ai@desci.local` | `editor123` | AI |
| Editor | `editor.chain@desci.local` | `editor123` | Blockchain, Computer Security |
| Editor | `editor.data@desci.local` | `editor123` | Data Science, Cloud Computing |
| Reviewer | `rev1@mail.com` | `rev1` | all (pre-verified) |
| Reviewer | `rev2@mail.com` | `rev2` | all (pre-verified) |
| Reviewer | `rev3@mail.com` | `rev3` | all (pre-verified) |

Authors register through the UI. Submitting, reviewing and publishing need a MetaMask wallet on Sepolia; the author pays the publication fee in JRT, so the author's wallet needs JRT from the deployer.

### Use your own wallets for the seeded reviewers

The seeded reviewers come bound to fixed wallet addresses that belong to the original developer:

| Reviewer | Seeded wallet |
|---|---|
| `rev1@mail.com` | `0x3fcb91b1ba0214647227f6d5ae57bdfe95500b8b` |
| `rev2@mail.com` | `0xfcdc925d3c852df9192a0aa842911570da581d91` |
| `rev3@mail.com` | `0x3732822cb27698b0b1a5137af4141d9d5b2853e3` |

Replace them with wallets you control. The bound wallet is what identifies a reviewer: it is recorded as the reviewer's main address on every review session assigned to them, and while these addresses stay bound to the seeded accounts no other account can bind them. Withdrawing JRT earnings itself works with any wallet connected in MetaMask.

Edit the addresses in `backend-go/internal/db/migrations/008_seed_reviewers.up.sql` (write them in lowercase), then restart the backend. Changing the wallet from the Profile page does not last: this seed migration re-runs on every backend start and resets the three reviewers' wallets, passwords and fields to the values in the file.

## Tests

```bash
# smart contracts
cd smartcontract && npx hardhat test

# backend unit tests
cd backend-go && go test ./...

# backend integration tests (need PostgreSQL on localhost:5433)
docker compose up -d database
cd backend-go && go test -tags=integration ./test/integration/...

# frontend
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

CI (`.github/workflows/ci.yml`) runs the frontend lint, type check and build, and the backend `go vet`, `staticcheck` and build on every push and pull request to `main`.

