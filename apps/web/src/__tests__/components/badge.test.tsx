import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders default variant', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-slate-100', 'text-slate-700');
  });

  it('renders success variant with correct classes', () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText('Success');
    expect(badge).toHaveClass('bg-green-50', 'text-green-700');
  });

  it('renders warning variant with correct classes', () => {
    render(<Badge variant="warning">Warning</Badge>);
    const badge = screen.getByText('Warning');
    expect(badge).toHaveClass('bg-amber-50', 'text-amber-700');
  });

  it('renders danger variant with correct classes', () => {
    render(<Badge variant="danger">Danger</Badge>);
    const badge = screen.getByText('Danger');
    expect(badge).toHaveClass('bg-red-50', 'text-red-700');
  });

  it('renders children text', () => {
    render(<Badge>Hello World</Badge>);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
});
