import { Module } from '@nestjs/common';
import { TreadmillModule } from '../treadmill/treadmill.module';
import { DemoSimulatorService } from './demo-simulator.service';
import { DemoPoseGenerator } from './demo-pose-generator';
import { DemoController } from './demo.controller';

/**
 * Demo module — only imported when DEMO_MODE=true.
 * Provides the rich simulation engine, animated pose generator,
 * and REST control endpoints.
 */
@Module({
  imports: [TreadmillModule],
  controllers: [DemoController],
  providers: [DemoSimulatorService, DemoPoseGenerator],
  exports: [DemoSimulatorService, DemoPoseGenerator],
})
export class DemoModule {}
