import { describe, expect, it } from 'vitest';
import { safeLogPath } from '../../src/middleware/requestContext.js';

describe('request log path',()=>{
  it('excludes query parameters that may contain private search text',()=>{
    expect(safeLogPath({path:'/search',originalUrl:'/api/v1/search?q=private%20search%20term'} as any)).toBe('/api/v1/search');
  });
});
