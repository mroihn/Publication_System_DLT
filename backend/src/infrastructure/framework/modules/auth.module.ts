import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from '../controllers/auth.controller';
import { UserController } from '../controllers/user.controller';
import { AuthenticateUserUseCase } from '../../../use-cases/auth/authenticate-user.use-case';
import { RegisterUserUseCase } from '../../../use-cases/auth/register-user.use-case';
import { BindMetaMaskWalletUseCase } from '../../../use-cases/user/bind-metamask-wallet.use-case';
import { JwtStrategy } from '../guards/jwt.strategy';
import { InMemoryUserRepository } from '../../database/memory/in-memory-user.repository';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: 'super-secret-jwt-key', // In production, use environment variable
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController, UserController],
  providers: [
    AuthenticateUserUseCase,
    RegisterUserUseCase,
    BindMetaMaskWalletUseCase,
    JwtStrategy,
    {
      provide: 'IUserRepository',
      useClass: InMemoryUserRepository, // Use in-memory for now to satisfy full flow
    },
  ],
})
export class AuthModule {}
