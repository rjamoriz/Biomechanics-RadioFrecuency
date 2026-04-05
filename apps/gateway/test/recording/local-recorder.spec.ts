import * as fs from 'fs';
import * as path from 'path';
import { LocalRecorderService } from '../../src/recording/local-recorder.service';

describe('LocalRecorderService', () => {
  let recorder: LocalRecorderService;
  const testBaseDir = path.resolve(process.cwd(), 'storage', 'captures');
  const sessionIds = ['rec-test-1', 'rec-test-2', 'rec-test-3', 'rec-test-4', 'rec-test-5', 'rec-test-6', 'rec-test-7'];

  beforeEach(() => {
    recorder = new LocalRecorderService();
  });

  afterEach(() => {
    if (recorder.isRecording()) {
      recorder.stopRecording();
    }
  });

  afterAll(() => {
    for (const id of sessionIds) {
      const dir = path.join(testBaseDir, id);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('should start recording and create session directory', () => {
    recorder.startRecording(sessionIds[0]);

    expect(recorder.isRecording()).toBe(true);
    const summary = recorder.getRecordingSummary();
    expect(summary.sessionId).toBe(sessionIds[0]);
    expect(summary.isRecording).toBe(true);
    expect(summary.framesRecorded).toBe(0);
    expect(summary.filesWritten).toBe(1);

    const sessionDir = path.join(testBaseDir, sessionIds[0]);
    expect(fs.existsSync(sessionDir)).toBe(true);
  });

  it('should record frames and count them', () => {
    recorder.startRecording(sessionIds[1]);

    const frame = {
      timestamp: Date.now(),
      rssi: -55,
      channel: 6,
      mac: 'AA:BB:CC:DD',
      amplitude: [1.0, 2.0, 3.0],
      phase: [0.1, 0.2, 0.3],
    };

    recorder.recordFrame(frame);
    recorder.recordFrame(frame);
    recorder.recordFrame(frame);

    const summary = recorder.getRecordingSummary();
    expect(summary.framesRecorded).toBe(3);
    expect(summary.totalBytes).toBeGreaterThan(0);
  });

  it('should write valid NDJSON format', (done) => {
    recorder.startRecording(sessionIds[2]);

    const frame = {
      timestamp: 1000,
      rssi: -50,
      channel: 6,
      mac: 'AA:BB:CC:DD',
      amplitude: [1.5],
      phase: [0.5],
    };

    recorder.recordFrame(frame);
    recorder.stopRecording();

    const sessionDir = path.join(testBaseDir, sessionIds[2]);

    // Wait for the write stream to flush
    setTimeout(() => {
      const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith('.ndjson'));
      expect(files.length).toBeGreaterThanOrEqual(1);

      const content = fs.readFileSync(path.join(sessionDir, files[0]), 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.timestamp).toBe(1000);
      expect(parsed.rssi).toBe(-50);
      expect(parsed.amplitude).toEqual([1.5]);
      done();
    }, 300);
  });

  it('should not record when not started', () => {
    const frame = {
      timestamp: Date.now(),
      rssi: -55,
      channel: 6,
      mac: 'AA:BB:CC:DD',
      amplitude: [1.0],
      phase: [0.1],
    };

    recorder.recordFrame(frame);

    const summary = recorder.getRecordingSummary();
    expect(summary.framesRecorded).toBe(0);
    expect(summary.isRecording).toBe(false);
  });

  it('should stop recording and return summary', () => {
    recorder.startRecording(sessionIds[4]);

    const frame = {
      timestamp: Date.now(),
      rssi: -55,
      channel: 6,
      mac: 'AA:BB:CC:DD',
      amplitude: [1.0],
      phase: [0.1],
    };
    recorder.recordFrame(frame);

    const summary = recorder.stopRecording();
    expect(summary.isRecording).toBe(false);
    expect(summary.framesRecorded).toBe(1);
    expect(summary.filesWritten).toBeGreaterThanOrEqual(1);
    expect(recorder.isRecording()).toBe(false);
  });

  it('should track recording duration', () => {
    recorder.startRecording(sessionIds[5]);

    const summary = recorder.getRecordingSummary();
    expect(summary.startedAt).not.toBeNull();
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should warn and not start if already recording', () => {
    recorder.startRecording(sessionIds[6]);
    recorder.startRecording(sessionIds[5]);

    expect(recorder.getRecordingSummary().sessionId).toBe(sessionIds[6]);
  });
});
