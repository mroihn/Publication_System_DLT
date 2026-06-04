export class User {
  id: string;
  email: string;
  password?: string;
  walletAddress?: string | null;

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}
