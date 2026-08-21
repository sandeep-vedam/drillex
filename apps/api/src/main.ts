import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true, rawBody: false });
  app.useBodyParser('json', { limit: '12mb' });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useStaticAssets(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api/v1');
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Drillex Ops API').setVersion('0.1').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc);
  await app.listen(process.env.PORT ?? 4000);
  console.log(`API on http://localhost:${process.env.PORT ?? 4000}/api/v1  (docs: /api/docs)`);
}
bootstrap();
