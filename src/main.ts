import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    // Comma-separated list, e.g. "https://dev.example.com,http://localhost:3000"
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
