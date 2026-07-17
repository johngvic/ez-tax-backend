import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Get,
  UseGuards,
  Req,
  Query,
  Body,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
  async getJobs(
    @Req() request: Request,
    @Query('limit') limit?: string,
    @Query('exclusiveStartKey') exclusiveStartKey?: string,
  ) {
    const userId = (request as any).user.sub;
    const parsedLimit = limit ? Number(limit) : 10;

    if (limit && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
      throw new BadRequestException('limit must be a positive integer');
    }

    return await this.taxCalculationsService.getJobs(
      userId,
      parsedLimit,
      exclusiveStartKey,
    );
  }

  @IsAdmin()
  @UseGuards(JwtAuthGuard)
  @Post('exclusao-pis-cofins')
  @UseInterceptors(FilesInterceptor('files', 5, { storage: memoryStorage() }))
  async startExclusaoPisCofinsJob(
    @Req() request: Request,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('styled') isStyled: string,
  ) {
    if (!files || files.length === 0) throw new BadRequestException('At least one file is required');
    if (files.length > 5) throw new BadRequestException('Maximum 5 files allowed');
    
    for (const file of files) {
      if (
        !file.originalname ||
        !file.originalname.toLowerCase().endsWith('.xlsx')
      ) {
        throw new BadRequestException('Only .xlsx files are allowed');
      }
    }

    const userId = (request as any).user.sub;
    const styled = isStyled === 'true';

    return await this.taxCalculationsService.startExclusaoPisCofinsJob(
      userId,
      files,
      styled
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
