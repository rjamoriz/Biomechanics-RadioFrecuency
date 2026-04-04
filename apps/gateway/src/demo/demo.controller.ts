import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { DemoSimulatorService } from './demo-simulator.service';
import { TreadmillService } from '../treadmill/treadmill.service';
import {
  ATHLETE_PROFILES,
  DEMO_PROTOCOLS,
  AthleteSimProfile,
  SignalNoiseLevel,
} from './demo-simulator.types';

/**
 * REST control surface for demo mode simulation.
 * Only registered when DEMO_MODE=true — the DemoModule itself is conditionally imported.
 */
@Controller('api/v1/demo')
export class DemoController {
  constructor(
    private readonly simulator: DemoSimulatorService,
    private readonly treadmillService: TreadmillService,
  ) {}

  @Get('status')
  getStatus() {
    return {
      ...this.simulator.getSimulationState(),
      disclaimer: 'Demo mode — all data is synthetically generated, not from real sensors.',
    };
  }

  @Get('profiles')
  getProfiles() {
    return Object.values(ATHLETE_PROFILES);
  }

  @Get('protocols')
  getProtocols() {
    return Object.values(DEMO_PROTOCOLS).map((p) => ({
      name: p.name,
      description: p.description,
      stageCount: p.stages.length,
      totalDurationSeconds: p.stages.reduce((s, st) => s + st.durationSeconds, 0),
    }));
  }

  @Post('profile')
  @HttpCode(HttpStatus.OK)
  setProfile(@Body() body: { name?: string; custom?: AthleteSimProfile }) {
    if (body.name && ATHLETE_PROFILES[body.name]) {
      this.simulator.setProfile(ATHLETE_PROFILES[body.name]);
      return { status: 'ok', profile: body.name };
    }
    if (body.custom) {
      this.simulator.setProfile(body.custom);
      return { status: 'ok', profile: body.custom.name };
    }
    throw new NotFoundException(
      `Profile "${body.name}" not found. Available: ${Object.keys(ATHLETE_PROFILES).join(', ')}`,
    );
  }

  @Post('protocol')
  @HttpCode(HttpStatus.OK)
  startProtocol(@Body() body: { name: string }) {
    const protocol = DEMO_PROTOCOLS[body.name];
    if (!protocol) {
      throw new NotFoundException(
        `Protocol "${body.name}" not found. Available: ${Object.keys(DEMO_PROTOCOLS).join(', ')}`,
      );
    }
    const stages = protocol.stages.map((s, i) => ({
      orderIndex: i,
      label: s.label,
      durationSeconds: s.durationSeconds,
      speedKph: s.speedKph,
      inclinePercent: s.inclinePercent,
    }));
    this.treadmillService.startProtocol(protocol.name, stages);
    return { status: 'ok', protocol: protocol.name, stages: stages.length };
  }

  @Post('fatigue')
  @HttpCode(HttpStatus.OK)
  setFatigue(@Body() body: { rate: number }) {
    const rate = Math.max(0, Math.min(1, body.rate));
    this.simulator.setFatigueRate(rate);
    return { status: 'ok', fatigueRate: rate };
  }

  @Post('noise')
  @HttpCode(HttpStatus.OK)
  setNoise(@Body() body: { level: SignalNoiseLevel }) {
    const allowed: SignalNoiseLevel[] = ['clean', 'moderate', 'noisy'];
    if (!allowed.includes(body.level)) {
      return { status: 'error', message: `Level must be one of: ${allowed.join(', ')}` };
    }
    this.simulator.setSignalNoise(body.level);
    return { status: 'ok', noiseLevel: body.level };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  reset() {
    this.simulator.reset();
    this.treadmillService.stopProtocol();
    return { status: 'ok', message: 'Simulation reset to defaults' };
  }
}
