import { describe, expect, it } from 'vitest';
import { calculateLines, cashSummary, invoiceStatus } from '../../src/services/businessFinance.js';
import { mapLegacyBusinessRecord } from '../../src/services/legacyBusinessMigration.js';

describe('business finance calculations',()=>{
  it('calculates discounts and tax in integer minor units without floating point totals',()=>{
    expect(calculateLines([{description:'Build',quantity:3,unitPriceMinor:1999,discountMinor:100,taxBps:1800}])).toMatchObject({subtotalMinor:5997,discountMinor:100,taxMinor:1061,totalMinor:6958});
  });
  it('rejects invalid quantity, discount and unsafe totals',()=>{
    expect(()=>calculateLines([{description:'x',quantity:0,unitPriceMinor:100}])).toThrow(/quantity/i);
    expect(()=>calculateLines([{description:'x',quantity:1,unitPriceMinor:100,discountMinor:101}])).toThrow(/discount/i);
    expect(()=>calculateLines([{description:'x',quantity:1_000_000,unitPriceMinor:Number.MAX_SAFE_INTEGER}])).toThrow(/range/i);
  });
  it('derives invoice state from paid balance and due date',()=>{
    const due=new Date('2027-01-01');expect(invoiceStatus(1000,0,due,new Date('2026-12-01'))).toBe('Issued');expect(invoiceStatus(1000,300,due)).toBe('Partially paid');expect(invoiceStatus(1000,1000,due)).toBe('Paid');expect(invoiceStatus(1000,0,due,new Date('2027-02-01'))).toBe('Overdue');expect(()=>invoiceStatus(1000,1001,due)).toThrow(/exceed/i);
  });
  it('keeps reports separated by currency and computes cash from recorded receipts only',()=>{
    expect(cashSummary({payments:[{currency:'INR',amountMinor:10000,date:new Date()}],expenses:[{currency:'INR',amountMinor:2500,date:new Date()}],invoices:[{currency:'INR',totalMinor:20000,paidMinor:10000,status:'Partially paid'},{currency:'USD',totalMinor:500,paidMinor:0,status:'Issued'}]})).toEqual([{currency:'INR',recordedIncomeMinor:10000,recordedExpensesMinor:2500,netCashMovementMinor:7500,receivablesMinor:10000,paidInvoiceCount:0,overdueInvoiceCount:0},{currency:'USD',recordedIncomeMinor:0,recordedExpensesMinor:0,netCashMovementMinor:0,receivablesMinor:500,paidInvoiceCount:0,overdueInvoiceCount:0}]);
  });
});

describe('legacy WorkspaceRecord compatibility mapping',()=>{
  const id='507f1f77bcf86cd799439011';
  it('maps known client fields without changing the source record ID',()=>{
    expect(mapLegacyBusinessRecord({_id:id,module:'clients',title:'Acme contact',fields:{company:'Acme Ltd',email:'A@EXAMPLE.TEST',phone:'123'}})).toMatchObject({collection:'BusinessClient',value:{legacySourceId:id,companyName:'Acme Ltd',contactPerson:'Acme contact',email:'a@example.test'}});
  });
  it('leaves legacy income and proposals for review instead of inventing verified financial data',()=>{
    expect(mapLegacyBusinessRecord({_id:id,module:'finance',title:'Income',fields:{kind:'income',amount:100}})).toMatchObject({issue:expect.stringContaining('verified cash')});
    expect(mapLegacyBusinessRecord({_id:id,module:'proposals',title:'Old quote',fields:{amount:100}})).toMatchObject({issue:expect.stringContaining('verified client')});
  });
  it('maps compatible legacy expense values to minor units and retains a trace ID',()=>{
    expect(mapLegacyBusinessRecord({_id:id,module:'finance',title:'Hosting',fields:{kind:'expense',amount:12.34,category:'Hosting'}})).toMatchObject({collection:'BusinessTransaction',value:{legacySourceId:id,amountMinor:1234,currency:'INR',kind:'expense'}});
  });
});
