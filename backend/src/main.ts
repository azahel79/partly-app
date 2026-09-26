import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const trustProxy = configService.get<number>('trustProxy') ?? 0;
  if (trustProxy > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  }

  app.use(helmet());
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: configService.get<string>('frontendUrl'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  if (configService.get<boolean>('swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Vakeva API')
      .setDescription('API de Vakeva para grupos, pagos, comisiones, proveedores y soporte.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Vakeva API escuchando en http://localhost:${port}/api`);
}

bootstrap();
