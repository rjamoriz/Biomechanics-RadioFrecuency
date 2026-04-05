/**
 * Local CSI Recorder
 *
 * Records raw CSI frames to local disk when backend is unavailable or for
 * local capture sessions. Uses NDJSON (newline-delimited JSON) format for
 * append-friendly recording.
 *
 * Files: storage/captures/{session-id}/{timestamp}.ndjson
 * Rotates at 10 MB or 60 seconds per file.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────────

export interface RecordingSummary {
  sessionId: string | null;
  isRecording: boolean;
  framesRecorded: number;
  filesWritten: number;
  totalBytes: number;
  startedAt: number | null;
  durationMs: number;
}

interface NdjsonFrame {
  timestamp: number;
  rssi: number;
  channel: number;
  mac: string;
  amplitude: number[];
  phase: number[];
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILE_DURATION_MS = 60_000;       // 60 seconds
const BASE_DIR = path.resolve(process.cwd(), 'storage', 'captures');

// ─── Implementation ─────────────────────────────────────────────────

@Injectable()
export class LocalRecorderService {
  private readonly logger = new Logger(LocalRecorderService.name);

  private recording = false;
  private sessionId: string | null = null;
  private sessionDir: string | null = null;
  private currentFile: fs.WriteStream | null = null;
  private currentFileBytes = 0;
  private currentFileStart = 0;
  private framesRecorded = 0;
  private filesWritten = 0;
  private totalBytes = 0;
  private startedAt: number | null = null;

  startRecording(sessionId: string): void {
    if (this.recording) {
      this.logger.warn('Already recording — stop first');
      return;
    }

    this.sessionId = sessionId;
    this.sessionDir = path.join(BASE_DIR, sessionId);
    fs.mkdirSync(this.sessionDir, { recursive: true });

    this.recording = true;
    this.framesRecorded = 0;
    this.filesWritten = 0;
    this.totalBytes = 0;
    this.startedAt = Date.now();

    this.rotateFile();
    this.logger.log(`Recording started: ${this.sessionDir}`);
  }

  stopRecording(): RecordingSummary {
    this.closeFile();
    this.recording = false;
    const summary = this.getRecordingSummary();
    this.sessionId = null;
    this.sessionDir = null;
    this.logger.log(`Recording stopped. Frames: ${summary.framesRecorded}, Files: ${summary.filesWritten}`);
    return summary;
  }

  isRecording(): boolean {
    return this.recording;
  }

  recordFrame(frame: NdjsonFrame): void {
    if (!this.recording) return;

    // Check rotation conditions
    const now = Date.now();
    if (
      this.currentFileBytes >= MAX_FILE_BYTES ||
      now - this.currentFileStart >= MAX_FILE_DURATION_MS
    ) {
      this.rotateFile();
    }

    const line = JSON.stringify(frame) + '\n';
    const bytes = Buffer.byteLength(line, 'utf-8');

    if (this.currentFile) {
      this.currentFile.write(line);
      this.currentFileBytes += bytes;
      this.totalBytes += bytes;
      this.framesRecorded++;
    }
  }

  getRecordingSummary(): RecordingSummary {
    return {
      sessionId: this.sessionId,
      isRecording: this.recording,
      framesRecorded: this.framesRecorded,
      filesWritten: this.filesWritten,
      totalBytes: this.totalBytes,
      startedAt: this.startedAt,
      durationMs: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  // ─── Private ────────────────────────────────────────────────────

  private rotateFile(): void {
    this.closeFile();

    if (!this.sessionDir) return;

    const filename = `${Date.now()}.ndjson`;
    const filepath = path.join(this.sessionDir, filename);
    this.currentFile = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf-8' });
    this.currentFile.on('error', (err) => {
      this.logger.warn(`WriteStream error: ${err.message}`);
    });
    this.currentFileBytes = 0;
    this.currentFileStart = Date.now();
    this.filesWritten++;
  }

  private closeFile(): void {
    if (this.currentFile) {
      this.currentFile.end();
      this.currentFile = null;
    }
  }
}
