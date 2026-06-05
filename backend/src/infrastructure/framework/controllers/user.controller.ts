import { Controller, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BindMetaMaskWalletUseCase } from '../../../use-cases/user/bind-metamask-wallet.use-case';

@Controller('api/v1/users')
export class UserController {
  constructor(private readonly bindWalletUseCase: BindMetaMaskWalletUseCase) {}

  @UseGuards(AuthGuard('jwt'))
  @Patch('wallet-bind')
  async linkWallet(@Request() req: any, @Body('walletAddress') walletAddress: string) {
    const userId = req.user.id; // Extracted by JWT Strategy
    await this.bindWalletUseCase.execute(userId, walletAddress);
    return { message: 'Wallet successfully linked.' };
  }
}
