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
  Param,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TaxCalculationsService } from 'src/service/tax-calculations.service';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/common/guards/JwtAuthGuard';
import { IsAdmin } from 'src/common/guards/is-admin.decorator';
import { TaxCalculationType } from 'src/model/tax-calculations.model';

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
  @Get()
  async getTaxCalculations(
    @Req() request: Request,
    @Query('limit') limit?: string,
    @Query('exclusiveStartKey') exclusiveStartKey?: string,
  ) {
    const userId = (request as any).user.sub;
    const parsedLimit = limit ? Number(limit) : 10;

    if (limit && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
      throw new BadRequestException('limit must be a positive integer');
    }

    return await this.taxCalculationsService.getTaxCalculations(
      userId,
      parsedLimit,
      exclusiveStartKey,
    );
  }

  @IsAdmin()
  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(FilesInterceptor('files', 5, { storage: memoryStorage() }))
  async runTaxCalculation(
    @Req() request: Request,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('styled') isStyled: string,
    @Body('calculationType') calculationType: string,
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

    return await this.taxCalculationsService.runTaxCalculation(
      userId,
      files,
      styled,
      calculationType as TaxCalculationType
    );
  }

  @IsAdmin()
  @UseGuards(JwtAuthGuard)
  @Get(':calculationId/download')
  async downloadTaxCalculation(
    @Req() request: Request,
    @Param('calculationId') calculationId: string,
    @Query('calculationType') calculationType: TaxCalculationType,
  ) {
    const userId = (request as any).user.sub;
    return await this.taxCalculationsService.downloadTaxCalculation(
      userId, calculationId, calculationType
    );
  }
}
