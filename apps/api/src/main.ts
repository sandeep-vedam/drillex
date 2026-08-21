import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api/v1');
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Drillex Ops API').setVersion('0.1').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc);
  await app.listen(process.env.PORT ?? 4000);
  console.log(`API on http://localhost:${process.env.PORT ?? 4000}/api/v1  (docs: /api/docs)`);
}
bootstrap();
