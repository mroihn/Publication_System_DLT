import { Injectable } from '@nestjs/common';
import { IUserRepository } from '../../../core/domain/repositories/user.repository.interface';
import { User } from '../../../core/domain/entities/user.entity';

@Injectable()
export class InMemoryUserRepository implements IUserRepository {
  private users: User[] = [];

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find(u => u.email === email) || null;
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.users.find(u => u.walletAddress === walletAddress) || null;
  }

  async save(user: User): Promise<User> {
    const existingIndex = this.users.findIndex(u => u.id === user.id);
    if (existingIndex > -1) {
      this.users[existingIndex] = user;
    } else {
      // If no ID is provided (e.g. new user), we generate a mock one
      if (!user.id) {
        user.id = Math.random().toString(36).substring(7);
      }
      this.users.push(user);
    }
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }
}
