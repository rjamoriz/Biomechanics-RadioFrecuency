import { AlertTriangle } from 'lucide-react';

export function SyntheticMotionWarning({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 ${className ?? ''}`}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
      <div className="text-sm text-amber-800">
        <p className="font-medium">Synthetic Model-Based Rendering</p>
        <p className="mt-1">
          This is a synthetic model-based rendering inferred from Wi-Fi sensing.
          It is not a true camera or optical motion capture view. Confidence and
          validation status are shown alongside the visualization.
        </p>
      </div>
    </div>
  );
}
