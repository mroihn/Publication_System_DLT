import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Import entities
import { UserEntity } from './typeorm/entities/user.entity';
import { ManuscriptEntity } from './typeorm/entities/manuscript.entity';
import { ReviewEntity } from './typeorm/entities/review.entity';
import { PublicationEntity } from './typeorm/entities/publication.entity';
import { CommentEntity } from './typeorm/entities/comment.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USER', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'publish_db'),
        entities: [
          UserEntity,
          ManuscriptEntity,
          ReviewEntity,
          PublicationEntity,
          CommentEntity
        ],
        migrations: [__dirname + '/typeorm/migrations/*{.ts,.js}'],
        migrationsRun: true, // Automatically run migrations on app startup
        synchronize: false, // In production, we use migrations
      }),
    }),
  ],
})
export class DatabaseModule {}
