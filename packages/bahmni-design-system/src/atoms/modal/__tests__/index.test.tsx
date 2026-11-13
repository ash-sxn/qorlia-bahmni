import { fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Modal } from '../index';

expect.extend(toHaveNoViolations);

describe('Shared modal accessibility', () => {
  it('keeps its native dialog name and includes focus sentinels in a named dialog region', async () => {
    const close = jest.fn();
    render(
      <Modal
        open
        passiveModal
        modalHeading="Review transfer"
        onRequestClose={close}
      >
        <p>Review the native stock action.</p>
      </Modal>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Review transfer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Review transfer dialog' }),
    ).toBeInTheDocument();
    expect(await axe(document.body)).toHaveNoViolations();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('does not create an empty landmark when the dialog is closed', () => {
    render(
      <Modal open={false} passiveModal modalHeading="Review transfer">
        <p>Closed content</p>
      </Modal>,
    );
    expect(screen.getByTestId('modal-root-test-id')).not.toHaveAttribute(
      'role',
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    // Carbon retains dialog DOM for CSS transitions; this check covers the wrapper's semantics.
    expect(screen.getByTestId('modal-root-test-id')).not.toHaveAttribute(
      'aria-label',
    );
  });
});
