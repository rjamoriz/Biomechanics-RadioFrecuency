import { Module, Global } from '@nestjs/common';
import { BackendClientService } from './backend-client.service';
import { CalibrationStateService } from './calibration-state.service';

@Global()
@Module({
  providers: [BackendClientService, CalibrationStateService],
  exports: [BackendClientService, CalibrationStateService],
})
export class BackendClientModule {}
