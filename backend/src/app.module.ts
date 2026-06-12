import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './infrastructure/framework/modules/auth.module';
import { ManuscriptModule } from './infrastructure/framework/modules/manuscript.module';
import { DatabaseModule } from './infrastructure/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    ManuscriptModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
