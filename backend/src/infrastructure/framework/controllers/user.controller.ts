import { Controller, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { LinkWalletUseCase } from '../../../use-cases/user/link-wallet.use-case';
// Note: JwtAuthGuard will be implemented in infrastructure/auth, but mocked here for compilation structure
// import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('api/v1/users')
export class UserController {
  constructor(private readonly linkWalletUseCase: LinkWalletUseCase) {}

  // @UseGuards(JwtAuthGuard)
  @Patch('wallet')
  async linkWallet(@Request() req, @Body('walletAddress') walletAddress: string) {
    // const userId = req.user.id; // Extracted by JWT Strategy
    const userId = "temp-id"; // Placeholder until auth guard is ready
    await this.linkWalletUseCase.execute(userId, walletAddress);
    return { message: 'Wallet successfully linked.' };
  }
}
