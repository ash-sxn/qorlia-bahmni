import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { InventoryPlanningIssue } from '../InventoryPlanningIssue';

const openTransfer = jest.fn();
const alert = (changes: Record<string, unknown> = {}) =>
  JSON.stringify({
    popoverTemplate: 'stock.PopoverStockRescheduling',
    delay_alert_date: '23 oct. 2026, 17:30:00',
    late_elements: [
      { id: 19, name: 'QorliaQA predecessor', model: 'stock.picking' },
    ],
    ...changes,
  });
function show(value: unknown, disabled = false) {
  return render(
    <InventoryPlanningIssue
      value={value}
      openTransfer={openTransfer}
      disabled={disabled}
    />,
  );
}
beforeEach(() => jest.clearAllMocks());

it.each([false, null, undefined, '', '{}', '{"msg":"no late documents"}'])(
  'shows no invented planning issue for %s',
  (value) => {
    expect(show(value).container).toBeEmptyDOMElement();
    expect(openTransfer).not.toHaveBeenCalled();
  },
);
it('preserves the server-localized date and opens only the specified native transfer', async () => {
  const view = show(alert());
  fireEvent.click(screen.getByText('Planning issue'));
  expect(
    screen.getByText('Preceding operations planned on 23 oct. 2026, 17:30:00.'),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open QorliaQA predecessor' }),
  );
  expect(openTransfer).toHaveBeenCalledTimes(1);
  expect(openTransfer).toHaveBeenCalledWith(19);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect((await axe(view.container)).violations).toEqual([]);
});
it('does not execute native markup, injected templates or visual configuration', () => {
  const name = '<img src=x onerror=alert(1)>',
    date = '<script>bad()</script>';
  const view = show(
    alert({
      delay_alert_date: date,
      icon: '<svg onload=alert(1)>',
      color: 'malicious-class',
      late_elements: [{ id: 19, name, model: 'stock.picking' }],
    }),
  );
  fireEvent.click(screen.getByText('Planning issue'));
  expect(
    screen.getByRole('button', { name: `Open ${name}` }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(`Preceding operations planned on ${date}.`),
  ).toBeInTheDocument();
  expect(
    view.container.querySelector('script,img,svg,.malicious-class'),
  ).toBeNull();
});
it('reports unsupported native document destinations without a legacy fallback', () => {
  show(
    alert({
      late_elements: [
        { id: 20, name: 'QorliaQA production', model: 'mrp.production' },
      ],
    }),
  );
  fireEvent.click(screen.getByText('Planning issue'));
  expect(
    screen.getByText(
      /QorliaQA production: the native mrp.production destination is not integrated/,
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(openTransfer).not.toHaveBeenCalled();
});
it('does not navigate when disabled for a pending review or request', () => {
  show(alert(), true);
  fireEvent.click(screen.getByText('Planning issue'));
  const button = screen.getByRole('button', {
    name: 'Open QorliaQA predecessor',
  });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(openTransfer).not.toHaveBeenCalled();
});
it('does not invent a document when the native predecessor list is empty', () => {
  show(alert({ late_elements: [] }));
  fireEvent.click(screen.getByText('Planning issue'));
  expect(
    screen.getByText(
      'No preceding documents were included in this native alert.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it.each([
  'bad JSON',
  'null',
  '[]',
  alert({ popoverTemplate: '<script>bad()</script>' }),
  alert({ delay_alert_date: false }),
  alert({ late_elements: {} }),
  ...[
    null,
    [],
    { id: 0 },
    { id: '19' },
    { id: -1 },
    { id: 1.2 },
    { id: 9007199254740992 },
    { name: false },
    { model: 'javascript:bad()' },
  ].map((row) =>
    alert({
      late_elements: [
        row && !Array.isArray(row)
          ? {
              id: 19,
              name: 'QorliaQA predecessor',
              model: 'stock.picking',
              ...row,
            }
          : row,
      ],
    }),
  ),
  alert({
    late_elements: Array.from({ length: 2 }, () => ({
      id: 19,
      name: 'duplicate',
      model: 'stock.picking',
    })),
  }),
])(
  'rejects malformed planning data without opening a document: %s',
  (value) => {
    show(value);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Native planning details could not be displayed.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(openTransfer).not.toHaveBeenCalled();
  },
);
