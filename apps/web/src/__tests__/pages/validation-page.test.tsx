import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useParams: () => ({ id: 'test-session-1' }),
}));

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

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

jest.mock('@/hooks/use-validation', () => ({
  useValidation: () => ({
    references: [
      {
        id: 'ref-1',
        sessionId: 'test-session-1',
        referenceType: 'imu_csv',
        fileName: 'imu_data.csv',
        uploadedAt: '2026-04-01T10:30:00Z',
        rowCount: 5000,
        timeRangeStartMs: 0,
        timeRangeEndMs: 300000,
        columns: ['timestamp', 'accel_x'],
        status: 'aligned',
      },
    ],
    comparisons: [
      {
        id: 'cmp-1',
        sessionId: 'test-session-1',
        referenceId: 'ref-1',
        metric: 'estimatedCadence',
        meanAbsoluteError: 2.1,
        rootMeanSquareError: 2.8,
        correlationCoefficient: 0.93,
        biasEstimate: -0.3,
        limitsOfAgreement: { lower: -5.5, upper: 4.9 },
        sampleCount: 500,
        validationStatus: 'experimental',
        computedAt: '2026-04-01T11:00:00Z',
      },
    ],
    summary: {
      sessionId: 'test-session-1',
      references: [],
      comparisons: [],
      overallStatus: 'validated',
      bestCorrelation: 0.93,
      worstMetric: 'contactTimeProxy',
    },
    uploadReference: { mutate: jest.fn(), isPending: false, isSuccess: false, isError: false },
    triggerComparison: { mutate: jest.fn(), isPending: false },
    isLoading: false,
    error: null,
  }),
}));

import ValidationPage from '@/app/sessions/[id]/validation/page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ValidationPage />
    </QueryClientProvider>,
  );
}

describe('ValidationPage', () => {
  it('renders the page header', () => {
    renderPage();
    expect(screen.getByText('Validation Workflow')).toBeInTheDocument();
  });

  it('renders tab navigation', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alignment' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Results' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Summary' })).toBeInTheDocument();
  });

  it('shows uploaded references table by default', () => {
    renderPage();
    expect(screen.getByText('imu_data.csv')).toBeInTheDocument();
    expect(screen.getAllByText('IMU CSV').length).toBeGreaterThanOrEqual(1);
  });

  it('shows overall status badge', () => {
    renderPage();
    expect(screen.getByText('Validated')).toBeInTheDocument();
  });
});
