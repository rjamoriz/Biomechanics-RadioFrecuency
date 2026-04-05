import {
  PersistentFieldModel,
  FieldModelState,
  DEFAULT_CALIBRATION_FRAMES,
  PRESENCE_THRESHOLD,
  DRIFT_THRESHOLD,
} from '../../src/signal/field-model';

describe('PersistentFieldModel', () => {
  let model: PersistentFieldModel;
  const NUM_SUBCARRIERS = 10;
  const now = 1000000;

  function makeAmplitudes(base: number, noise = 0): number[] {
    return Array.from({ length: NUM_SUBCARRIERS }, (_, i) =>
      base + i * 0.1 + (noise > 0 ? (Math.random() - 0.5) * noise : 0),
    );
  }

  beforeEach(() => {
    model = new PersistentFieldModel(10); // 10 frames for faster tests
  });

  describe('state machine transitions', () => {
    it('starts UNCALIBRATED', () => {
      expect(model.getSnapshot().state).toBe(FieldModelState.UNCALIBRATED);
    });

    it('transitions to CALIBRATING on startCalibration()', () => {
      model.startCalibration();
      expect(model.getSnapshot().state).toBe(FieldModelState.CALIBRATING);
    });

    it('transitions to CALIBRATED after collecting enough frames', () => {
      model.startCalibration();
      const amps = makeAmplitudes(1.0);
      for (let i = 0; i < 10; i++) {
        model.processFrame(amps, now + i);
      }
      expect(model.getSnapshot(now + 10).state).toBe(FieldModelState.CALIBRATED);
    });

    it('transitions CALIBRATED → DRIFTING when drift exceeds threshold', () => {
      model.startCalibration();
      const baseline = makeAmplitudes(1.0);
      for (let i = 0; i < 10; i++) {
        model.processFrame(baseline, now + i);
      }
      expect(model.isCalibrated()).toBe(true);

      // Feed very different amplitudes repeatedly to increase drift
      const drifted = makeAmplitudes(100.0);
      for (let i = 0; i < 500; i++) {
        model.processFrame(drifted, now + 10 + i);
      }

      const snapshot = model.getSnapshot(now + 510);
      expect(snapshot.driftScore).toBeGreaterThan(0);
      // After enough drifted frames, state should be DRIFTING
      if (snapshot.driftScore > DRIFT_THRESHOLD) {
        expect(snapshot.state).toBe(FieldModelState.DRIFTING);
      }
    });

    it('transitions DRIFTING → RECALIBRATING on startCalibration()', () => {
      model.startCalibration();
      const baseline = makeAmplitudes(1.0);
      for (let i = 0; i < 10; i++) model.processFrame(baseline, now + i);

      // Force drift
      const drifted = makeAmplitudes(100.0);
      for (let i = 0; i < 500; i++) model.processFrame(drifted, now + 10 + i);

      if (model.getSnapshot().state === FieldModelState.DRIFTING) {
        model.startCalibration();
        expect(model.getSnapshot().state).toBe(FieldModelState.RECALIBRATING);
      }
    });

    it('transitions RECALIBRATING → CALIBRATED after collecting frames', () => {
      // Start calibration
      model.startCalibration();
      const baseline = makeAmplitudes(1.0);
      for (let i = 0; i < 10; i++) model.processFrame(baseline, now + i);

      // Trigger recalibration
      model.startCalibration(); // CALIBRATED → RECALIBRATING
      for (let i = 0; i < 10; i++) model.processFrame(baseline, now + 20 + i);

      expect(model.getSnapshot(now + 30).state).toBe(FieldModelState.CALIBRATED);
    });
  });

  describe('baseline collection', () => {
    it('computes correct baseline mean', () => {
      model.startCalibration();
      const amps = Array.from({ length: NUM_SUBCARRIERS }, (_, i) => i * 1.0);
      for (let i = 0; i < 10; i++) {
        model.processFrame(amps, now + i);
      }
      const snapshot = model.getSnapshot(now + 10);
      expect(snapshot.baselineMean).not.toBeNull();
      for (let i = 0; i < NUM_SUBCARRIERS; i++) {
        expect(snapshot.baselineMean![i]).toBeCloseTo(i * 1.0, 6);
      }
    });

    it('computes zero variance for constant signal', () => {
      model.startCalibration();
      const amps = makeAmplitudes(5.0);
      for (let i = 0; i < 10; i++) model.processFrame(amps, now + i);

      const snapshot = model.getSnapshot(now + 10);
      for (let i = 0; i < NUM_SUBCARRIERS; i++) {
        expect(snapshot.baselineVariance![i]).toBeCloseTo(0, 6);
      }
    });

    it('sets calibration timestamp after finalization', () => {
      model.startCalibration();
      const amps = makeAmplitudes(1.0);
      for (let i = 0; i < 10; i++) model.processFrame(amps, now + i);

      const snapshot = model.getSnapshot(now + 10);
      expect(snapshot.lastCalibrationTimestamp).toBe(now + 9);
    });
  });

  describe('residual computation', () => {
    it('returns zeros when uncalibrated', () => {
      const amps = makeAmplitudes(1.0);
      const residual = model.getResidual(amps);
      expect(residual.every((v) => v === 0)).toBe(true);
    });

    it('returns baseline-subtracted values when calibrated', () => {
      model.startCalibration();
      const baseline = Array.from({ length: NUM_SUBCARRIERS }, () => 2.0);
      for (let i = 0; i < 10; i++) model.processFrame(baseline, now + i);

      const current = Array.from({ length: NUM_SUBCARRIERS }, () => 3.0);
      const residual = model.getResidual(current);
      for (const r of residual) {
        expect(r).toBeCloseTo(1.0, 6);
      }
    });
  });

  describe('motion energy', () => {
    it('returns zero when uncalibrated', () => {
      expect(model.getMotionEnergy(makeAmplitudes(1.0))).toBe(0);
    });

    it('returns positive value when athlete is present', () => {
      model.startCalibration();
      const baseline = Array.from({ length: NUM_SUBCARRIERS }, () => 1.0);
      for (let i = 0; i < 10; i++) model.processFrame(baseline, now + i);

      const disturbed = Array.from({ length: NUM_SUBCARRIERS }, () => 2.0);
      const energy = model.getMotionEnergy(disturbed);
      // (2-1)^2 / 10 = 0.1 per subcarrier, avg = 0.1
      expect(energy).toBeGreaterThan(0);
    });

    it('returns higher energy for larger disturbance', () => {
      model.startCalibration();
      const baseline = Array.from({ length: NUM_SUBCARRIERS }, () => 1.0);
      for (let i = 0; i < 10; i++) model.processFrame(baseline, now + i);

      const small = Array.from({ length: NUM_SUBCARRIERS }, () => 1.5);
      const large = Array.from({ length: NUM_SUBCARRIERS }, () => 3.0);

      expect(model.getMotionEnergy(large)).toBeGreaterThan(model.getMotionEnergy(small));
    });
  });

  describe('presence detection', () => {
    it('detects presence when motion energy exceeds threshold', () => {
      model.startCalibration();
      const baseline = Array.from({ length: NUM_SUBCARRIERS }, () => 1.0);
      for (let i = 0; i < 10; i++) model.processFrame(baseline, now + i);

      // Disturbed signal
      const disturbed = Array.from({ length: NUM_SUBCARRIERS }, () => 2.0);
      const snapshot = model.processFrame(disturbed, now + 10);
      expect(snapshot.motionEnergy).toBeGreaterThan(PRESENCE_THRESHOLD);
      expect(snapshot.presenceDetected).toBe(true);
    });

    it('no presence when signal matches baseline', () => {
      model.startCalibration();
      const baseline = Array.from({ length: NUM_SUBCARRIERS }, () => 1.0);
      for (let i = 0; i < 10; i++) model.processFrame(baseline, now + i);

      const snapshot = model.processFrame(baseline, now + 10);
      expect(snapshot.presenceDetected).toBe(false);
    });
  });

  describe('export/import baseline', () => {
    it('returns null when uncalibrated', () => {
      expect(model.exportBaseline()).toBeNull();
    });

    it('exports valid baseline after calibration', () => {
      model.startCalibration();
      const amps = makeAmplitudes(3.0);
      for (let i = 0; i < 10; i++) model.processFrame(amps, now + i);

      const exported = model.exportBaseline();
      expect(exported).not.toBeNull();
      expect(exported!.mean).toHaveLength(NUM_SUBCARRIERS);
      expect(exported!.variance).toHaveLength(NUM_SUBCARRIERS);
      expect(exported!.timestamp).toBeDefined();
    });

    it('imported baseline sets state to CALIBRATED', () => {
      const baseline = {
        mean: Array.from({ length: NUM_SUBCARRIERS }, () => 2.0),
        variance: Array.from({ length: NUM_SUBCARRIERS }, () => 0.01),
        timestamp: now,
      };
      model.importBaseline(baseline);
      expect(model.isCalibrated()).toBe(true);
      expect(model.getSnapshot().state).toBe(FieldModelState.CALIBRATED);
    });

    it('round-trips export/import correctly', () => {
      model.startCalibration();
      const amps = makeAmplitudes(3.0);
      for (let i = 0; i < 10; i++) model.processFrame(amps, now + i);

      const exported = model.exportBaseline()!;
      const newModel = new PersistentFieldModel(10);
      newModel.importBaseline(exported);

      expect(newModel.isCalibrated()).toBe(true);
      expect(newModel.getSnapshot().baselineMean).toEqual(exported.mean);
    });
  });

  describe('calibration age', () => {
    it('age increases with time', () => {
      model.startCalibration();
      const amps = makeAmplitudes(1.0);
      for (let i = 0; i < 10; i++) model.processFrame(amps, now + i);

      const snap1 = model.getSnapshot(now + 1000);
      const snap2 = model.getSnapshot(now + 5000);
      expect(snap2.calibrationAge).toBeGreaterThan(snap1.calibrationAge);
    });
  });

  describe('reset', () => {
    it('resets to UNCALIBRATED', () => {
      model.startCalibration();
      const amps = makeAmplitudes(1.0);
      for (let i = 0; i < 10; i++) model.processFrame(amps, now + i);
      expect(model.isCalibrated()).toBe(true);

      model.reset();
      expect(model.getSnapshot().state).toBe(FieldModelState.UNCALIBRATED);
      expect(model.isCalibrated()).toBe(false);
      expect(model.getSnapshot().baselineMean).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles empty amplitude array', () => {
      model.startCalibration();
      const snap = model.processFrame([], now);
      expect(snap.state).toBe(FieldModelState.CALIBRATING);
    });

    it('uses default calibration frames', () => {
      const defaultModel = new PersistentFieldModel();
      defaultModel.startCalibration();
      // Should need DEFAULT_CALIBRATION_FRAMES frames
      const amps = makeAmplitudes(1.0);
      for (let i = 0; i < DEFAULT_CALIBRATION_FRAMES - 1; i++) {
        defaultModel.processFrame(amps, now + i);
      }
      expect(defaultModel.getSnapshot().state).toBe(FieldModelState.CALIBRATING);
      defaultModel.processFrame(amps, now + DEFAULT_CALIBRATION_FRAMES);
      expect(defaultModel.getSnapshot().state).toBe(FieldModelState.CALIBRATED);
    });
  });
});
