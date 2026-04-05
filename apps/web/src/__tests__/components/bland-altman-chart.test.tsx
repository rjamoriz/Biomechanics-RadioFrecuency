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

import { BlandAltmanChart } from '@/components/bland-altman-chart';

const sampleData = [
  { reference: 170, estimated: 172 },
  { reference: 168, estimated: 167 },
  { reference: 175, estimated: 174 },
  { reference: 180, estimated: 183 },
  { reference: 165, estimated: 166 },
];

describe('BlandAltmanChart', () => {
  it('renders chart title with metric name', () => {
    render(<BlandAltmanChart data={sampleData} metricName="estimatedCadence" />);
    expect(screen.getByText(/Bland-Altman: estimatedCadence/)).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<BlandAltmanChart data={[]} metricName="cadence" />);
    expect(screen.getByText('No comparison data available')).toBeInTheDocument();
  });

  it('renders ScatterChart when data is provided', () => {
    render(<BlandAltmanChart data={sampleData} metricName="cadence" units="spm" />);
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
  });
});
