import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
