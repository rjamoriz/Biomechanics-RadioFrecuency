'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Label,
} from 'recharts';

interface DataPoint {
  reference: number;
  estimated: number;
}

interface BlandAltmanChartProps {
  data: DataPoint[];
  metricName: string;
  units?: string;
}

function computeStats(data: DataPoint[]) {
  if (data.length === 0) return { bias: 0, sd: 0, loaUpper: 0, loaLower: 0 };

  const diffs = data.map((d) => d.estimated - d.reference);
  const bias = diffs.reduce((sum, v) => sum + v, 0) / diffs.length;
  const variance =
    diffs.reduce((sum, v) => sum + (v - bias) ** 2, 0) / diffs.length;
  const sd = Math.sqrt(variance);

  return {
    bias,
    sd,
    loaUpper: bias + 1.96 * sd,
    loaLower: bias - 1.96 * sd,
  };
}

function toPlotData(data: DataPoint[]) {
  return data.map((d) => ({
    mean: (d.reference + d.estimated) / 2,
    diff: d.estimated - d.reference,
    absDiff: Math.abs(d.estimated - d.reference),
  }));
}

export function BlandAltmanChart({ data, metricName, units = '' }: BlandAltmanChartProps) {
  const stats = computeStats(data);
  const plotData = toPlotData(data);
  const unitSuffix = units ? ` (${units})` : '';

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        No comparison data available
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-slate-700">
        Bland-Altman: {metricName}
      </h4>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="mean" name="Mean" type="number">
            <Label
              value={`Mean of estimated & reference${unitSuffix}`}
              position="bottom"
              offset={10}
              style={{ fontSize: 12, fill: '#64748b' }}
            />
          </XAxis>
          <YAxis dataKey="diff" name="Difference" type="number">
            <Label
              value={`Difference (est − ref)${unitSuffix}`}
              angle={-90}
              position="insideLeft"
              offset={-5}
              style={{ fontSize: 12, fill: '#64748b' }}
            />
          </YAxis>
          <Tooltip
            formatter={(value: number) => value.toFixed(3)}
            labelFormatter={(label: number) => `Mean: ${label.toFixed(3)}`}
          />
          <ReferenceLine
            y={stats.bias}
            stroke="#2563eb"
            strokeDasharray="6 3"
            label={{ value: `Bias: ${stats.bias.toFixed(3)}`, position: 'right', fontSize: 11 }}
          />
          <ReferenceLine
            y={stats.loaUpper}
            stroke="#dc2626"
            strokeDasharray="4 4"
            label={{ value: `+1.96 SD: ${stats.loaUpper.toFixed(3)}`, position: 'right', fontSize: 10 }}
          />
          <ReferenceLine
            y={stats.loaLower}
            stroke="#dc2626"
            strokeDasharray="4 4"
            label={{ value: `−1.96 SD: ${stats.loaLower.toFixed(3)}`, position: 'right', fontSize: 10 }}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Scatter data={plotData} fill="#6366f1" fillOpacity={0.6} r={4} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
