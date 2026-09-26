import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function parseCorsOrigins(value?: string): (string | RegExp)[] {
  if (!value) return [];

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (!origin.includes('*')) return origin;

      const pattern = origin
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[a-z0-9-]+');
      return new RegExp(`^${pattern}$`);
    });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
