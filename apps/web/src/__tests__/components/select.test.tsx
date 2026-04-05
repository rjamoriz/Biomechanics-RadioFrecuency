import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from '@/components/ui/select';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Charlie' },
];

describe('Select', () => {
  it('renders label', () => {
    render(<Select label="Pick one" options={options} />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('renders all options', () => {
    render(<Select label="Pick one" options={options} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Select label="Pick one" options={options} error="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('handles change', () => {
    const onChange = jest.fn();
    render(<Select label="Pick one" options={options} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalled();
  });
});
