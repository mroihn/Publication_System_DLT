import { Injectable, Inject } from '@nestjs/common';
import type { IStorageService } from '../../core/domain/interfaces/storage.service.interface';
import type { ISmartContractService } from '../../core/domain/interfaces/smart-contract.service.interface';

@Injectable()
export class SubmitManuscriptUseCase {
  constructor(
    @Inject('IStorageService') private readonly storageService: IStorageService,
    @Inject('ISmartContractService') private readonly contractService: ISmartContractService,
  ) {}

  async execute(fileBuffer: Buffer, filename: string, title: string) {
    // 1. Upload to IPFS via Pinata
    const cid = await this.storageService.uploadFile(fileBuffer, filename);
    
    // 2. Submit to Smart Contract
    const txHash = await this.contractService.submitManuscript(cid, title);
    
    console.log(`Manuscript submitted with CID: ${cid} and txHash: ${txHash}`);
    return { cid, txHash, status: 'CHECKING' };
  }
}
