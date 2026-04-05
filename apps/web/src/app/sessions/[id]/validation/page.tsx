'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { BlandAltmanChart } from '@/components/bland-altman-chart';
import { CorrelationChart } from '@/components/correlation-chart';
import { useValidation } from '@/hooks/use-validation';
import type { ReferenceType, ValidationComparison } from '@/types/validation';

const TABS = [
  { id: 'upload', label: 'Upload' },
  { id: 'alignment', label: 'Alignment' },
  { id: 'results', label: 'Results' },
  { id: 'summary', label: 'Summary' },
];

const REFERENCE_TYPE_LABELS: Record<ReferenceType, string> = {
  treadmill_console: 'Treadmill Console',
  imu_csv: 'IMU CSV',
  video_derived_csv: 'Video-Derived CSV',
  pressure_insole_csv: 'Pressure Insole CSV',
  force_plate_csv: 'Force Plate CSV',
};

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  uploaded: { label: 'Uploaded', variant: 'info' },
  aligned: { label: 'Aligned', variant: 'success' },
  validated: { label: 'Validated', variant: 'success' },
  error: { label: 'Error', variant: 'danger' },
};

export default function ValidationPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [activeTab, setActiveTab] = useState('upload');

  const {
    references,
    comparisons,
    summary,
    uploadReference,
    triggerComparison,
    isLoading,
    error,
  } = useValidation(sessionId);

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading validation data…</p>;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" />
        Failed to load validation data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/sessions/${sessionId}`}
            className="text-slate-400 hover:text-slate-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Validation Workflow</h1>
        </div>
        {summary && (
          <OverallStatusBadge status={summary.overallStatus} />
        )}
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'upload' && (
        <UploadTab
          sessionId={sessionId}
          references={references}
          uploadReference={uploadReference}
          triggerComparison={triggerComparison}
        />
      )}
      {activeTab === 'alignment' && (
        <AlignmentTab references={references} />
      )}
      {activeTab === 'results' && (
        <ResultsTab comparisons={comparisons} />
      )}
      {activeTab === 'summary' && (
        <SummaryTab summary={summary} comparisons={comparisons} />
      )}
    </div>
  );
}

// ── Overall Status Badge ────────────────────────────────────────

function OverallStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }> = {
    no_reference: { label: 'No Reference', variant: 'default' },
    pending_alignment: { label: 'Pending Alignment', variant: 'warning' },
    validated: { label: 'Validated', variant: 'success' },
    failed: { label: 'Failed', variant: 'danger' },
  };
  const c = config[status] ?? config.no_reference;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

// ── Upload Tab ──────────────────────────────────────────────────

function UploadTab({
  sessionId,
  references,
  uploadReference,
  triggerComparison,
}: {
  sessionId: string;
  references: ReturnType<typeof useValidation>['references'];
  uploadReference: ReturnType<typeof useValidation>['uploadReference'];
  triggerComparison: ReturnType<typeof useValidation>['triggerComparison'];
}) {
  const [selectedType, setSelectedType] = useState<ReferenceType>('treadmill_console');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped && (dropped.name.endsWith('.csv') || dropped.name.endsWith('.json'))) {
        setFile(dropped);
      }
    },
    [],
  );

  const handleUpload = () => {
    if (!file) return;
    uploadReference.mutate(
      { sessionId, referenceType: selectedType, file },
      { onSuccess: () => setFile(null) },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Reference Data</CardTitle>
        </CardHeader>

        {/* Reference type selector */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Reference Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as ReferenceType)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {Object.entries(REFERENCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? 'border-brand-400 bg-brand-50'
              : 'border-slate-300 bg-slate-50'
          }`}
        >
          <Upload className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-sm text-slate-600">
            Drag & drop a <strong>.csv</strong> or <strong>.json</strong> file here
          </p>
          <p className="mt-1 text-xs text-slate-400">or</p>
          <label className="mt-2 cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Browse Files
            <input
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setFile(e.target.files[0]);
              }}
            />
          </label>
          {file && (
            <p className="mt-3 text-sm font-medium text-brand-700">{file.name}</p>
          )}
        </div>

        {/* Upload button */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleUpload}
            disabled={!file || uploadReference.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {uploadReference.isPending ? 'Uploading…' : 'Upload'}
          </button>
          {uploadReference.isSuccess && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Uploaded successfully
            </span>
          )}
          {uploadReference.isError && (
            <span className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> Upload failed
            </span>
          )}
        </div>
      </Card>

      {/* Existing references */}
      {references.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded References</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                  <th className="pb-2 pr-4">File</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Rows</th>
                  <th className="pb-2 pr-4">Time Range</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {references.map((ref) => {
                  const sb = STATUS_BADGES[ref.status] ?? STATUS_BADGES.uploaded;
                  return (
                    <tr key={ref.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        {ref.fileName}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">
                          {REFERENCE_TYPE_LABELS[ref.referenceType]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {ref.rowCount.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {(ref.timeRangeStartMs / 1000).toFixed(1)}s –{' '}
                        {(ref.timeRangeEndMs / 1000).toFixed(1)}s
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => triggerComparison.mutate(ref.id)}
                          disabled={triggerComparison.isPending}
                          className="text-xs font-medium text-brand-600 hover:text-brand-800 disabled:opacity-50"
                        >
                          Compare
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Alignment Tab ───────────────────────────────────────────────

function AlignmentTab({
  references,
}: {
  references: ReturnType<typeof useValidation>['references'];
}) {
  const [offsetMs, setOffsetMs] = useState(0);

  if (references.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          Upload a reference file first to view alignment.
        </p>
      </Card>
    );
  }

  // Compute alignment bounds from all references
  const csiStartMs = 0; // CSI always starts at 0 in session-relative time
  const csiEndMs = Math.max(
    ...references.map((r) => r.timeRangeEndMs),
    10000,
  );
  const refStartMs = Math.min(...references.map((r) => r.timeRangeStartMs));
  const refEndMs = Math.max(...references.map((r) => r.timeRangeEndMs));

  const totalRange = Math.max(csiEndMs, refEndMs + Math.abs(offsetMs));
  const overlapStart = Math.max(csiStartMs, refStartMs + offsetMs);
  const overlapEnd = Math.min(csiEndMs, refEndMs + offsetMs);
  const overlapMs = Math.max(0, overlapEnd - overlapStart);
  const overlapPct = totalRange > 0 ? (overlapMs / totalRange) * 100 : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Time Alignment</CardTitle>
        </CardHeader>

        {/* Visual timeline */}
        <div className="space-y-3">
          <TimelineBar
            label="CSI Data"
            startPct={(csiStartMs / totalRange) * 100}
            widthPct={((csiEndMs - csiStartMs) / totalRange) * 100}
            color="bg-blue-400"
          />
          <TimelineBar
            label="Reference Data"
            startPct={((refStartMs + offsetMs) / totalRange) * 100}
            widthPct={((refEndMs - refStartMs) / totalRange) * 100}
            color="bg-amber-400"
          />
          {overlapMs > 0 && (
            <TimelineBar
              label="Overlap"
              startPct={(overlapStart / totalRange) * 100}
              widthPct={(overlapMs / totalRange) * 100}
              color="bg-green-400"
            />
          )}
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Overlap: <strong>{overlapPct.toFixed(1)}%</strong> ({(overlapMs / 1000).toFixed(1)}s)
        </p>

        {/* Manual offset */}
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Manual Offset (ms)
          </label>
          <input
            type="number"
            value={offsetMs}
            onChange={(e) => setOffsetMs(Number(e.target.value))}
            className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-slate-400">
            Positive shifts reference data forward in time
          </p>
        </div>
      </Card>
    </div>
  );
}

function TimelineBar({
  label,
  startPct,
  widthPct,
  color,
}: {
  label: string;
  startPct: number;
  widthPct: number;
  color: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
      <div className="relative h-6 w-full rounded bg-slate-100">
        <div
          className={`absolute h-full rounded ${color}`}
          style={{
            left: `${Math.max(0, startPct)}%`,
            width: `${Math.min(widthPct, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

// ── Results Tab ─────────────────────────────────────────────────

function ResultsTab({
  comparisons,
}: {
  comparisons: ReturnType<typeof useValidation>['comparisons'];
}) {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  if (comparisons.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          Run a comparison from the Upload tab to see results.
        </p>
      </Card>
    );
  }

  const selected = comparisons.find((c) => c.metric === selectedMetric);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Metric Comparison Results</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                <th className="pb-2 pr-4">Metric</th>
                <th className="pb-2 pr-4">MAE</th>
                <th className="pb-2 pr-4">RMSE</th>
                <th className="pb-2 pr-4">Correlation (r)</th>
                <th className="pb-2 pr-4">Bias</th>
                <th className="pb-2 pr-4">LoA</th>
                <th className="pb-2 pr-4">Samples</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedMetric(c.metric)}
                  className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 ${
                    selectedMetric === c.metric ? 'bg-slate-50' : ''
                  }`}
                >
                  <td className="py-2 pr-4 font-medium text-slate-900">{c.metric}</td>
                  <td className="py-2 pr-4 text-slate-600">{c.meanAbsoluteError.toFixed(3)}</td>
                  <td className="py-2 pr-4 text-slate-600">{c.rootMeanSquareError.toFixed(3)}</td>
                  <td className="py-2 pr-4">
                    <CorrelationCell value={c.correlationCoefficient} />
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{c.biasEstimate.toFixed(3)}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    [{c.limitsOfAgreement.lower.toFixed(2)}, {c.limitsOfAgreement.upper.toFixed(2)}]
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{c.sampleCount.toLocaleString()}</td>
                  <td className="py-2">
                    <ValidationBadge
                      status={c.validationStatus.replace(/_/g, '-') as any}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts — placeholder data since actual point-level data would come from a detail endpoint */}
      {selected && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <BlandAltmanChart
              data={generatePlaceholderPoints(selected)}
              metricName={selected.metric}
            />
          </Card>
          <Card>
            <CorrelationChart
              data={generatePlaceholderPoints(selected)}
              metricName={selected.metric}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function CorrelationCell({ value }: { value: number }) {
  const abs = Math.abs(value);
  let color = 'text-red-600';
  if (abs >= 0.9) color = 'text-green-600';
  else if (abs >= 0.7) color = 'text-amber-600';

  return <span className={`font-medium ${color}`}>{value.toFixed(3)}</span>;
}

/**
 * Generate synthetic scatter points from summary stats for chart previews.
 * In production the backend would serve the actual paired data points.
 */
function generatePlaceholderPoints(c: ValidationComparison) {
  const points: { reference: number; estimated: number }[] = [];
  const baseMean = 100; // arbitrary center
  const n = Math.min(c.sampleCount, 60);
  for (let i = 0; i < n; i++) {
    const ref = baseMean + (Math.random() - 0.5) * 20;
    const est = ref + c.biasEstimate + (Math.random() - 0.5) * c.rootMeanSquareError * 2;
    points.push({ reference: ref, estimated: est });
  }
  return points;
}

// ── Summary Tab ─────────────────────────────────────────────────

function SummaryTab({
  summary,
  comparisons,
}: {
  summary: ReturnType<typeof useValidation>['summary'];
  comparisons: ReturnType<typeof useValidation>['comparisons'];
}) {
  if (!summary) {
    return (
      <Card>
        <p className="text-sm text-slate-500">No validation summary available yet.</p>
      </Card>
    );
  }

  const best = comparisons.reduce<ValidationComparison | null>(
    (b, c) => (!b || Math.abs(c.correlationCoefficient) > Math.abs(b.correlationCoefficient) ? c : b),
    null,
  );
  const worst = comparisons.reduce<ValidationComparison | null>(
    (w, c) => (!w || Math.abs(c.correlationCoefficient) < Math.abs(w.correlationCoefficient) ? c : w),
    null,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Validation Summary</CardTitle>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Overall Status"
            value={summary.overallStatus.replace(/_/g, ' ')}
            icon={<Clock className="h-5 w-5" />}
          />
          <StatCard
            label="References"
            value={String(summary.references.length)}
            icon={<Upload className="h-5 w-5" />}
          />
          <StatCard
            label="Best Correlation"
            value={
              summary.bestCorrelation !== null
                ? summary.bestCorrelation.toFixed(3)
                : '—'
            }
          />
          <StatCard
            label="Worst Metric"
            value={summary.worstMetric ?? '—'}
          />
        </div>
      </Card>

      {/* Highlights */}
      {(best || worst) && (
        <Card>
          <CardHeader>
            <CardTitle>Metric Highlights</CardTitle>
          </CardHeader>
          <div className="space-y-3 text-sm">
            {best && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-slate-700">
                  <strong>{best.metric}</strong> has the highest correlation (
                  {best.correlationCoefficient.toFixed(3)})
                </span>
              </div>
            )}
            {worst && (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-slate-700">
                  <strong>{worst.metric}</strong> has the lowest correlation (
                  {worst.correlationCoefficient.toFixed(3)}) — consider recalibrating
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
        </CardHeader>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
          {summary.overallStatus === 'no_reference' && (
            <li>Upload at least one reference dataset to begin validation.</li>
          )}
          {summary.overallStatus === 'pending_alignment' && (
            <li>Check time alignment between CSI and reference data before comparing.</li>
          )}
          {worst && Math.abs(worst.correlationCoefficient) < 0.7 && (
            <li>
              Metric <strong>{worst.metric}</strong> shows weak correlation. Review calibration
              state and signal quality during the session.
            </li>
          )}
          {summary.overallStatus === 'validated' && (
            <li>Validation passed. Results can be used for analysis with documented confidence levels.</li>
          )}
          <li>
            All metrics are estimated proxy values from Wi-Fi CSI sensing.
            They are not equivalent to gold-standard measurements.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-xs font-medium uppercase">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold capitalize text-slate-900">{value}</p>
    </div>
  );
}
