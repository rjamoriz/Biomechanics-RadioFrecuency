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
import { AutonomousService } from '../autonomous/autonomous.service';
import { LocalRecorderService } from '../recording/local-recorder.service';
import {
  ATHLETE_PROFILES,
  DEMO_PROTOCOLS,
  SignalNoiseLevel,
} from '../demo/demo-simulator.types';
import {
  WsRealtimeMetrics,
  WsInferredMotionFrame,
  WsConnectionAck,
  WsAutonomousState,
  WsStationHealth,
  WsRecordingStatus,
  WsSignalDiagnostics,
  WsFieldModelState,
  WsAoAEstimate,
  WsMultiChannelState,
  WsFusedMetrics,
  WsAdaptiveClassification,
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
    private readonly autonomousService: AutonomousService,
    private readonly recorderService: LocalRecorderService,
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

    // Stream autonomous state events at ~2 Hz
    this.autonomousService.autonomousEvents$.subscribe((evt) => {
      const payload: WsAutonomousState = {
        event: 'autonomous-state',
        timestamp: evt.timestamp,
        coherence: {
          coherence: evt.coherence.coherence,
          entropy: evt.coherence.entropy,
          normalizedEntropy: evt.coherence.normalizedEntropy,
          isDecoherenceEvent: evt.coherence.isDecoherenceEvent,
          blochDrift: evt.coherence.blochDrift,
        },
        gaitClassification: {
          winner: evt.gaitClassification.winner,
          winnerProbability: evt.gaitClassification.winnerProbability,
          isConverged: evt.gaitClassification.isConverged,
        },
        ruleConclusions: evt.ruleResult.conclusions,
        disclaimer: evt.disclaimer,
      };
      this.server.emit('autonomous-state', payload);
    });

    // Stream station health at ~1 Hz
    this.autonomousService.stationHealthEvents$.subscribe((evt) => {
      const payload: WsStationHealth = {
        event: 'station-health',
        timestamp: evt.timestamp,
        activeStations: evt.health.activeStations,
        minCut: evt.health.minCut,
        isHealing: evt.health.isHealing,
        weakestStation: evt.health.weakestStation,
        coverageScore: evt.health.coverageScore,
      };
      this.server.emit('station-health', payload);
    });

    // Stream signal diagnostics at ~2 Hz (fires with autonomous events)
    this.autonomousService.signalLineEvents$.subscribe((evt) => {
      const fieldSnapshot = this.autonomousService.getFieldModelSnapshot();
      const gateDecision = this.autonomousService.getCoherenceGateDecision();

      const diagnostics: WsSignalDiagnostics = {
        event: 'signal-diagnostics',
        timestamp: evt.timestamp,
        gateAcceptanceRate: evt.gateAcceptanceRate,
        gateLastDecision: gateDecision
          ? { accepted: gateDecision.accepted, reason: gateDecision.reason, score: gateDecision.gateScore }
          : undefined,
        fieldModelState: fieldSnapshot.state,
        fieldModelDriftScore: fieldSnapshot.driftScore,
        fieldModelMotionEnergy: fieldSnapshot.motionEnergy,
        fieldModelCalibrationAge: fieldSnapshot.calibrationAge,
        pipelinePassRates: evt.pipelinePassRates,
        throughputHz: evt.throughputHz,
        disclaimer: evt.disclaimer,
      };
      this.server.emit('signal-diagnostics', diagnostics);

      const fieldState: WsFieldModelState = {
        event: 'field-model-state',
        timestamp: evt.timestamp,
        state: fieldSnapshot.state,
        calibrationAge: fieldSnapshot.calibrationAge,
        driftScore: fieldSnapshot.driftScore,
        motionEnergy: fieldSnapshot.motionEnergy,
        presenceDetected: fieldSnapshot.presenceDetected,
      };
      this.server.emit('field-model-state', fieldState);
    });

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

  @SubscribeMessage('start-recording')
  handleStartRecording(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    this.recorderService.startRecording(data.sessionId);
    const summary = this.recorderService.getRecordingSummary();
    const payload: WsRecordingStatus = {
      event: 'recording-status',
      timestamp: Date.now(),
      isRecording: summary.isRecording,
      sessionId: summary.sessionId,
      framesRecorded: summary.framesRecorded,
      filesWritten: summary.filesWritten,
    };
    this.server.emit('recording-status', payload);
    return { status: 'ok', sessionId: data.sessionId };
  }

  @SubscribeMessage('stop-recording')
  handleStopRecording() {
    const summary = this.recorderService.stopRecording();
    const payload: WsRecordingStatus = {
      event: 'recording-status',
      timestamp: Date.now(),
      isRecording: false,
      sessionId: summary.sessionId,
      framesRecorded: summary.framesRecorded,
      filesWritten: summary.filesWritten,
    };
    this.server.emit('recording-status', payload);
    return { status: 'ok', summary };
  }
}
