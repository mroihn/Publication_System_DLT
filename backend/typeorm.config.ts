import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load .env variables manually for CLI
config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'publish_db',
  entities: ['src/infrastructure/database/typeorm/entities/*.ts'],
  migrations: ['src/infrastructure/database/typeorm/migrations/*.ts'],
  synchronize: false,
});
