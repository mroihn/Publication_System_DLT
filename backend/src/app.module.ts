import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './infrastructure/framework/modules/auth.module';
import { ManuscriptModule } from './infrastructure/framework/modules/manuscript.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ManuscriptModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
