import { describe, expect, it } from 'vitest';

import { getInsertIndexAboveSource } from '../src/platform/layer-order';

describe('getInsertIndexAboveSource', () => {
  it('returns the index directly above the source node', () => {
    const source = { id: 'source' };
    const parent = {
      children: [{ id: 'below' }, source, { id: 'above' }],
    };

    expect(getInsertIndexAboveSource(parent, source)).toBe(2);
  });

  it('appends when the source cannot be found in its parent', () => {
    const source = { id: 'source' };
    const parent = {
      children: [{ id: 'only-child' }],
    };

    expect(getInsertIndexAboveSource(parent, source)).toBe(1);
  });
});
