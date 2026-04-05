import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Mock the hook
const mockUseAthletes = jest.fn();
jest.mock('@/hooks/use-athletes', () => ({
  useAthletes: () => mockUseAthletes(),
}));

import AthletesPage from '@/app/athletes/page';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Athletes Page', () => {
  it('renders loading state initially', () => {
    mockUseAthletes.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<AthletesPage />);
    expect(screen.getByText(/loading athletes/i)).toBeInTheDocument();
  });

  it('renders athlete cards after data loads', () => {
    mockUseAthletes.mockReturnValue({
      data: [
        {
          id: '1',
          firstName: 'Juan',
          lastName: 'Perez',
          email: 'juan@test.com',
          sport: 'Running',
          active: true,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });
    renderWithProviders(<AthletesPage />);
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
  });

  it('renders empty state when no athletes', () => {
    mockUseAthletes.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<AthletesPage />);
    expect(screen.getByText(/no athletes registered/i)).toBeInTheDocument();
  });

  it('has link to create new athlete', () => {
    mockUseAthletes.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<AthletesPage />);
    expect(screen.getByText(/add athlete/i)).toBeInTheDocument();
  });
});
