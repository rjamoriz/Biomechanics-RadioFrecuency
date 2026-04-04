import { Injectable, Logger } from '@nestjs/common';
import { ProtocolRunState, ProtocolStageConfig, TreadmillState } from './treadmill.types';

/**
 * Mock protocol adapter — simulates running through a treadmill protocol
 * with timed stage transitions. Used for demo mode and testing.
 */
@Injectable()
export class MockProtocolAdapter {
  private readonly logger = new Logger(MockProtocolAdapter.name);
  private runState: ProtocolRunState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onStageChange: ((state: TreadmillState) => void) | null = null;

  setStageChangeCallback(cb: (state: TreadmillState) => void) {
    this.onStageChange = cb;
  }

  startProtocol(name: string, stages: ProtocolStageConfig[]) {
    if (stages.length === 0) {
      this.logger.warn('Cannot start protocol with no stages');
      return;
    }

    this.stopProtocol();

    this.runState = {
      protocolName: name,
      stages,
      currentStageIndex: 0,
      stageStartedAt: Date.now(),
      isActive: true,
    };

    this.logger.log(`Protocol "${name}" started — ${stages.length} stages`);
    this.emitCurrentStage();
    this.startTimer();
  }

  stopProtocol() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.runState = null;
  }

  getRunState(): ProtocolRunState | null {
    return this.runState ? { ...this.runState } : null;
  }

  private startTimer() {
    this.timer = setInterval(() => {
      if (!this.runState?.isActive) return;

      const stage = this.runState.stages[this.runState.currentStageIndex];
      const elapsed = (Date.now() - this.runState.stageStartedAt) / 1000;

      if (elapsed >= stage.durationSeconds) {
        const nextIndex = this.runState.currentStageIndex + 1;
        if (nextIndex >= this.runState.stages.length) {
          this.logger.log(`Protocol "${this.runState.protocolName}" completed`);
          this.runState.isActive = false;
          return;
        }

        this.runState.currentStageIndex = nextIndex;
        this.runState.stageStartedAt = Date.now();
        this.logger.log(
          `Stage ${nextIndex + 1}/${this.runState.stages.length}: "${this.runState.stages[nextIndex].label}"`,
        );
        this.emitCurrentStage();
      }
    }, 1000);
  }

  private emitCurrentStage() {
    if (!this.runState || !this.onStageChange) return;
    const stage = this.runState.stages[this.runState.currentStageIndex];
    this.onStageChange({
      speedKph: stage.speedKph,
      inclinePercent: stage.inclinePercent,
      isRunning: stage.speedKph > 0,
      source: 'protocol',
      updatedAt: Date.now(),
    });
  }
}
