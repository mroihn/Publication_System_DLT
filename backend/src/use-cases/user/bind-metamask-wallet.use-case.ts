import { Injectable, Inject, BadRequestException, ConflictException } from '@nestjs/common';
import type { IUserRepository } from '../../core/domain/repositories/user.repository.interface';

@Injectable()
export class BindMetaMaskWalletUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(userId: string, walletAddress: string): Promise<void> {
    if (!walletAddress || walletAddress.length !== 42) {
      throw new BadRequestException('Invalid Ethereum wallet address length.');
    }

    const formattedAddress = walletAddress.toLowerCase();
    
    // Defensive Check: Is wallet already used by someone else?
    const existingBinding = await this.userRepository.findByWalletAddress(formattedAddress);
    if (existingBinding && existingBinding.id !== userId) {
      throw new ConflictException('Wallet address is already bound to another account.');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found.');
    }

    user.walletAddress = formattedAddress;
    await this.userRepository.save(user);
  }
}
