import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsPage from '@/app/reports/page';

// ── Mocks ───────────────────────────────────────────────────────

const MOCK_SESSIONS = [
  {
    id: 'sess-1',
    athleteName: 'Maria Lopez',
    stationName: 'Station Alpha',
    protocolName: '5-Stage Incremental',
    validationStatus: 'station-validated',
    startedAt: '2024-06-10T09:00:00Z',
    completedAt: '2024-06-10T09:30:00Z',
    durationSeconds: 1800,
  },
  {
    id: 'sess-2',
    athleteName: 'Carlos Ruiz',
    stationName: 'Station Beta',
    protocolName: null,
    validationStatus: 'unvalidated',
    startedAt: '2024-06-11T14:00:00Z',
    completedAt: '2024-06-11T14:20:00Z',
    durationSeconds: 1200,
  },
];

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn().mockImplementation((path: string) => {
    if (path.includes('/sessions?status=completed')) {
      return Promise.resolve(MOCK_SESSIONS);
    }
    if (path.includes('/report/export')) {
      return Promise.resolve({ url: 'https://example.com/report.pdf' });
    }
    if (path.includes('/report')) {
      return Promise.resolve({
        sessionId: 'sess-1',
        athleteName: 'Maria Lopez',
        stationName: 'Station Alpha',
        protocolName: '5-Stage Incremental',
        date: '2024-06-10T09:00:00Z',
        avgCadence: 172,
        avgCadenceConfidence: 0.89,
        avgSymmetryProxy: 0.95,
        avgSymmetryConfidence: 0.82,
        avgContactTimeProxy: 245,
        avgContactTimeConfidence: 0.78,
        avgFlightTimeProxy: 120,
        formStabilityScore: 0.91,
        fatigueDriftScore: 0.07,
        overallSignalQuality: 0.85,
        validationStatus: 'station-validated',
        stages: [
          {
            name: 'Warm-up',
            speedKmh: 6,
            inclinePercent: 0,
            durationSeconds: 300,
            avgCadence: 160,
            avgSymmetry: 0.94,
            avgContactTime: 260,
            fatigueDrift: 0.02,
          },
        ],
        confidenceZones: { highPercent: 72.5, mediumPercent: 22.1, lowPercent: 5.4 },
      });
    }
    return Promise.resolve({});
  }),
}));

// Stub Recharts to avoid jsdom dimension issues
jest.mock('recharts', () => ({
  __esModule: true,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: () => <div data-testid="bar-chart" />,
  Bar: () => null,
  LineChart: () => <div data-testid="line-chart" />,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

// ── Tests ───────────────────────────────────────────────────────

describe('ReportsPage', () => {
  it('renders the report page with heading', async () => {
    renderPage();
    expect(screen.getByText('Reports & Export')).toBeInTheDocument();
  });

  it('shows session list after loading', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Maria Lopez')).toBeInTheDocument();
    });

    expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument();
  });

  it('shows report configuration options', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('report-options')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/cadence summary/i)).toBeChecked();
    expect(screen.getByLabelText(/stride metrics/i)).toBeChecked();
    expect(screen.getByLabelText(/joint angle summary/i)).not.toBeChecked();
  });

  it('shows format selector with PDF and CSV options', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('format-selector')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('pdf');

    fireEvent.change(select, { target: { value: 'csv' } });
    expect(select).toHaveValue('csv');
  });

  it('has generate and export buttons that are disabled without session', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('export-actions')).toBeInTheDocument();
    });

    expect(screen.getByTestId('generate-pdf-btn')).toBeDisabled();
    expect(screen.getByTestId('export-csv-btn')).toBeDisabled();
  });
});
