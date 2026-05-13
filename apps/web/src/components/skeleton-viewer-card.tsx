'use client';

import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SyntheticMotionWarning } from '@/components/ui/synthetic-motion-warning';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { Activity, Loader2 } from 'lucide-react';
import type { SkeletonKeypoint } from './skeleton-viewer';
import type { JointKinematicsFrame } from '@/hooks/use-gateway-socket';

/* ──────────────────────────────────────────────
 * Skeleton Viewer Card — wraps the 3D viewer
 * with metadata, warnings, and state handling.
 *
 * Uses next/dynamic SSR:false because Three.js
 * requires a browser WebGL context.
 * ────────────────────────────────────────────── */

const SkeletonViewer = dynamic(
  () => import('./skeleton-viewer').then((m) => m.SkeletonViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center rounded-lg bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    ),
  },
);

type ValidationStatus = 'unvalidated' | 'experimental' | 'station-validated' | 'externally-validated';

export interface SkeletonViewerCardProps {
  keypoints: SkeletonKeypoint[] | null;
  modelConfidence: number;
  signalQualityScore: number;
  validationStatus: ValidationStatus;
  experimental: boolean;
  loading?: boolean;
  jointKinematics?: JointKinematicsFrame | null;
  className?: string;
}

export function SkeletonViewerCard({
  keypoints,
  modelConfidence,
  signalQualityScore,
  validationStatus,
  experimental,
  loading = false,
  jointKinematics,
  className,
}: SkeletonViewerCardProps) {
  const hasData = keypoints && keypoints.length > 0;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Inferred 3D Skeleton</CardTitle>
            {experimental && <Badge variant="warning">Experimental</Badge>}
            <Badge variant="info">Inferred</Badge>
          </div>
          <ValidationBadge status={validationStatus} />
        </div>
      </CardHeader>

      {/* Mandatory synthetic motion disclaimer */}
      <SyntheticMotionWarning className="mb-4" />

      {/* Loading state */}
      {loading && !hasData && (
        <div className="flex h-[400px] items-center justify-center rounded-lg bg-slate-800">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            <p className="text-sm text-slate-500">Waiting for inferred motion data…</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasData && (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-lg bg-slate-800">
          <Activity className="h-12 w-12 text-slate-600" />
          <p className="mt-4 text-sm text-slate-400">
            No inferred skeleton data available.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Start a session with inference enabled to see the 3D skeleton.
          </p>
        </div>
      )}

      {/* 3D viewer */}
      {hasData && (
        <SkeletonViewer
          keypoints={keypoints}
          modelConfidence={modelConfidence}
          jointKinematics={jointKinematics}
          className="h-[400px] overflow-hidden rounded-lg"
        />
      )}

      {/* Confidence and signal quality footer */}
      {hasData && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ConfidenceIndicator value={modelConfidence} label="Model Confidence" />
          <ConfidenceIndicator value={signalQualityScore} label="Signal Quality" />
        </div>
      )}
    </Card>
  );
}
