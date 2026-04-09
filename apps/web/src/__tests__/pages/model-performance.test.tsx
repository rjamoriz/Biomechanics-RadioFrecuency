import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ModelPerformancePage from '@/app/model-performance/page';

// ── Mock Data ───────────────────────────────────────────────────

const MOCK_PERFORMANCE = {
  modelVersion: 'v2.4.1',
  lastTrainedAt: '2024-07-15T10:30:00Z',
  validationStatus: 'station-validated',
  accuracy: {
    cadenceMae: 1.82,
    strideRmse: 0.034,
    symmetryError: 0.028,
  },
  confidenceDistribution: {
    highPercent: 68.5,
    mediumPercent: 24.3,
    lowPercent: 7.2,
  },
  stations: [
    {
      stationId: 'st-1',
      stationName: 'Station Alpha',
      samplesCount: 1240,
      cadenceMae: 1.65,
      strideRmse: 0.031,
      overallConfidence: 0.87,
      health: 'healthy' as const,
    },
    {
      stationId: 'st-2',
      stationName: 'Station Beta',
      samplesCount: 890,
      cadenceMae: 2.1,
      strideRmse: 0.042,
      overallConfidence: 0.62,
      health: 'degraded' as const,
    },
  ],
  health: 'healthy' as const,
};

// ── Mocks ───────────────────────────────────────────────────────

let mockApiFetch: jest.Mock;

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('recharts', () => ({
  __esModule: true,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  usePathname: () => '/model-performance',
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ModelPerformancePage />
    </QueryClientProvider>,
  );
}

// ── Tests ───────────────────────────────────────────────────────

describe('ModelPerformancePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch = (require('@/lib/api') as { apiFetch: jest.Mock }).apiFetch;
  });

  it('renders the page heading', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText('Model Performance')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
  });

  it('shows model version after data loads', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PERFORMANCE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('model-version')).toHaveTextContent('v2.4.1');
    });
  });

  it('renders the confidence distribution chart area', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PERFORMANCE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('confidence-chart')).toBeInTheDocument();
    });

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders the per-station performance table', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PERFORMANCE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('station-table')).toBeInTheDocument();
    });

    expect(screen.getByText('Station Alpha')).toBeInTheDocument();
    expect(screen.getByText('Station Beta')).toBeInTheDocument();
  });

  it('displays the estimation warning banner', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PERFORMANCE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('estimation-warning')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Model metrics are estimated/),
    ).toBeInTheDocument();
  });
});
