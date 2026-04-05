import { Module } from '@nestjs/common';
import { LiveGateway } from './websocket.gateway';
import { MetricsModule } from '../metrics/metrics.module';
import { PoseModule } from '../pose/pose.module';
import { TreadmillModule } from '../treadmill/treadmill.module';
import { VitalSignsModule } from '../vital-signs/vital-signs.module';
import { AutonomousModule } from '../autonomous/autonomous.module';
import { RecordingModule } from '../recording/recording.module';

const isDemoMode = process.env.DEMO_MODE === 'true';

@Module({
  imports: [
    MetricsModule,
    PoseModule,
    TreadmillModule,
    VitalSignsModule,
    AutonomousModule,
    RecordingModule,
    ...(isDemoMode ? [require('../demo/demo.module').DemoModule] : []),
  ],
  providers: [LiveGateway],
})
export class WebsocketModule {}
