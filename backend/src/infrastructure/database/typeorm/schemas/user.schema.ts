import { EntitySchema } from 'typeorm';
import { User } from '../../../../core/domain/entities/user.entity';

export const UserSchema = new EntitySchema<User>({
  name: 'User',
  target: User,
  tableName: 'users',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    email: {
      type: String,
      unique: true,
      nullable: false,
    },
    password: {
      type: String,
      nullable: true,
    },
    walletAddress: {
      type: String,
      unique: true,
      nullable: true,
      name: 'wallet_address',
    },
  },
  indices: [
    {
      name: 'IDX_USER_EMAIL',
      columns: ['email'],
    },
  ],
});
