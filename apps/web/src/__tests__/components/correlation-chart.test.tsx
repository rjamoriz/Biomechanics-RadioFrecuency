import { render, screen } from '@testing-library/react';

// Mock Recharts to avoid SVG rendering in jsdom
jest.mock('recharts', () => ({
  ScatterChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scatter-chart">{children}</div>
  ),
  Scatter: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Label: () => null,
}));

import { CorrelationChart } from '@/components/correlation-chart';

const sampleData = [
  { reference: 170, estimated: 172 },
  { reference: 168, estimated: 167 },
  { reference: 175, estimated: 174 },
  { reference: 180, estimated: 183 },
  { reference: 165, estimated: 166 },
];

describe('CorrelationChart', () => {
  it('renders chart title with metric name and r²', () => {
    render(<CorrelationChart data={sampleData} metricName="estimatedCadence" />);
    expect(screen.getByText(/Correlation: estimatedCadence/)).toBeInTheDocument();
    expect(screen.getByText(/r² =/)).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<CorrelationChart data={[]} metricName="cadence" />);
    expect(screen.getByText('No comparison data available')).toBeInTheDocument();
  });

  it('renders ScatterChart when data is provided', () => {
    render(<CorrelationChart data={sampleData} metricName="cadence" units="spm" />);
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
  });
});
