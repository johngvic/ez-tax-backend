import { Module } from '@nestjs/common';
import { TaxCalculationsController } from 'src/controller/tax-calculations.controller';
import { TaxCalculationsService } from 'src/service/tax-calculations.service';

@Module({
  imports: [],
  controllers: [TaxCalculationsController],
  providers: [TaxCalculationsService],
  exports: [TaxCalculationsService],
})
export class TaxCalculationsModule {}
