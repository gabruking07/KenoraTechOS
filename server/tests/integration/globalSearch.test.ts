import { describe, expect, it } from 'vitest';
import { literalSearchPattern, normalizeSearchQuery } from '../../src/services/globalSearch.js';

describe('global search input handling', () => {
  it('requires bounded printable literal search text', () => {
    expect(normalizeSearchQuery('  Kenora  ')).toBe('Kenora');
    expect(normalizeSearchQuery(' ')).toBeNull();
    expect(normalizeSearchQuery('x'.repeat(101))).toBeNull();
    expect(normalizeSearchQuery('A\nB')).toBeNull();
    expect(normalizeSearchQuery({})).toBeNull();
  });

  it('treats regex metacharacters as literal text', () => {
    expect(literalSearchPattern('a.*b').test('aZZb')).toBe(false);
    expect(literalSearchPattern('a.*b').test('a.*b')).toBe(true);
  });
});
