import { render, screen } from '@testing-library/react';
import { SyntheticMotionWarning } from '@/components/ui/synthetic-motion-warning';

describe('SyntheticMotionWarning', () => {
  it('renders warning text about synthetic model-based rendering', () => {
    render(<SyntheticMotionWarning />);
    expect(
      screen.getByText('Synthetic Model-Based Rendering'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/synthetic model-based rendering inferred from Wi-Fi sensing/i),
    ).toBeInTheDocument();
  });

  it('renders "not a true camera" disclaimer', () => {
    render(<SyntheticMotionWarning />);
    expect(
      screen.getByText(/not a true camera or optical motion capture view/i),
    ).toBeInTheDocument();
  });
});
