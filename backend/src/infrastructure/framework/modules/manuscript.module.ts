import { Module } from '@nestjs/common';
import { ManuscriptController } from '../controllers/manuscript.controller';
import { SubmitManuscriptUseCase } from '../../../use-cases/manuscript/submit-manuscript.use-case';
import { PinataService } from '../../external/pinata.service';
import { EthereumService } from '../../external/ethereum.service';

@Module({
  controllers: [ManuscriptController],
  providers: [
    SubmitManuscriptUseCase,
    {
      provide: 'IStorageService',
      useClass: PinataService,
    },
    {
      provide: 'ISmartContractService',
      useClass: EthereumService,
    },
  ],
})
export class ManuscriptModule {}
