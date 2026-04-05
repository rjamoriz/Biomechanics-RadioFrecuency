import { render, screen } from '@testing-library/react';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';

describe('ConfidenceIndicator', () => {
  it('shows green for value >= 0.8', () => {
    render(<ConfidenceIndicator value={0.9} />);
    expect(screen.getByText(/90%/)).toBeInTheDocument();
    expect(screen.getByText(/High/)).toBeInTheDocument();
  });

  it('shows amber for value between 0.5 and 0.79', () => {
    render(<ConfidenceIndicator value={0.65} />);
    expect(screen.getByText(/65%/)).toBeInTheDocument();
    expect(screen.getByText(/Medium/)).toBeInTheDocument();
  });

  it('shows red for value < 0.5', () => {
    render(<ConfidenceIndicator value={0.3} />);
    expect(screen.getByText(/30%/)).toBeInTheDocument();
    expect(screen.getByText(/Low/)).toBeInTheDocument();
  });

  it('shows percentage text', () => {
    render(<ConfidenceIndicator value={0.85} />);
    expect(screen.getByText(/85%/)).toBeInTheDocument();
  });
});
