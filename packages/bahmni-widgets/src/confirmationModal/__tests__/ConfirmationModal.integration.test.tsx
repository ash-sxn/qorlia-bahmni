import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { StrictMode, useState } from 'react';
import ConfirmationModal from '../ConfirmationModal';

// Use the actual shared/Carbon modal: a mocked dialog cannot verify focus.
const Harness = ({
  conditional,
  link = false,
}: {
  conditional: boolean;
  link?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const dialog = (
    <ConfirmationModal
      open={open}
      danger
      heading="Remove test record"
      body="This synthetic test record will be marked void."
      confirmLabel="Remove"
      cancelLabel="Cancel"
      onConfirm={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
  return (
    <>
      {link ? (
        <a
          href="/search"
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          Review removal
        </a>
      ) : (
        <button onClick={() => setOpen(true)}>Review removal</button>
      )}
      {conditional ? open && dialog : dialog}
    </>
  );
};

describe.each([
  { conditional: true, strict: false },
  { conditional: false, strict: false },
  { conditional: true, strict: true },
  { conditional: false, strict: true },
  { conditional: true, strict: false, link: true },
  { conditional: false, strict: false, link: true },
  { conditional: true, strict: true, link: true },
  { conditional: false, strict: true, link: true },
])(
  'confirmation focus (conditional=$conditional, strict=$strict, link=$link)',
  ({ conditional, strict, link }) => {
    beforeEach(() => {
      // JSDOM has no layout. Give Carbon's real focus-wrap code the same visible
      // modal geometry it sees in a browser, rather than mocking the component.
      jest
        .spyOn(HTMLElement.prototype, 'offsetParent', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.closest('.cds--modal.is-visible')
            ? this.parentElement
            : null;
        });
    });
    afterEach(() => jest.restoreAllMocks());
    it.each(['Cancel', 'Close', 'Escape'])(
      'returns focus after %s',
      async (dismiss) => {
        const user = userEvent.setup();
        const content = <Harness conditional={conditional} link={link} />;
        render(strict ? <StrictMode>{content}</StrictMode> : content);
        const trigger = screen.getByRole(link ? 'link' : 'button', {
          name: 'Review removal',
        });
        await user.click(trigger);
        const cancel = screen.getByRole('button', { name: 'Cancel' });
        await waitFor(() => expect(cancel).toHaveFocus());
        if (dismiss === 'Escape') await user.keyboard('{Escape}');
        else
          await user.click(
            screen.getByRole('button', { name: dismiss, exact: true }),
          );
        await waitFor(() => expect(trigger).toHaveFocus());
        // Focus remains usable across another open/close cycle.
        await user.keyboard('{Enter}');
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus(),
        );
        await user.keyboard('{Escape}');
        await waitFor(() => expect(trigger).toHaveFocus());
      },
    );
  },
);
