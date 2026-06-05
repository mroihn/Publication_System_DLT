// ==========================================
// INFRASTRUCTURE LAYER: Controllers / Routing
// ==========================================
import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RegisterUserUseCase } from '../../../use-cases/auth/register-user.use-case';
import { AuthenticateUserUseCase } from '../../../use-cases/auth/authenticate-user.use-case';

@Controller('api/v1')
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly authenticateUserUseCase: AuthenticateUserUseCase,
  ) {}

  @Post('auth/register')
  async register(@Body() body: any) {
    // Delegates to the pure Use Case layer
    const user = await this.registerUserUseCase.execute(body.email, body.password);
    return { message: 'User registered successfully', user: { id: user.id, email: user.email } };
  }

  @Post('auth/login')
  async login(@Body() body: any) {
    // Delegates to the pure Use Case layer
    const result = await this.authenticateUserUseCase.execute(body.email, body.password);
    return result; // Returns { accessToken, user }
  }

  @Get('health')
  healthCheck() {
    // Simple health check endpoint
    return { status: 'OK', timestamp: new Date().toISOString() };
  }

  @Post('auth/logout')
  logout() {
    // JWT is stateless on the server side unless we use a blacklist, 
    // so we just return success to confirm logout action.
    return { message: 'Logged out successfully' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('users/me')
  getProfile(@Request() req: any) {
    // The req.user is populated by the JwtStrategy
    return req.user;
  }
}
