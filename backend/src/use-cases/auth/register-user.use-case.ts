// ==========================================
// APPLICATION LAYER: Business Logic / Use Cases
// ==========================================
import { Injectable, Inject, ConflictException } from '@nestjs/common';
import type { IUserRepository } from '../../core/domain/repositories/user.repository.interface';
import { User } from '../../core/domain/entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(email: string, plainPassword: string): Promise<User> {
    const formattedEmail = email.toLowerCase();
    
    // 1. Validate if user exists
    const existing = await this.userRepository.findByEmail(formattedEmail);
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    // 2. Hash password securely
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

    // 3. Create pure domain entity and save via abstract repository port
    const newUser = new User({ email: formattedEmail, password: hashedPassword });
    return this.userRepository.save(newUser);
  }
}
