// ==========================================
// APPLICATION LAYER: Business Logic / Use Cases
// ==========================================
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import type { IUserRepository } from '../../core/domain/repositories/user.repository.interface';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthenticateUserUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
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

    // Generate real JWT token
    const payload = { email: user.email, sub: user.id };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
      }
    };
  }
}
