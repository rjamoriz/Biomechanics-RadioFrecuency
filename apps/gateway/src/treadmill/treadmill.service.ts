import { Injectable, Logger } from '@nestjs/common';
import { ManualInputAdapter } from './manual-input.adapter';
import { MockProtocolAdapter } from './mock-protocol.adapter';
import { TreadmillState, ProtocolStageConfig } from './treadmill.types';
import { Subject } from 'rxjs';

@Injectable()
export class TreadmillService {
  private readonly logger = new Logger(TreadmillService.name);
  private readonly state$ = new Subject<TreadmillState>();

  readonly treadmillState$ = this.state$.asObservable();

  constructor(
    private readonly manualInput: ManualInputAdapter,
    private readonly mockProtocol: MockProtocolAdapter,
  ) {
    this.mockProtocol.setStageChangeCallback((s) => {
      this.state$.next(s);
    });
  }

  manualUpdate(speedKph: number, inclinePercent: number): TreadmillState {
    const state = this.manualInput.update(speedKph, inclinePercent);
    this.state$.next(state);
    return state;
  }

  startProtocol(name: string, stages: ProtocolStageConfig[]) {
    this.mockProtocol.startProtocol(name, stages);
    this.logger.log(`Started protocol: ${name}`);
  }

  stopProtocol() {
    this.mockProtocol.stopProtocol();
    this.logger.log('Protocol stopped');
  }

  getCurrent(): TreadmillState {
    return this.manualInput.getCurrent();
  }
}
