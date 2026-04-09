import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SignalAnalyticsPage from '@/app/signal-analytics/page';

// ── Mock Data ───────────────────────────────────────────────────

const MOCK_STATIONS = [
  { id: 'st-1', name: 'Station Alpha', location: 'Lab A', txMac: 'AA:BB:CC:DD:EE:01', rxMac: 'AA:BB:CC:DD:EE:02' },
  { id: 'st-2', name: 'Station Beta', location: 'Lab B', txMac: 'AA:BB:CC:DD:EE:03', rxMac: 'AA:BB:CC:DD:EE:04' },
];

const MOCK_ANALYTICS = {
  stationId: 'st-1',
  subcarrierHeatmap: [
    { timestamp: '2024-06-10T09:00:00Z', amplitudes: [10, 20, 15, 25] },
    { timestamp: '2024-06-10T09:00:10Z', amplitudes: [12, 18, 22, 19] },
  ],
  noiseFloorTimeline: [
    { timestamp: '2024-06-10T09:00:00Z', noiseFloorDbm: -92 },
    { timestamp: '2024-06-10T09:00:10Z', noiseFloorDbm: -90 },
  ],
  interferenceAlerts: [
    {
      id: 'alert-1',
      timestamp: '2024-06-10T09:05:00Z',
      severity: 'medium',
      message: 'Elevated noise on subcarriers 12-18',
      affectedSubcarriers: [12, 13, 14, 15, 16, 17, 18],
    },
  ],
  baselineComparison: {
    calibratedNoiseFloor: -95,
    currentNoiseFloor: -90,
    calibratedSignalQuality: 0.92,
    currentSignalQuality: 0.84,
    calibratedAt: '2024-06-01T08:00:00Z',
    driftPercent: 5.3,
  },
  overallSignalQuality: 0.84,
};

// ── Mocks ───────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn().mockImplementation((path: string) => {
    if (path === '/stations') {
      return Promise.resolve(MOCK_STATIONS);
    }
    if (path.includes('/signal-analytics')) {
      return Promise.resolve(MOCK_ANALYTICS);
    }
    return Promise.resolve({});
  }),
}));

jest.mock('@/hooks/use-stations', () => ({
  useStations: () => ({
    data: MOCK_STATIONS,
    isLoading: false,
    error: null,
  }),
}));

jest.mock('recharts', () => ({
  __esModule: true,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: () => <div data-testid="line-chart" />,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/signal-analytics',
  useSearchParams: () => new URLSearchParams(),
}));

// ── Helpers ─────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SignalAnalyticsPage />
    </QueryClientProvider>,
  );
}

// ── Tests ───────────────────────────────────────────────────────

describe('SignalAnalyticsPage', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByText('Signal Analytics')).toBeInTheDocument();
  });

  it('renders the station selector', () => {
    renderPage();
    const selector = screen.getByTestId('station-selector');
    expect(selector).toBeInTheDocument();
    expect(selector).toHaveValue('');
  });

  it('shows heatmap grid after selecting a station', async () => {
    renderPage();
    const selector = screen.getByTestId('station-selector');
    fireEvent.change(selector, { target: { value: 'st-1' } });

    await waitFor(() => {
      expect(screen.getByTestId('heatmap-grid')).toBeInTheDocument();
    });
  });

  it('shows time window controls with 10s, 30s, 60s buttons', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('station-selector'), {
      target: { value: 'st-1' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('time-window-controls')).toBeInTheDocument();
    });

    expect(screen.getByTestId('window-10s')).toBeInTheDocument();
    expect(screen.getByTestId('window-30s')).toBeInTheDocument();
    expect(screen.getByTestId('window-60s')).toBeInTheDocument();
  });

  it('shows noise chart area after station selection', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('station-selector'), {
      target: { value: 'st-1' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('noise-chart')).toBeInTheDocument();
    });
  });

  it('displays the sensing disclaimer', () => {
    renderPage();
    const disclaimer = screen.getByTestId('sensing-disclaimer');
    expect(disclaimer).toBeInTheDocument();
    expect(disclaimer).toHaveTextContent(
      /RF measurements, not optical data/,
    );
  });
});
