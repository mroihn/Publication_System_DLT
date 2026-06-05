import { Controller, Post, UseInterceptors, UploadedFile, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SubmitManuscriptUseCase } from '../../../use-cases/manuscript/submit-manuscript.use-case';

@Controller('manuscripts')
export class ManuscriptController {
  constructor(private readonly submitUseCase: SubmitManuscriptUseCase) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadManuscript(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
  ) {
    if (!file) {
      throw new Error('File is required');
    }
    return this.submitUseCase.execute(file.buffer, file.originalname, title);
  }
}
