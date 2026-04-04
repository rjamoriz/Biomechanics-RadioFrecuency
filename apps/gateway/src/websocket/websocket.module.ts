import { Module } from '@nestjs/common';
import { LiveGateway } from './websocket.gateway';
import { MetricsModule } from '../metrics/metrics.module';
import { PoseModule } from '../pose/pose.module';
import { TreadmillModule } from '../treadmill/treadmill.module';

@Module({
  imports: [MetricsModule, PoseModule, TreadmillModule],
  providers: [LiveGateway],
})
export class WebsocketModule {}
