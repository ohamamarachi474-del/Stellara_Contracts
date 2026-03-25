import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AsyncContextService } from './services/async-context.service';
import { StructuredLoggerService } from './services/structured-logger.service';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { ClsMiddleware } from './middleware/cls-middleware';
import { LoggingModuleOptions } from './interfaces/logging-module-options.interface';

@Global()
@Module({})
export class LoggingModule {
  static forRoot(options: LoggingModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      AsyncContextService,
      ClsMiddleware,
      {
        provide: 'LOGGER_SERVICE',
        useClass: options.loggerService || StructuredLoggerService,
      },
      {
        provide: 'LOGGING_OPTIONS',
        useValue: options,
      },
      {
        provide: StructuredLoggerService,
        useFactory: (configService: ConfigService, asyncContext: AsyncContextService) => {
          return new StructuredLoggerService(configService, asyncContext, options.defaultContext);
        },
        inject: [ConfigService, AsyncContextService],
      },
      CorrelationIdMiddleware,
    ];

    return {
      module: LoggingModule,
      imports: [ConfigModule],
      providers,
      exports: [
        AsyncContextService,
        StructuredLoggerService,
        CorrelationIdMiddleware,
        'LOGGER_SERVICE',
        ClsMiddleware,
      ],
      global: true,
    };
  }

  static forRootAsync(options: {
    useFactory: (...args: any[]) => Promise<LoggingModuleOptions> | LoggingModuleOptions;
    inject?: any[];
  }): DynamicModule {
    const providers: Provider[] = [
      AsyncContextService,
      ClsMiddleware,
      {
        provide: 'LOGGER_SERVICE',
        useClass: StructuredLoggerService,
      },
      {
        provide: 'LOGGING_OPTIONS',
        useFactory: options.useFactory,
        inject: options.inject || [],
      },
      {
        provide: StructuredLoggerService,
        useFactory: (configService: ConfigService, asyncContext: AsyncContextService) => {
          return new StructuredLoggerService(configService, asyncContext);
        },
        inject: [ConfigService, AsyncContextService],
      },
      CorrelationIdMiddleware,
    ];

    return {
      module: LoggingModule,
      imports: [ConfigModule],
      providers,
      exports: [
        AsyncContextService,
        StructuredLoggerService,
        CorrelationIdMiddleware,
        'LOGGER_SERVICE',
        ClsMiddleware,
      ],
      global: true,
    };
  }
}
