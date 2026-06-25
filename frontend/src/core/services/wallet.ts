import { createPublicClient, createWalletClient, custom, http } from "viem";
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
