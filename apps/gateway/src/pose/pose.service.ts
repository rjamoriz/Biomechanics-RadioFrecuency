import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../ingestion/event-bus';
import { PoseInferenceAdapter } from './pose-inference.adapter';
import { InferredMotionFrame } from './pose.types';
import { RingBuffer } from '../ingestion/ring-buffer';
import { NormalizedPacket } from '../ingestion/event-bus';
import { Subject } from 'rxjs';

@Injectable()
export class PoseService implements OnModuleInit {
  private readonly logger = new Logger(PoseService.name);
  private readonly windowBuffer = new RingBuffer<NormalizedPacket>(50);
  private latestFrame: InferredMotionFrame | null = null;
  private readonly frames$ = new Subject<InferredMotionFrame>();

  readonly stream$ = this.frames$.asObservable();

  constructor(
    private readonly eventBus: EventBus,
    private readonly inferenceAdapter: PoseInferenceAdapter,
  ) {}

  onModuleInit() {
    let counter = 0;

    this.eventBus.packets$.subscribe(async (packet) => {
      this.windowBuffer.push(packet);
      counter++;

      // Run inference every 50 packets (~0.5s at 100 Hz)
      if (counter % 50 === 0 && this.windowBuffer.isFull) {
        const window = this.windowBuffer
          .toArray()
          .map((p) => p.amplitude);

        const frame = await this.inferenceAdapter.infer(window);
        if (frame) {
          this.latestFrame = frame;
          this.frames$.next(frame);
        }
      }
    });

    this.logger.log('Pose inference pipeline initialized');
  }

  getLatestFrame(): InferredMotionFrame | null {
    return this.latestFrame;
  }
}
