import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import { EventBus, NormalizedPacket } from '../ingestion/event-bus';
import { RingBuffer } from '../ingestion/ring-buffer';
import { PoseInferenceAdapter } from './pose-inference.adapter';
import { InferredMotionFrame } from './pose.types';

const POSE_WINDOW_SIZE = Number(process.env.POSE_WINDOW_SIZE ?? 64);

@Injectable()
export class PoseService implements OnModuleInit {
  private readonly logger = new Logger(PoseService.name);
  private readonly windowBuffer = new RingBuffer<NormalizedPacket>(POSE_WINDOW_SIZE);
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

      if (counter % 5 === 0) {
        const window = this.windowBuffer.toArray();
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
