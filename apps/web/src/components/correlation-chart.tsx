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

interface CorrelationChartProps {
  data: DataPoint[];
  metricName: string;
  units?: string;
}

function computeR2(data: DataPoint[]): number {
  if (data.length < 2) return 0;
  const n = data.length;
  const sumX = data.reduce((s, d) => s + d.reference, 0);
  const sumY = data.reduce((s, d) => s + d.estimated, 0);
  const sumXY = data.reduce((s, d) => s + d.reference * d.estimated, 0);
  const sumX2 = data.reduce((s, d) => s + d.reference ** 2, 0);
  const sumY2 = data.reduce((s, d) => s + d.estimated ** 2, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2),
  );
  if (denominator === 0) return 0;
  const r = numerator / denominator;
  return r * r;
}

function computeRegression(data: DataPoint[]) {
  if (data.length < 2) return { slope: 1, intercept: 0 };
  const n = data.length;
  const sumX = data.reduce((s, d) => s + d.reference, 0);
  const sumY = data.reduce((s, d) => s + d.estimated, 0);
  const sumXY = data.reduce((s, d) => s + d.reference * d.estimated, 0);
  const sumX2 = data.reduce((s, d) => s + d.reference ** 2, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function CorrelationChart({ data, metricName, units = '' }: CorrelationChartProps) {
  const r2 = computeR2(data);
  const unitSuffix = units ? ` (${units})` : '';

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        No comparison data available
      </div>
    );
  }

  const allValues = data.flatMap((d) => [d.reference, d.estimated]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const padding = (max - min) * 0.05 || 1;
  const domainMin = min - padding;
  const domainMax = max + padding;

  const reg = computeRegression(data);
  const regressionData = [
    { reference: domainMin, estimated: reg.slope * domainMin + reg.intercept },
    { reference: domainMax, estimated: reg.slope * domainMax + reg.intercept },
  ];

  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-slate-700">
        Correlation: {metricName}{' '}
        <span className="font-normal text-slate-500">r² = {r2.toFixed(3)}</span>
      </h4>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="reference"
            name="Reference"
            type="number"
            domain={[domainMin, domainMax]}
          >
            <Label
              value={`Reference${unitSuffix}`}
              position="bottom"
              offset={10}
              style={{ fontSize: 12, fill: '#64748b' }}
            />
          </XAxis>
          <YAxis
            dataKey="estimated"
            name="Estimated"
            type="number"
            domain={[domainMin, domainMax]}
          >
            <Label
              value={`Estimated${unitSuffix}`}
              angle={-90}
              position="insideLeft"
              offset={-5}
              style={{ fontSize: 12, fill: '#64748b' }}
            />
          </YAxis>
          <Tooltip
            formatter={(value: number) => value.toFixed(3)}
          />
          {/* Perfect agreement line (y = x) */}
          <ReferenceLine
            segment={[
              { x: domainMin, y: domainMin },
              { x: domainMax, y: domainMax },
            ]}
            stroke="#94a3b8"
            strokeDasharray="6 3"
            label={{ value: 'y = x', position: 'insideTopLeft', fontSize: 10 }}
          />
          {/* Data points */}
          <Scatter data={data} fill="#6366f1" fillOpacity={0.6} r={4} />
          {/* Linear regression line */}
          <Scatter
            data={regressionData}
            fill="none"
            line={{ stroke: '#dc2626', strokeWidth: 2, strokeDasharray: '4 2' }}
            shape={<></>}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
