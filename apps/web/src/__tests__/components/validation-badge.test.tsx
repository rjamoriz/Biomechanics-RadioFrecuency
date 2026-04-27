import { render, screen } from '@testing-library/react';
import { ValidationBadge } from '@/components/ui/validation-badge';

describe('ValidationBadge', () => {
  it('renders "Unvalidated" for unvalidated status', () => {
    render(<ValidationBadge status="unvalidated" />);
    expect(screen.getByText('Unvalidated')).toBeInTheDocument();
  });

  it('renders "Experimental" for experimental status', () => {
    render(<ValidationBadge status="experimental" />);
    expect(screen.getByText('Experimental')).toBeInTheDocument();
  });

  it('renders "Station Validated" for station_validated status', () => {
    render(<ValidationBadge status="station_validated" />);
    expect(screen.getByText('Station Validated')).toBeInTheDocument();
  });

  it('renders "Externally Validated" for externally_validated status', () => {
    render(<ValidationBadge status="externally_validated" />);
    expect(screen.getByText('Externally Validated')).toBeInTheDocument();
  });
});
