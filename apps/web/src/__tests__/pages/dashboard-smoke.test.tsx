import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  usePathname: () => '/dashboard',
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Mock websocket hook
jest.mock('@/hooks/use-gateway-socket', () => ({
  useGatewaySocket: () => ({
    connected: false,
    demoMode: false,
    metrics: null,
    inferredFrame: null,
    vitalSigns: null,
    demoState: null,
    signalDiagnostics: null,
    setTreadmill: jest.fn(),
    sendDemoControl: jest.fn(),
  }),
}));

// Mock heavy child components
jest.mock('@/components/skeleton-viewer-card', () => ({
  SkeletonViewerCard: () => <div data-testid="skeleton-viewer" />,
}));
jest.mock('@/components/demo-control-panel', () => ({
  DemoControlPanel: () => <div data-testid="demo-control" />,
}));

// Mock fetch globally
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn().mockResolvedValue([]),
}));

import DashboardPage from '@/app/dashboard/page';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Dashboard — smoke test', () => {
  it('renders without crashing', () => {
    renderWithProviders(<DashboardPage />);
    // Page should render without throwing
    expect(document.body).toBeTruthy();
  });

  it('shows dashboard title', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });
});
