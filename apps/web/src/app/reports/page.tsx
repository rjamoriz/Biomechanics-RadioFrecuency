'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  type ColumnDef,
  flexRender,
} from '@tanstack/react-table';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  formatCadence,
  formatConfidence,
  formatDuration,
  formatTimestamp,
  formatSpeed,
  formatIncline,
} from '@/lib/format';
import {
  BarChart3,
  FileText,
  Eye,
  Printer,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
  }>;
  confidenceZones: {
    highPercent: number;
    mediumPercent: number;
    lowPercent: number;
  };
}

// ── Main Component ──────────────────────────────────────────────

export default function ReportsPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

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

  const columns = useMemo<ColumnDef<CompletedSession>[]>(
    () => [
      {
        accessorKey: 'startedAt',
        header: ({ column }) => (
          <SortableHeader column={column} label="Date" />
        ),
        cell: ({ getValue }) => (
          <span className="text-sm">{formatTimestamp(getValue() as string)}</span>
        ),
      },
      {
        accessorKey: 'athleteName',
        header: ({ column }) => (
          <SortableHeader column={column} label="Athlete" />
        ),
        cell: ({ getValue }) => (
          <span className="text-sm font-medium text-slate-900">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'protocolName',
        header: 'Protocol',
        cell: ({ getValue }) => (
          <span className="text-sm text-slate-600">
            {(getValue() as string | null) ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'durationSeconds',
        header: ({ column }) => (
          <SortableHeader column={column} label="Duration" />
        ),
        cell: ({ getValue }) => (
          <span className="text-sm">{formatDuration(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'validationStatus',
        header: 'Validation',
        cell: ({ getValue }) => (
          <ValidationBadge status={getValue() as never} />
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedSessionId(row.original.id)}
          >
            <Eye className="h-4 w-4" /> View Report
          </Button>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: sessions ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
      </div>

      {/* Loading */}
      {isLoading && (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">Loading completed sessions...</p>
        </Card>
      )}

      {/* Empty */}
      {sessions && sessions.length === 0 && (
        <Card className="py-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">
            No completed sessions available for reports.
          </p>
        </Card>
      )}

      {/* Table */}
      {sessions && sessions.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-slate-200 bg-slate-50">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-xs font-medium uppercase text-slate-500"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report Dialog */}
      <Dialog
        open={!!selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
        title="Session Report"
      >
        {reportLoading && (
          <p className="py-8 text-center text-sm text-slate-500">
            Loading report...
          </p>
        )}
        {report && <ReportContent report={report} />}
      </Dialog>
    </div>
  );
}

// ── Sortable Header ─────────────────────────────────────────────

function SortableHeader({ column, label }: { column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: () => void }; label: string }) {
  const sorted = column.getIsSorted();
  return (
    <button
      className="flex items-center gap-1 text-xs font-medium uppercase text-slate-500 hover:text-slate-700"
      onClick={() => column.toggleSorting()}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

// ── Report Content ──────────────────────────────────────────────

function ReportContent({ report }: { report: SessionReport }) {
  const handlePrint = () => window.print();

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
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
        <Button
          variant="secondary"
          size="sm"
          onClick={handlePrint}
          className="print:hidden"
        >
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      {/* Summary Metrics 2x3 grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Avg Cadence"
          value={formatCadence(report.avgCadence)}
          confidence={report.avgCadenceConfidence}
        />
        <MetricCard
          label="Avg Symmetry Proxy"
          value={`${(report.avgSymmetryProxy * 100).toFixed(1)}%`}
          confidence={report.avgSymmetryConfidence}
        />
        <MetricCard
          label="Avg Contact-Time Proxy"
          value={`${report.avgContactTimeProxy.toFixed(0)} ms`}
          confidence={report.avgContactTimeConfidence}
        />
        <MetricCard
          label="Flight-Time Proxy"
          value={`${report.avgFlightTimeProxy.toFixed(0)} ms`}
        />
        <MetricCard
          label="Form Stability Score"
          value={`${(report.formStabilityScore * 100).toFixed(1)}%`}
        />
        <MetricCard
          label="Fatigue Drift Score"
          value={`${(report.fatigueDriftScore * 100).toFixed(1)}%`}
        />
      </div>

      {/* Per-stage breakdown */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">
          Per-Stage Breakdown
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Speed</th>
                <th className="px-3 py-2">Incline</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Cadence</th>
                <th className="px-3 py-2">Symmetry</th>
              </tr>
            </thead>
            <tbody>
              {report.stages.map((s, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                  <td className="px-3 py-2">{formatSpeed(s.speedKmh)}</td>
                  <td className="px-3 py-2">{formatIncline(s.inclinePercent)}</td>
                  <td className="px-3 py-2">{formatDuration(s.durationSeconds)}</td>
                  <td className="px-3 py-2">{formatCadence(s.avgCadence)}</td>
                  <td className="px-3 py-2">{(s.avgSymmetry * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signal quality summary */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">
          Signal Quality Summary
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <ConfidenceIndicator
              value={report.overallSignalQuality}
              label="Overall Signal Quality"
            />
          </div>
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
      </div>

      {/* Validation */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Validation:</span>
        <ValidationBadge status={report.validationStatus as never} />
      </div>

      {/* Scientific Disclaimer */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 print:border-none">
        <p className="font-medium text-slate-600">Scientific Disclaimer</p>
        <p className="mt-1">
          Metrics shown are proxy estimates derived from Wi-Fi CSI sensing. They
          are not clinical-grade measurements. Refer to validation status and
          confidence indicators for reliability context.
        </p>
      </div>
    </div>
  );
}

// ── Metric Card ─────────────────────────────────────────────────

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
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {confidence !== undefined && (
        <ConfidenceIndicator value={confidence} label="Confidence" className="mt-2" />
      )}
    </div>
  );
}
