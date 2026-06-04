// ==========================================
// APPLICATION LAYER: Business Logic / Use Cases
// ==========================================
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import type { IUserRepository } from '../../core/domain/repositories/user.repository.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthenticateUserUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(email: string, plainPassword: string): Promise<{ accessToken: string, user: any }> {
    const formattedEmail = email.toLowerCase();
    
    const user = await this.userRepository.findByEmail(formattedEmail);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isMatch = await bcrypt.compare(plainPassword, user.password || '');
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // Mock token generation (In a real app, use @nestjs/jwt JwtService)
    const mockToken = Buffer.from(`${user.id}:${new Date().getTime()}`).toString('base64');

    return {
      accessToken: mockToken,
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
      }
    };
  }
}
