'use client';

import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { SyntheticMotionWarning } from '@/components/ui/synthetic-motion-warning';
import { useGatewaySocket } from '@/hooks/use-gateway-socket';

export default function InferredMotionPage() {
  const params = useParams<{ id: string }>();
  const { connected, inferredFrame } = useGatewaySocket();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Inferred Motion</h1>

      {/* Mandatory warning */}
      <SyntheticMotionWarning />

      {inferredFrame ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Inferred 2D Keypoints</CardTitle>
              </CardHeader>

              {/* Simple keypoint visualization — SVG stub */}
              <div className="relative mx-auto h-80 w-64 rounded-lg bg-slate-900">
                <svg viewBox="0 0 1 1" className="h-full w-full">
                  {inferredFrame.keypoints2D.map((kp, i) => (
                    <circle
                      key={kp.name}
                      cx={kp.x}
                      cy={kp.y}
                      r={0.015}
                      fill={kp.confidence > 0.5 ? '#22c55e' : '#f59e0b'}
                      opacity={kp.confidence}
                    />
                  ))}
                </svg>
                <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-slate-400">
                  Model: {inferredFrame.modelVersion} | Experimental
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Frame Info</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <ConfidenceIndicator
                  value={inferredFrame.confidence}
                  label="Frame Confidence"
                />
                <ConfidenceIndicator
                  value={inferredFrame.signalQualityScore}
                  label="Signal Quality"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Validation Status</span>
                  <ValidationBadge status={inferredFrame.validationStatus as any} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Keypoints</span>
                  <span className="font-medium text-slate-900">
                    {inferredFrame.keypoints2D.length}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          <Card className="text-xs text-slate-400">
            <p>{inferredFrame.disclaimer}</p>
          </Card>
        </>
      ) : (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">
            {connected
              ? 'Waiting for inferred motion frames from the gateway...'
              : 'Not connected to the gateway. Inferred motion requires a live connection.'}
          </p>
        </Card>
      )}
    </div>
  );
}
