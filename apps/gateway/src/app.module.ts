import { Module } from '@nestjs/common';
import { SerialModule } from './serial/serial.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { MetricsModule } from './metrics/metrics.module';
import { PoseModule } from './pose/pose.module';
import { TreadmillModule } from './treadmill/treadmill.module';
import { WebsocketModule } from './websocket/websocket.module';
import { BackendClientModule } from './backend-client/backend-client.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    SerialModule,
    IngestionModule,
    MetricsModule,
    PoseModule,
    TreadmillModule,
    WebsocketModule,
    BackendClientModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
