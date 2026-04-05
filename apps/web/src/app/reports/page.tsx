'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  formatCadence,
  formatDuration,
  formatTimestamp,
  formatPercentage,
} from '@/lib/format';
import {
  BarChart3,
  FileText,
  Download,
  Mail,
  Search,
  ChevronDown,
  Loader2,
  FileSpreadsheet,
  Eye,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface CompletedSession {
  id: string;
  athleteName: string;
  stationName: string;
  protocolName: string | null;
  validationStatus: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
}

interface SessionReport {
  sessionId: string;
  athleteName: string;
  stationName: string;
  protocolName: string | null;
  date: string;
  avgCadence: number;
  avgCadenceConfidence: number;
  avgSymmetryProxy: number;
  avgSymmetryConfidence: number;
  avgContactTimeProxy: number;
  avgContactTimeConfidence: number;
  avgFlightTimeProxy: number;
  formStabilityScore: number;
  fatigueDriftScore: number;
  overallSignalQuality: number;
  validationStatus: string;
  stages: Array<{
    name: string;
    speedKmh: number;
    inclinePercent: number;
    durationSeconds: number;
    avgCadence: number;
    avgSymmetry: number;
    avgContactTime: number;
    fatigueDrift: number;
  }>;
  confidenceZones: {
    highPercent: number;
    mediumPercent: number;
    lowPercent: number;
  };
}

type ReportFormat = 'pdf' | 'csv';

interface ReportOptions {
  cadenceSummary: boolean;
  strideMetrics: boolean;
  contactFlightTime: boolean;
  symmetryAnalysis: boolean;
  fatigueProgression: boolean;
  jointAngleSummary: boolean;
  signalQualityLog: boolean;
  validationComparison: boolean;
}

const DEFAULT_OPTIONS: ReportOptions = {
  cadenceSummary: true,
  strideMetrics: true,
  contactFlightTime: true,
  symmetryAnalysis: true,
  fatigueProgression: true,
  jointAngleSummary: false,
  signalQualityLog: false,
  validationComparison: false,
};

// ── Main Component ──────────────────────────────────────────────

export default function ReportsPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [reportFormat, setReportFormat] = useState<ReportFormat>('pdf');
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_OPTIONS);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['completed-sessions'],
    queryFn: () => apiFetch<CompletedSession[]>('/sessions?status=completed'),
  });

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['session-report', selectedSessionId],
    queryFn: () =>
      apiFetch<SessionReport>(
        `/sessions/${encodeURIComponent(selectedSessionId!)}/report`,
      ),
    enabled: !!selectedSessionId,
  });

  const generatePdf = useMutation({
    mutationFn: () =>
      apiFetch<{ url: string }>(
        `/sessions/${encodeURIComponent(selectedSessionId!)}/report/export`,
        { method: 'POST', body: { format: 'pdf', options } },
      ),
  });

  const generateCsv = useMutation({
    mutationFn: () =>
      apiFetch<{ url: string }>(
        `/sessions/${encodeURIComponent(selectedSessionId!)}/report/export`,
        { method: 'POST', body: { format: 'csv', options } },
      ),
  });

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.athleteName.toLowerCase().includes(q) ||
        s.stationName.toLowerCase().includes(q) ||
        (s.protocolName?.toLowerCase().includes(q) ?? false),
    );
  }, [sessions, searchQuery]);

  const selectedSession = sessions?.find((s) => s.id === selectedSessionId) ?? null;

  const toggleOption = (key: keyof ReportOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Reports &amp; Export</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Left: Session Selection + Config ── */}
        <div className="lg:col-span-1 space-y-6">
          {/* Session Selector */}
          <Card>
            <CardHeader>
              <CardTitle>Select Session</CardTitle>
            </CardHeader>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by athlete, station, or protocol…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                data-testid="session-search"
              />
            </div>

            {isLoading && (
              <div className="py-6 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                <p className="mt-2 text-xs text-slate-500">Loading sessions…</p>
              </div>
            )}

            {sessions && filteredSessions.length === 0 && (
              <div className="py-6 text-center">
                <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 text-xs text-slate-500">No sessions found.</p>
              </div>
            )}

            <div className="max-h-64 space-y-2 overflow-y-auto" data-testid="session-list">
              {filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left text-sm transition-colors',
                    selectedSessionId === session.id
                      ? 'border-brand-300 bg-brand-50'
                      : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{session.athleteName}</span>
                    <ValidationBadge status={session.validationStatus as never} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatTimestamp(session.startedAt)} · {formatDuration(session.durationSeconds)}
                  </p>
                  {session.protocolName && (
                    <Badge variant="info" className="mt-1">
                      {session.protocolName}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* Session Summary */}
          {selectedSession && (
            <Card className="bg-slate-50">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Selected Session
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selectedSession.athleteName}
              </p>
              <p className="text-xs text-slate-500">
                Station: {selectedSession.stationName}
              </p>
              <p className="text-xs text-slate-500">
                Date: {formatTimestamp(selectedSession.startedAt)}
              </p>
              <p className="text-xs text-slate-500">
                Duration: {formatDuration(selectedSession.durationSeconds)}
              </p>
              {selectedSession.protocolName && (
                <p className="text-xs text-slate-500">
                  Protocol: {selectedSession.protocolName}
                </p>
              )}
            </Card>
          )}

          {/* Report Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Report Configuration</CardTitle>
            </CardHeader>

            <div className="space-y-2" data-testid="report-options">
              <ReportCheckbox
                label="Cadence summary"
                checked={options.cadenceSummary}
                onChange={() => toggleOption('cadenceSummary')}
              />
              <ReportCheckbox
                label="Stride metrics"
                checked={options.strideMetrics}
                onChange={() => toggleOption('strideMetrics')}
              />
              <ReportCheckbox
                label="Contact time & flight time proxy"
                checked={options.contactFlightTime}
                onChange={() => toggleOption('contactFlightTime')}
              />
              <ReportCheckbox
                label="Symmetry analysis (proxy)"
                checked={options.symmetryAnalysis}
                onChange={() => toggleOption('symmetryAnalysis')}
              />
              <ReportCheckbox
                label="Fatigue progression"
                checked={options.fatigueProgression}
                onChange={() => toggleOption('fatigueProgression')}
              />
              <ReportCheckbox
                label="Joint angle summary (experimental)"
                checked={options.jointAngleSummary}
                onChange={() => toggleOption('jointAngleSummary')}
                experimental
              />
              <ReportCheckbox
                label="Signal quality log"
                checked={options.signalQualityLog}
                onChange={() => toggleOption('signalQualityLog')}
              />
              <ReportCheckbox
                label="Validation comparison"
                checked={options.validationComparison}
                onChange={() => toggleOption('validationComparison')}
              />
            </div>

            {/* Format Selector */}
            <div className="mt-4" data-testid="format-selector">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Report Format
              </label>
              <div className="relative">
                <select
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value as ReportFormat)}
                  className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="pdf">PDF Report</option>
                  <option value="csv">CSV Export</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </Card>

          {/* Export Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Export</CardTitle>
            </CardHeader>
            <div className="space-y-2" data-testid="export-actions">
              <Button
                className="w-full"
                onClick={() => generatePdf.mutate()}
                loading={generatePdf.isPending}
                disabled={!selectedSessionId}
                data-testid="generate-pdf-btn"
              >
                <FileText className="h-4 w-4" /> Generate PDF
              </Button>
              {generatePdf.isSuccess && (
                <a
                  href={generatePdf.data.url}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  download
                >
                  <Download className="h-3 w-3" /> Download PDF
                </a>
              )}

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => generateCsv.mutate()}
                loading={generateCsv.isPending}
                disabled={!selectedSessionId}
                data-testid="export-csv-btn"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export CSV
              </Button>
              {generateCsv.isSuccess && (
                <a
                  href={generateCsv.data.url}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  download
                >
                  <Download className="h-3 w-3" /> Download CSV
                </a>
              )}

              <div className="relative group">
                <Button variant="ghost" className="w-full" disabled>
                  <Mail className="h-4 w-4" /> Email Report
                </Button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block whitespace-nowrap">
                  Coming soon
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Right: Report Preview ── */}
        <div className="lg:col-span-2">
          {!selectedSessionId && (
            <Card className="flex flex-col items-center justify-center py-20">
              <Eye className="h-16 w-16 text-slate-200" />
              <p className="mt-4 text-sm text-slate-500">
                Select a session to preview report content.
              </p>
            </Card>
          )}

          {selectedSessionId && reportLoading && (
            <Card className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <p className="mt-3 text-sm text-slate-500">Loading report data…</p>
            </Card>
          )}

          {report && <ReportPreview report={report} options={options} />}
        </div>
      </div>
    </div>
  );
}

// ── Report Preview ──────────────────────────────────────────────

function ReportPreview({
  report,
  options,
}: {
  report: SessionReport;
  options: ReportOptions;
}) {
  const cadenceByStage = report.stages.map((s) => ({
    name: s.name,
    cadence: Math.round(s.avgCadence),
    symmetry: Math.round(s.avgSymmetry * 100),
  }));

  const fatigueByStage = report.stages.map((s) => ({
    name: s.name,
    fatigue: Math.round(s.fatigueDrift * 100),
    contactTime: Math.round(s.avgContactTime),
  }));

  return (
    <div className="space-y-6" data-testid="report-preview">
      {/* Header */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{report.athleteName}</h2>
            <p className="text-sm text-slate-500">
              {formatTimestamp(report.date)} — {report.stationName}
            </p>
            {report.protocolName && (
              <Badge variant="info" className="mt-1">
                {report.protocolName}
              </Badge>
            )}
          </div>
          <ValidationBadge status={report.validationStatus as never} />
        </div>
      </Card>

      {/* Key Metrics Grid */}
      {(options.cadenceSummary || options.contactFlightTime || options.symmetryAnalysis) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {options.cadenceSummary && (
            <MetricCard
              label="Avg Estimated Cadence"
              value={formatCadence(report.avgCadence)}
              confidence={report.avgCadenceConfidence}
            />
          )}
          {options.symmetryAnalysis && (
            <MetricCard
              label="Avg Symmetry Proxy"
              value={formatPercentage(report.avgSymmetryProxy)}
              confidence={report.avgSymmetryConfidence}
            />
          )}
          {options.contactFlightTime && (
            <>
              <MetricCard
                label="Avg Contact-Time Proxy"
                value={`${report.avgContactTimeProxy.toFixed(0)} ms`}
                confidence={report.avgContactTimeConfidence}
              />
              <MetricCard
                label="Flight-Time Proxy"
                value={`${report.avgFlightTimeProxy.toFixed(0)} ms`}
              />
            </>
          )}
          <MetricCard
            label="Form Stability Score"
            value={formatPercentage(report.formStabilityScore)}
          />
          {options.fatigueProgression && (
            <MetricCard
              label="Fatigue Drift Score"
              value={formatPercentage(report.fatigueDriftScore)}
            />
          )}
        </div>
      )}

      {/* Cadence by Stage Chart */}
      {options.cadenceSummary && cadenceByStage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Estimated Cadence by Stage</CardTitle>
          </CardHeader>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cadenceByStage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                  }}
                />
                <Bar dataKey="cadence" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Cadence (spm)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Fatigue Trend Chart */}
      {options.fatigueProgression && fatigueByStage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fatigue Drift Trend</CardTitle>
          </CardHeader>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fatigueByStage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="fatigue"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Fatigue Drift (%)"
                />
                <Line
                  type="monotone"
                  dataKey="contactTime"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  name="Contact-Time Proxy (ms)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Signal Quality */}
      {options.signalQualityLog && (
        <Card>
          <CardHeader>
            <CardTitle>Signal Quality Summary</CardTitle>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfidenceIndicator
              value={report.overallSignalQuality}
              label="Overall Signal Quality"
            />
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">High confidence</span>
                <span className="font-medium text-green-600">
                  {report.confidenceZones.highPercent.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Medium confidence</span>
                <span className="font-medium text-amber-600">
                  {report.confidenceZones.mediumPercent.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Low confidence</span>
                <span className="font-medium text-red-600">
                  {report.confidenceZones.lowPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Experimental Joint Angle Warning */}
      {options.jointAngleSummary && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <Badge variant="warning">Experimental</Badge>
            <div>
              <p className="text-sm font-medium text-amber-800">
                Joint Angle Summary — Experimental
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Joint angle estimates are derived from inferred motion models based on Wi-Fi CSI
                sensing. These are proxy estimates, not direct measurements. They have not been
                externally validated. Use with caution and do not rely on them for clinical
                decisions.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Scientific Disclaimer */}
      <Card className="bg-slate-50">
        <p className="text-xs font-medium text-slate-600">Scientific Disclaimer</p>
        <p className="mt-1 text-xs text-slate-500">
          All metrics shown are proxy estimates derived from Wi-Fi CSI sensing. They
          are not clinical-grade measurements. Refer to validation status and confidence
          indicators for reliability context.
        </p>
      </Card>
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────

function MetricCard({
  label,
  value,
  confidence,
}: {
  label: string;
  value: string;
  confidence?: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {confidence !== undefined && (
        <ConfidenceIndicator value={confidence} label="Confidence" className="mt-2" />
      )}
    </div>
  );
}

function ReportCheckbox({
  label,
  checked,
  onChange,
  experimental,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  experimental?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      <span className={cn('text-slate-700', experimental && 'italic')}>
        {label}
      </span>
      {experimental && (
        <Badge variant="warning" className="text-[10px] px-1.5 py-0">
          experimental
        </Badge>
      )}
    </label>
  );
}
