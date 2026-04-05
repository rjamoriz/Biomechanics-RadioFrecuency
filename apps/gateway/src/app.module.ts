import { Module } from '@nestjs/common';
import { SerialModule } from './serial/serial.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { MetricsModule } from './metrics/metrics.module';
import { SignalModule } from './signal/signal.module';
import { VitalSignsModule } from './vital-signs/vital-signs.module';
import { SensingModule } from './sensing/sensing.module';
import { PoseModule } from './pose/pose.module';
import { TreadmillModule } from './treadmill/treadmill.module';
import { WebsocketModule } from './websocket/websocket.module';
import { BackendClientModule } from './backend-client/backend-client.module';
import { InferenceModule } from './inference/inference.module';
import { HealthController } from './health/health.controller';
import { DemoModule } from './demo/demo.module';
import { AutonomousModule } from './autonomous/autonomous.module';
import { RecordingModule } from './recording/recording.module';

const isDemoMode = process.env.DEMO_MODE === 'true';

@Module({
  imports: [
    SerialModule,
    IngestionModule,
    MetricsModule,
    SignalModule,
    VitalSignsModule,
    SensingModule,
    PoseModule,
    TreadmillModule,
    WebsocketModule,
    BackendClientModule,
    InferenceModule,
    AutonomousModule,
    RecordingModule,
    ...(isDemoMode ? [DemoModule] : []),
  ],
  controllers: [HealthController],
})
export class AppModule {}
