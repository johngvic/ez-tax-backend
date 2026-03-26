import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TaxCalculationsService } from 'src/service/tax-calculations.service';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/common/guards/JwtAuthGuard';
import { IsAdmin } from 'src/common/guards/is-admin.decorator';

@Controller('tax-calculations')
export class TaxCalculationsController {
  constructor(
    private readonly taxCalculationsService: TaxCalculationsService,
  ) {}

  @IsAdmin()
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getJobStatus() {
    return { status: 'Job is running' };
  }

  @IsAdmin()
  @UseGuards(JwtAuthGuard)
  @Get('exclusao-pis-cofins')
  async getJobs(@Req() request: Request) {
    const userId = (request as any).user.sub;
    return await this.taxCalculationsService.getJobs(userId);
  }

  @IsAdmin()
  @UseGuards(JwtAuthGuard)
  @Post('exclusao-pis-cofins')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async startExclusaoPisCofinsJob(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (
      !file.originalname ||
      !file.originalname.toLowerCase().endsWith('.xlsx')
    ) {
      throw new BadRequestException('Only .xlsx files are allowed');
    }

    const userId = (request as any).user.sub;
    return await this.taxCalculationsService.startExclusaoPisCofinsJob(
      userId,
      file,
    );
  }

  @IsAdmin()
  @UseGuards(JwtAuthGuard)
  @Get('exclusao-pis-cofins/:calculationId/download')
  async downloadJobResult(@Req() request: Request) {
    const userId = (request as any).user.sub;
    const calculationId = (request as any).params.calculationId;
    return await this.taxCalculationsService.downloadJobResult(userId, calculationId);
  }
}
