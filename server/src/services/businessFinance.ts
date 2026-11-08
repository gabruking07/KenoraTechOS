export type MoneyLine = { description?: string; service?: string; quantity: number; unitPriceMinor: number; discountMinor?: number; taxBps?: number };

function safeMinor(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer in minor currency units.`);
  return value;
}

export function calculateLines(lines: MoneyLine[]) {
  if (!lines.length) throw new Error('At least one line item is required.');
  let subtotalMinor = 0, discountMinor = 0, taxMinor = 0;
  const normalized = lines.map((line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1_000_000) throw new Error('Line quantity must be a positive whole number.');
    const unit = safeMinor(line.unitPriceMinor, 'Unit price');
    const gross = unit * line.quantity;
    if (!Number.isSafeInteger(gross)) throw new Error('Line total exceeds the supported range.');
    const discount = safeMinor(line.discountMinor || 0, 'Discount');
    if (discount > gross) throw new Error('A line discount cannot exceed its line subtotal.');
    const taxBps = line.taxBps || 0;
    if (!Number.isSafeInteger(taxBps) || taxBps < 0 || taxBps > 100_000) throw new Error('Tax basis points are invalid.');
    const taxable = gross - discount;
    const lineTax = Number((BigInt(taxable) * BigInt(taxBps) + 5000n) / 10000n);
    subtotalMinor += gross; discountMinor += discount; taxMinor += lineTax;
    return { ...line, unitPriceMinor: unit, discountMinor: discount, taxBps, subtotalMinor: gross, taxMinor: lineTax, totalMinor: taxable + lineTax };
  });
  const totalMinor = subtotalMinor - discountMinor + taxMinor;
  if (![subtotalMinor, discountMinor, taxMinor, totalMinor].every(Number.isSafeInteger)) throw new Error('Document total exceeds the supported range.');
  return { lines: normalized, subtotalMinor, discountMinor, taxMinor, totalMinor };
}

export function invoiceStatus(totalMinor: number, paidMinor: number, dueDate: Date, now = new Date()) {
  safeMinor(totalMinor, 'Invoice total'); safeMinor(paidMinor, 'Payments');
  if (paidMinor > totalMinor) throw new Error('Recorded payments cannot exceed the invoice total.');
  if (paidMinor === totalMinor && totalMinor > 0) return 'Paid' as const;
  if (paidMinor > 0) return 'Partially paid' as const;
  return dueDate < now ? 'Overdue' as const : 'Issued' as const;
}

export function cashSummary(input: { payments: Array<{ currency: string; amountMinor: number; date: Date }>; expenses: Array<{ currency: string; amountMinor: number; date: Date }>; invoices: Array<{ currency: string; totalMinor: number; paidMinor: number; status: string }> }) {
  const currencies = [...new Set([...input.payments.map(x => x.currency), ...input.expenses.map(x => x.currency), ...input.invoices.map(x => x.currency)])].sort();
  return currencies.map(currency => {
    const payments = input.payments.filter(x => x.currency === currency), expenses = input.expenses.filter(x => x.currency === currency), invoices = input.invoices.filter(x => x.currency === currency);
    const sum = (items: Array<{ amountMinor: number }>) => items.reduce((n, item) => n + item.amountMinor, 0);
    const incomeMinor = sum(payments), expenseMinor = sum(expenses);
    return { currency, recordedIncomeMinor: incomeMinor, recordedExpensesMinor: expenseMinor, netCashMovementMinor: incomeMinor - expenseMinor,
      receivablesMinor: invoices.reduce((n, invoice) => n + invoice.totalMinor - invoice.paidMinor, 0), paidInvoiceCount: invoices.filter(x => x.status === 'Paid').length,
      overdueInvoiceCount: invoices.filter(x => x.status === 'Overdue').length };
  });
}
