import { Injectable, Logger } from '@nestjs/common';
import { ManualInputAdapter } from './manual-input.adapter';
import { MockProtocolAdapter } from './mock-protocol.adapter';
import { TreadmillState, ProtocolStageConfig } from './treadmill.types';
import { Subject } from 'rxjs';

@Injectable()
export class TreadmillService {
  private readonly logger = new Logger(TreadmillService.name);
  private readonly state$ = new Subject<TreadmillState>();
  private currentState: TreadmillState;

  readonly treadmillState$ = this.state$.asObservable();

  constructor(
    private readonly manualInput: ManualInputAdapter,
    private readonly mockProtocol: MockProtocolAdapter,
  ) {
    this.currentState = this.manualInput.getCurrent();

    this.mockProtocol.setStageChangeCallback((s) => {
      this.currentState = s;
      this.state$.next(s);
    });
  }

  manualUpdate(speedKph: number, inclinePercent: number): TreadmillState {
    const state = this.manualInput.update(speedKph, inclinePercent);
    this.currentState = state;
    this.state$.next(state);
    return state;
  }

  startProtocol(name: string, stages: ProtocolStageConfig[]) {
    this.mockProtocol.startProtocol(name, stages);
    this.logger.log(`Started protocol: ${name}`);
  }

  stopProtocol() {
    this.mockProtocol.stopProtocol();
    this.currentState = this.manualInput.getCurrent();
    this.state$.next(this.currentState);
    this.logger.log('Protocol stopped');
  }

  getCurrent(): TreadmillState {
    return this.currentState;
  }
}
