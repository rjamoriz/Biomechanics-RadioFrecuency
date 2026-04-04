import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RealtimeMetricsService } from '../metrics/realtime-metrics.service';
import { PoseService } from '../pose/pose.service';
import { TreadmillService } from '../treadmill/treadmill.service';
import { VitalSignsService } from '../vital-signs/vital-signs.service';
import { SYNTHETIC_VIEW_DISCLAIMER } from '../pose/pose.types';
import {
  WsRealtimeMetrics,
  WsInferredMotionFrame,
  WsConnectionAck,
} from './websocket.dto';

@WsGateway({
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' },
  namespace: '/live',
})
export class LiveGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(LiveGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly metricsService: RealtimeMetricsService,
    private readonly poseService: PoseService,
    private readonly treadmillService: TreadmillService,
    private readonly vitalSignsService: VitalSignsService,
  ) {}

  afterInit() {
    // Stream realtime metrics to all connected clients
    this.metricsService.stream$.subscribe((metrics) => {
      const treadmill = this.treadmillService.getCurrent();

      const payload: WsRealtimeMetrics = {
        event: 'metrics',
        timestamp: Date.now(),
        estimatedCadence: metrics.estimatedCadence,
        stepIntervalEstimate: metrics.stepIntervalEstimate,
        symmetryProxy: metrics.symmetryProxy,
        contactTimeProxy: metrics.contactTimeProxy,
        flightTimeProxy: metrics.flightTimeProxy,
        fatigueDriftScore: metrics.fatigueDriftScore,
        signalQualityScore: metrics.signalQualityScore,
        metricConfidence: metrics.metricConfidence,
        confidenceLevel: metrics.confidenceLevel,
        validationStatus: metrics.validationStatus,
        speedKmh: treadmill.speedKph,
        inclinePercent: treadmill.inclinePercent,
      };

      this.server.emit('metrics', payload);
    });

    // Stream inferred motion frames
    this.poseService.stream$.subscribe((frame) => {
      const payload: WsInferredMotionFrame = {
        event: 'inferred-motion',
        timestamp: frame.timestamp,
        keypoints2D: frame.keypoints2D?.map((kp) => ({
          name: kp.name,
          x: kp.x,
          y: kp.y,
          confidence: kp.confidence,
        })) ?? [],
        modelVersion: frame.modelVersion,
        experimental: true,
        confidence: frame.confidence,
        confidenceLevel: frame.confidenceLevel,
        signalQualityScore: frame.signalQualityScore,
        validationStatus: frame.validationStatus ?? 'experimental',
        disclaimer: SYNTHETIC_VIEW_DISCLAIMER,
      };

      this.server.emit('inferred-motion', payload);
    });

    // Stream vital signs updates at ~1 Hz
    setInterval(() => {
      const vitals = this.vitalSignsService.getVitalSigns();
      if (vitals.breathing || vitals.heartRate) {
        this.server.emit('vital-signs', {
          event: 'vital-signs',
          timestamp: Date.now(),
          breathing: vitals.breathing,
          heartRate: vitals.heartRate,
          bufferFill: vitals.bufferFill,
          disclaimer:
            'Estimated proxy metrics from Wi-Fi CSI. Not clinical-grade.',
        });
      }
    }, 1000);

    this.logger.log('WebSocket /live gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    const ack: WsConnectionAck = {
      event: 'connection-ack',
      gatewayVersion: '0.1.0',
      demoMode: process.env.DEMO_MODE === 'true',
      timestamp: Date.now(),
    };
    client.emit('connection-ack', ack);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('set-treadmill')
  handleSetTreadmill(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { speedKph: number; inclinePercent: number },
  ) {
    const state = this.treadmillService.manualUpdate(
      data.speedKph,
      data.inclinePercent,
    );
    this.server.emit('treadmill-state', state);
    return { status: 'ok', state };
  }

  @SubscribeMessage('start-protocol')
  handleStartProtocol(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      name: string;
      stages: Array<{
        orderIndex: number;
        label: string;
        durationSeconds: number;
        speedKph: number;
        inclinePercent: number;
      }>;
    },
  ) {
    this.treadmillService.startProtocol(data.name, data.stages);
    return { status: 'ok', protocol: data.name };
  }

  @SubscribeMessage('stop-protocol')
  handleStopProtocol() {
    this.treadmillService.stopProtocol();
    return { status: 'ok' };
  }
}
