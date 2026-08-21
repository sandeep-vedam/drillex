import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

function assertProdConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => !process.env[k] || process.env[k]!.length < 32 || process.env[k]!.startsWith('change-me'));
  if (weak.length) throw new Error(`Refusing to start: weak/missing secrets ${weak.join(', ')} (need ≥32 random chars)`);
  if (process.env.STORAGE_DRIVER !== 's3') console.warn('[config] STORAGE_DRIVER is not s3 — local disk storage is not suitable for production');
}

async function bootstrap() {
  assertProdConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true, rawBody: false });
  app.useBodyParser('json', { limit: '12mb' });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useStaticAssets(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  const origins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins?.length ? origins : true, credentials: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Drillex Ops API').setVersion('0.1').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc);
  await app.listen(process.env.PORT ?? 4000);
  console.log(`API on http://localhost:${process.env.PORT ?? 4000}/api/v1  (docs: /api/docs)`);
}
bootstrap();
