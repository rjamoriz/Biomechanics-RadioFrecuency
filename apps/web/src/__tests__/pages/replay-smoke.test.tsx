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

// Mock TanStack query hooks used by the page
jest.mock('@/hooks/use-sessions', () => ({
  useSession: () => ({
    data: {
      id: 'test-session-1',
      athleteName: 'Test Runner',
      stationName: 'Station A',
      status: 'completed',
      validationStatus: 'unvalidated',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    isLoading: false,
  }),
}));

// Mock Recharts to avoid rendering SVG in jsdom
jest.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceArea: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock replay data fetch
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn().mockResolvedValue([]),
}));

import ReplayPage from '@/app/sessions/[id]/replay/page';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Replay Page — smoke test', () => {
  it('renders without crashing', () => {
    renderWithProviders(<ReplayPage />);
    expect(document.body).toBeTruthy();
  });

  it('shows Replay title', () => {
    renderWithProviders(<ReplayPage />);
    expect(screen.getByRole('heading', { name: /replay/i })).toBeInTheDocument();
  });
});
