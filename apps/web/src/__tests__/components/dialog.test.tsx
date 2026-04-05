import { render, screen } from '@testing-library/react';
import { Dialog } from '@/components/ui/dialog';

// HTMLDialogElement.showModal / .close are not implemented in jsdom
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

describe('Dialog', () => {
  it('renders children when open', () => {
    render(
      <Dialog open onClose={jest.fn()} title="Confirm">
        <p>Are you sure?</p>
      </Dialog>,
    );
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('does not show content when closed', () => {
    const { container } = render(
      <Dialog open={false} onClose={jest.fn()} title="Hidden">
        <p>Secret</p>
      </Dialog>,
    );
    const dialog = container.querySelector('dialog');
    expect(dialog).not.toHaveAttribute('open');
  });

  it('displays the title', () => {
    render(
      <Dialog open onClose={jest.fn()} title="Delete Item">
        <p>Content</p>
      </Dialog>,
    );
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
  });
});
