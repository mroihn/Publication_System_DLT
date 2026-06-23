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

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "";

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

export async function getWalletClient() {
  if (!window.ethereum) throw new Error("MetaMask is not installed");
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];
  const account = accounts[0] as `0x${string}`;
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
  chainId: 11155111, // Sepolia
  verifyingContract: REGISTRY_ADDRESS,
} as const;
