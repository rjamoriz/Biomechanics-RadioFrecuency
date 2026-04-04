import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  const port = process.env.GATEWAY_PORT ?? 3001;
  await app.listen(port);
  console.log(`Gateway listening on port ${port}`);
}

bootstrap();
