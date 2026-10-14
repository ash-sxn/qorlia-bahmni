export const invoiceName = (invoice: {
  id: number | false;
  name: string | false;
  move_type?: string;
}) =>
  invoice.name && invoice.name !== '/'
    ? invoice.name
    : invoice.id === false
      ? 'New invoice'
      : `${invoice.move_type === 'out_refund' ? 'Draft credit note' : 'Draft invoice'} #${invoice.id}`;

export const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};
