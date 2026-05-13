// ─── TrainingLoad ─────────────────────────────────────────────────────────────

export interface TrainingLoad {
  id: string;
  athleteId: string;
  sessionId: string | null;
  sessionDate: string; // ISO date "YYYY-MM-DD"
  acuteLoad: number;
  chronicLoad: number;
  acwr: number;
  monotony: number;
  strain: number;
  rpe: number | null;
  sessionRpe: number | null;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingLoadRequest {
  athleteId: string;
  sessionId?: string | null;
  sessionDate: string;
  acuteLoad: number;
  chronicLoad?: number;
  rpe?: number | null;
  notes?: string | null;
}

// ─── PainReport ───────────────────────────────────────────────────────────────

export interface PainReport {
  id: string;
  athleteId: string;
  sessionId: string | null;
  reportedAt: string; // ISO timestamp
  bodyRegion: string;
  painScale: number; // 0–10
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PainReportRequest {
  athleteId: string;
  sessionId?: string | null;
  bodyRegion: string;
  painScale: number;
  notes?: string | null;
}

// ─── AthleteBaseline ──────────────────────────────────────────────────────────

export interface AthleteBaseline {
  id: string;
  athleteId: string;
  metricName: string;
  baselineMean: number;
  baselineStd: number;
  sampleCount: number;
  windowDays: number;
  lastUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─── InjuryRiskSummary ────────────────────────────────────────────────────────

export interface InjuryRiskSummary {
  id: string;
  sessionId: string;
  peakRiskScore: number;
  peakRiskLevel: string;
  meanRiskScore: number;
  peakRiskTimestamp: number | null;
  articulationPeaksJson: Record<string, unknown> | null;
  dominantRiskFactors: string[];
  snapshotCount: number;
  modelConfidence: number;
  signalQualityScore: number;
  validationStatus: string;
  experimental: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
