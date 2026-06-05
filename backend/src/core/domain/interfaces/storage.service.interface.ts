export interface IStorageService {
  uploadFile(buffer: Buffer, filename: string): Promise<string>;
}
