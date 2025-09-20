import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, VersioningType } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);

  const logger = new Logger('Bootstrap');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const clientUrls = configService.get<string>('CLIENT_URLS');
  const origins = clientUrls ? clientUrls.split(',').map(url => url.trim()) : [];

  // Enable CORS for development and production
  app.enableCors({
    origin: origins.length > 0 ? origins : true, // Allow all origins if CLIENT_URLS not set
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cookie',
    ],
    exposedHeaders: ['Set-Cookie'],
  });

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  app.use(cookieParser());

  const config = new DocumentBuilder()
    .setTitle('Rosedesvins API')
    .setDescription('The Rosedesvins API description')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      tagsSorter: 'alpha',
    },
  });

  const port = configService.get<number>('PORT') || 5001;

  await app.listen(port);

  logger.log(`🚀 Server started at http://localhost:${port}`);
}
bootstrap();
