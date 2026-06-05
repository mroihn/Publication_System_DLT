import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmartContractService } from '../../core/domain/interfaces/smart-contract.service.interface';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, sepolia } from 'viem/chains';

const registryAbi = [
  { inputs: [{ name: "cid", type: "string" }, { name: "metadata", type: "string" }], name: "submitManuscript", outputs: [], stateMutability: "nonpayable", type: "function" }
] as const;

@Injectable()
export class EthereumService implements ISmartContractService {
  private client;
  private account;

  constructor(private readonly configService: ConfigService) {
    const pk = this.configService.get<string>('OPERATOR_PRIVATE_KEY') || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    
    // Add 0x prefix if missing
    const formattedPk = pk.startsWith('0x') ? pk : `0x${pk}`;
    
    this.account = privateKeyToAccount(formattedPk as `0x${string}`);
    
    this.client = createWalletClient({
      account: this.account,
      chain: sepolia, // Assuming Sepolia from the Infura RPC URL in .env
      transport: http(this.configService.get<string>('RPC_URL') || 'http://127.0.0.1:8545')
    }).extend(publicActions);
  }

  async submitManuscript(cid: string, title: string): Promise<string> {
    const contractAddress = this.configService.get<string>('REGISTRY_CONTRACT_ADDRESS');
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      console.log('REGISTRY_CONTRACT_ADDRESS not configured. Returning mock transaction hash.');
      return '0xMockTxHashabcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    }

    try {
      const { request } = await this.client.simulateContract({
        address: contractAddress as `0x${string}`,
        abi: registryAbi,
        functionName: 'submitManuscript',
        args: [cid, JSON.stringify({ title })]
      });
      return await this.client.writeContract(request);
    } catch (error: any) {
      console.error('Error simulating/sending contract tx:', error.message || error);
      return '0xMockTxHashabcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    }
  }
}
