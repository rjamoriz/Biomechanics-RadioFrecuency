import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Mock hooks used by calibration page
jest.mock('@/hooks/use-stations', () => ({
  useStations: () => ({
    data: [
      { id: 's1', name: 'Station Alpha', location: 'Gym A', active: true, createdAt: new Date().toISOString() },
    ],
    isLoading: false,
  }),
}));

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn().mockResolvedValue({ signalQualityScore: 0.8, noiseFloor: 0.1, packetRate: 50 }),
}));

import CalibrationPage from '@/app/calibration/page';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Calibration Page — smoke test', () => {
  it('renders without crashing', () => {
    renderWithProviders(<CalibrationPage />);
    expect(document.body).toBeTruthy();
  });

  it('shows calibration title', () => {
    renderWithProviders(<CalibrationPage />);
    expect(screen.getByText(/calibration/i)).toBeInTheDocument();
  });
});
