import { Injectable, Inject } from '@nestjs/common';
import type { IUserRepository } from '../../core/domain/repositories/user.repository.interface';

@Injectable()
export class LinkWalletUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(userId: string, walletAddress: string): Promise<void> {
    const formattedAddress = walletAddress.toLowerCase();
    
    // Check if wallet is already bound to another user
    const existingBinding = await this.userRepository.findByWalletAddress(formattedAddress);
    if (existingBinding && existingBinding.id !== userId) {
      throw new Error('Wallet address is already linked to another account.');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    user.walletAddress = formattedAddress;
    await this.userRepository.save(user);
  }
}
