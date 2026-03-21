import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TaxCalculationsModule } from './modules/tax-calculations.module';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TaxCalculationsModule,
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
