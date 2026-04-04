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
import { Logger, Optional, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RealtimeMetricsService } from '../metrics/realtime-metrics.service';
import { PoseService } from '../pose/pose.service';
import { TreadmillService } from '../treadmill/treadmill.service';
import { VitalSignsService } from '../vital-signs/vital-signs.service';
import { SYNTHETIC_VIEW_DISCLAIMER } from '../pose/pose.types';
import { DemoSimulatorService } from '../demo/demo-simulator.service';
import {
  ATHLETE_PROFILES,
  DEMO_PROTOCOLS,
  SignalNoiseLevel,
} from '../demo/demo-simulator.types';
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
  private demoStateInterval: ReturnType<typeof setInterval> | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly metricsService: RealtimeMetricsService,
    private readonly poseService: PoseService,
    private readonly treadmillService: TreadmillService,
    private readonly vitalSignsService: VitalSignsService,
    @Optional() @Inject(DemoSimulatorService)
    private readonly demoSimulator?: DemoSimulatorService,
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

    // Emit demo state periodically when in demo mode
    if (process.env.DEMO_MODE === 'true' && this.demoSimulator) {
      this.demoStateInterval = setInterval(() => {
        const state = this.demoSimulator!.getSimulationState();
        this.server.emit('demo-state', {
          event: 'demo-state',
          ...state,
          disclaimer: 'Demo mode — all data is synthetically generated.',
        });
      }, 2000);
    }
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

  @SubscribeMessage('demo-control')
  handleDemoControl(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      action: 'set-profile' | 'set-fatigue' | 'set-noise' | 'reset' | 'start-protocol';
      payload?: Record<string, unknown>;
    },
  ) {
    if (!this.demoSimulator) {
      return { status: 'error', message: 'Demo simulator not available' };
    }

    switch (data.action) {
      case 'set-profile': {
        const name = data.payload?.name as string | undefined;
        if (name && ATHLETE_PROFILES[name]) {
          this.demoSimulator.setProfile(ATHLETE_PROFILES[name]);
          return { status: 'ok', profile: name };
        }
        return { status: 'error', message: `Unknown profile: ${name}` };
      }

      case 'set-fatigue': {
        const rate = data.payload?.rate as number | undefined;
        if (rate !== undefined) {
          this.demoSimulator.setFatigueRate(rate);
          return { status: 'ok', fatigueRate: rate };
        }
        return { status: 'error', message: 'Missing rate' };
      }

      case 'set-noise': {
        const level = data.payload?.level as SignalNoiseLevel | undefined;
        if (level) {
          this.demoSimulator.setSignalNoise(level);
          return { status: 'ok', noiseLevel: level };
        }
        return { status: 'error', message: 'Missing level' };
      }

      case 'start-protocol': {
        const protocolName = data.payload?.name as string | undefined;
        if (protocolName && DEMO_PROTOCOLS[protocolName]) {
          const protocol = DEMO_PROTOCOLS[protocolName];
          const stages = protocol.stages.map((s, i) => ({
            orderIndex: i,
            label: s.label,
            durationSeconds: s.durationSeconds,
            speedKph: s.speedKph,
            inclinePercent: s.inclinePercent,
          }));
          this.treadmillService.startProtocol(protocol.name, stages);
          return { status: 'ok', protocol: protocolName };
        }
        return { status: 'error', message: `Unknown protocol: ${protocolName}` };
      }

      case 'reset': {
        this.demoSimulator.reset();
        this.treadmillService.stopProtocol();
        return { status: 'ok', message: 'Demo reset' };
      }

      default:
        return { status: 'error', message: `Unknown action: ${data.action}` };
    }
  }
}
