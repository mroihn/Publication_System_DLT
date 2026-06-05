export interface ISmartContractService {
  submitManuscript(cid: string, title: string): Promise<string>;
}
