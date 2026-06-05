import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from '../../core/domain/interfaces/storage.service.interface';
import axios from 'axios';
import FormData from 'form-data';

@Injectable()
export class PinataService implements IStorageService {
  constructor(private readonly configService: ConfigService) {}

  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    const jwt = this.configService.get<string>('PINATA_JWT');
    if (!jwt || jwt === 'your_pinata_jwt_token_here') {
      console.log('PINATA_JWT not configured. Returning mock CID.');
      return 'QmMockHash1234567890abcdef1234567890abcdef123';
    }

    try {
      const formData = new FormData();
      formData.append('file', buffer, { filename });

      const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${jwt}`,
        },
      });
      return res.data.IpfsHash;
    } catch (error: any) {
      console.error('Error uploading to Pinata:', error.message || error);
      // Fallback/mock for local testing if Pinata is not configured
      return 'QmMockHash1234567890abcdef1234567890abcdef123';
    }
  }
}
