import { describe, expect, it } from 'vitest';
import { nextScheduledOccurrence } from '../../src/services/automationScheduler.js';

describe('automation schedule calculation',()=>{
  it('computes the next daily run in the selected time zone',()=>{
    expect(nextScheduledOccurrence({frequency:'daily',timezone:'Asia/Kolkata',localTime:'09:30'},new Date('2026-01-01T02:00:00.000Z')).toISOString()).toBe('2026-01-01T04:00:00.000Z');
  });
  it('selects the configured weekday for weekly schedules',()=>{
    expect(nextScheduledOccurrence({frequency:'weekly',timezone:'Asia/Kolkata',localTime:'09:30',dayOfWeek:1},new Date('2027-01-01T10:00:00.000Z')).toISOString()).toBe('2027-01-04T04:00:00.000Z');
  });
  it('uses monthly days 1 through 28 to avoid missing short months',()=>{
    expect(nextScheduledOccurrence({frequency:'monthly',timezone:'UTC',localTime:'08:15',dayOfMonth:28},new Date('2026-02-28T08:16:00.000Z')).toISOString()).toBe('2026-03-28T08:15:00.000Z');
  });
  it('skips nonexistent daylight-saving local times and rejects invalid zones',()=>{
    expect(nextScheduledOccurrence({frequency:'daily',timezone:'America/New_York',localTime:'02:30'},new Date('2026-03-08T06:00:00.000Z')).toISOString()).toBe('2026-03-09T06:30:00.000Z');
    expect(()=>nextScheduledOccurrence({frequency:'weekly',timezone:'No/SuchZone',localTime:'09:00',dayOfWeek:1},new Date())).toThrow(/time zone/i);
  });
});
