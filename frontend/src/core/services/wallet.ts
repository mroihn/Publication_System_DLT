import { createPublicClient, createWalletClient, custom, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

const REGISTRY_ADDRESS = (
  process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS ?? ""
) as `0x${string}`;

const JOURNAL_TOKEN_ADDRESS = (
  process.env.NEXT_PUBLIC_JOURNAL_TOKEN_ADDRESS ?? ""
) as `0x${string}`;

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "";

// Publication fee charged by the contract: 100 JRT (18 decimals).
export const PUBLICATION_FEE = 100n * 10n ** 18n;

const noncesAbi = [
  {
    name: "nonces",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL || undefined),
});

const SEPOLIA_CHAIN_ID = "0xaa36a7";

export async function getWalletClient() {
  if (!window.ethereum) throw new Error("MetaMask is not installed");

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];
  const account = accounts[0] as `0x${string}`;

  const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string;
  if (chainId.toLowerCase() !== SEPOLIA_CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: SEPOLIA_CHAIN_ID,
            chainName: "Sepolia Testnet",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          }],
        });
      } else {
        throw new Error("Please switch MetaMask to the Sepolia testnet to continue.");
      }
    }
  }

  return {
    client: createWalletClient({
      account,
      chain: sepolia,
      transport: custom(window.ethereum),
    }),
    account,
  };
}

export async function getNonce(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: noncesAbi,
    functionName: "nonces",
    args: [address],
  });
}

export const DOMAIN = {
  name: "PublicationRegistry",
  version: "1",
  chainId: 11155111,
  verifyingContract: REGISTRY_ADDRESS,
} as const;

// ─── Pay publication fee → publish ──────────────────────────────────────────

const journalTokenAbi = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const payFeeAbi = [
  {
    name: "payPublicationFee",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "msId", type: "uint256" }],
    outputs: [],
  },
] as const;

export type PayStep = "approving" | "publishing";

/**
 * Pays the publication fee for a manuscript and triggers DOI minting.
 * Two on-chain transactions signed by the author's own wallet:
 *   1. approve(registry, PUBLICATION_FEE) on JournalToken — skipped if already approved
 *   2. payPublicationFee(msId) on PublicationRegistry
 * `onStep` reports progress so the UI can show "Approving…" / "Publishing…".
 */
export async function payPublicationFee(
  msId: number | bigint,
  onStep?: (step: PayStep) => void,
): Promise<{ txHash: `0x${string}` }> {
  if (!JOURNAL_TOKEN_ADDRESS) {
    throw new Error("JournalToken address is not configured (NEXT_PUBLIC_JOURNAL_TOKEN_ADDRESS).");
  }

  const { client, account } = await getWalletClient();

  // 1. Approve only if the current allowance is insufficient.
  const allowance = await publicClient.readContract({
    address: JOURNAL_TOKEN_ADDRESS,
    abi: journalTokenAbi,
    functionName: "allowance",
    args: [account, REGISTRY_ADDRESS],
  });

  if (allowance < PUBLICATION_FEE) {
    onStep?.("approving");
    const approveHash = await client.writeContract({
      address: JOURNAL_TOKEN_ADDRESS,
      abi: journalTokenAbi,
      functionName: "approve",
      args: [REGISTRY_ADDRESS, PUBLICATION_FEE],
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  // 2. Pay the fee → contract mints the DOI NFT and sets status to PUBLISHED.
  onStep?.("publishing");
  const txHash = await client.writeContract({
    address: REGISTRY_ADDRESS,
    abi: payFeeAbi,
    functionName: "payPublicationFee",
    args: [BigInt(msId)],
    account,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { txHash };
}

// ─── Session Wallets (double-blind anonymity) ───────────────────────────────

const erc20Abi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Gas budgets sent from the main wallet to a burner (Sepolia; generous).
const GAS_FOR_PUBLISH = parseEther("0.003"); // approve + payPublicationFee
const GAS_FOR_WITHDRAW = parseEther("0.001"); // single ERC-20 transfer

export type SubmissionKeypair = { address: `0x${string}`; privateKey: `0x${string}` };

/** Generates a fresh burner keypair for anonymous submission/review. */
export function generateSessionWallet(): SubmissionKeypair {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

const submissionKey = (address: string) => `submissionwallet:${address.toLowerCase()}`;

/** Persists a SubmissionWallet private key in the browser (never sent to the backend). */
export function saveSubmissionKey(address: string, privateKey: string) {
  if (typeof window !== "undefined") localStorage.setItem(submissionKey(address), privateKey);
}

/** Retrieves the SubmissionWallet private key for an on-chain author address, if this browser holds it. */
export function getSubmissionKey(address: string): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(submissionKey(address)) as `0x${string}` | null;
}

/** Signs EIP-712 typed data with a raw private key (no RPC / no MetaMask). */
export async function signTypedDataWith(
  privateKey: `0x${string}`,
  types: Record<string, { name: string; type: string }[]>,
  primaryType: string,
  message: Record<string, unknown>,
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(privateKey);
  return account.signTypedData({ domain: DOMAIN, types, primaryType, message });
}

/** Wallet client bound to a burner private key, for sending its own transactions. */
function sessionWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL || undefined) });
  return { client, account };
}

export type PublishStep = "funding-jrt" | "funding-gas" | "approving" | "publishing";

/**
 * Anonymous publish: the author funds their burner SubmissionWallet from the main
 * MetaMask wallet (100 JRT + gas), then the burner approves and pays the fee itself
 * so that msg.sender == ms.author on-chain.
 */
export async function fundAndPublish(
  msId: number | bigint,
  submissionPrivateKey: `0x${string}`,
  onStep?: (step: PublishStep) => void,
): Promise<{ txHash: `0x${string}` }> {
  if (!JOURNAL_TOKEN_ADDRESS) {
    throw new Error("JournalToken address is not configured (NEXT_PUBLIC_JOURNAL_TOKEN_ADDRESS).");
  }
  const submission = privateKeyToAccount(submissionPrivateKey);
  const { client: main, account: mainAccount } = await getWalletClient();

  // 1. Main wallet → SubmissionWallet: 100 JRT.
  onStep?.("funding-jrt");
  const jrtBal = await publicClient.readContract({
    address: JOURNAL_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [submission.address],
  });
  if (jrtBal < PUBLICATION_FEE) {
    const h = await main.writeContract({
      address: JOURNAL_TOKEN_ADDRESS, abi: erc20Abi, functionName: "transfer",
      args: [submission.address, PUBLICATION_FEE - jrtBal], account: mainAccount,
    });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }

  // 2. Main wallet → SubmissionWallet: gas ETH (for approve + pay).
  onStep?.("funding-gas");
  const ethBal = await publicClient.getBalance({ address: submission.address });
  if (ethBal < GAS_FOR_PUBLISH) {
    const h = await main.sendTransaction({
      to: submission.address, value: GAS_FOR_PUBLISH - ethBal, account: mainAccount,
    });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }

  // 3. SubmissionWallet: approve + payPublicationFee (msg.sender == author).
  const { client: burner } = sessionWalletClient(submissionPrivateKey);
  const allowance = await publicClient.readContract({
    address: JOURNAL_TOKEN_ADDRESS, abi: journalTokenAbi, functionName: "allowance",
    args: [submission.address, REGISTRY_ADDRESS],
  });
  if (allowance < PUBLICATION_FEE) {
    onStep?.("approving");
    const h = await burner.writeContract({
      address: JOURNAL_TOKEN_ADDRESS, abi: journalTokenAbi, functionName: "approve",
      args: [REGISTRY_ADDRESS, PUBLICATION_FEE], account: submission,
    });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }

  onStep?.("publishing");
  const txHash = await burner.writeContract({
    address: REGISTRY_ADDRESS, abi: payFeeAbi, functionName: "payPublicationFee",
    args: [BigInt(msId)], account: submission,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

/** JRT balance of an arbitrary address (used for reviewer earnings). */
export async function getJrtBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: JOURNAL_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address],
  });
}

export type WithdrawStep = "funding-gas" | "withdrawing";

/**
 * Reviewer withdrawal: the main wallet funds a little gas to the burner session
 * wallet, then the burner transfers its full JRT balance to the reviewer's main
 * wallet. Note: funding from the main wallet creates a minor on-chain link.
 */
export async function withdrawFromSession(
  sessionPrivateKey: `0x${string}`,
  onStep?: (step: WithdrawStep) => void,
): Promise<{ txHash: `0x${string}`; amount: bigint }> {
  const session = privateKeyToAccount(sessionPrivateKey);
  const { client: main, account: mainAccount } = await getWalletClient();

  const amount = await getJrtBalance(session.address);
  if (amount === 0n) throw new Error("This session wallet has no JRT to withdraw.");

  onStep?.("funding-gas");
  const ethBal = await publicClient.getBalance({ address: session.address });
  if (ethBal < GAS_FOR_WITHDRAW) {
    const h = await main.sendTransaction({
      to: session.address, value: GAS_FOR_WITHDRAW - ethBal, account: mainAccount,
    });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }

  onStep?.("withdrawing");
  const { client: burner } = sessionWalletClient(sessionPrivateKey);
  const txHash = await burner.writeContract({
    address: JOURNAL_TOKEN_ADDRESS, abi: erc20Abi, functionName: "transfer",
    args: [mainAccount, amount], account: session,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, amount };
}
