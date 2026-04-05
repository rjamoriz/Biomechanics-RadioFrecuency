import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

const mockUseProtocols = jest.fn();
jest.mock('@/hooks/use-protocols', () => ({
  useProtocols: () => mockUseProtocols(),
}));

import ProtocolsPage from '@/app/protocols/page';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Protocols Page', () => {
  it('renders loading state', () => {
    mockUseProtocols.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<ProtocolsPage />);
    expect(screen.getByText(/loading protocols/i)).toBeInTheDocument();
  });

  it('renders protocol cards', () => {
    mockUseProtocols.mockReturnValue({
      data: [
        {
          id: '1',
          name: 'VO2max Test',
          description: 'Incremental test',
          stages: [
            { name: 'Warm Up', durationSeconds: 300, speedKmh: 6, inclinePercent: 0, orderIndex: 0 },
            { name: 'Main', durationSeconds: 600, speedKmh: 12, inclinePercent: 2, orderIndex: 1 },
          ],
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });
    renderWithProviders(<ProtocolsPage />);
    expect(screen.getByText('VO2max Test')).toBeInTheDocument();
    expect(screen.getByText('Incremental test')).toBeInTheDocument();
  });

  it('has "New Protocol" link', () => {
    mockUseProtocols.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<ProtocolsPage />);
    expect(screen.getByText(/new protocol/i)).toBeInTheDocument();
  });
});
