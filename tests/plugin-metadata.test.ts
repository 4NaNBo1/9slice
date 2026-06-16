import { describe, expect, it } from 'vitest';

import { compareVersions, latestReleaseUrl, shouldShowUpdate } from '../src/plugin-metadata';

describe('compareVersions', () => {
  it('orders semantic version strings by numeric segments', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });
});

describe('shouldShowUpdate', () => {
  it('only reports updates newer than the current version', () => {
    expect(shouldShowUpdate('v1.0.1', '1.0.0')).toEqual({ version: '1.0.1', tag: 'v1.0.1' });
    expect(shouldShowUpdate('1.0.0', '1.0.0')).toBeUndefined();
    expect(shouldShowUpdate('', '1.0.0')).toBeUndefined();
  });
});

describe('latestReleaseUrl', () => {
  it('builds a GitHub release URL for the selected tag', () => {
    expect(latestReleaseUrl('4NaNBo1', '9slice', 'v1.0.1')).toBe('https://github.com/4NaNBo1/9slice/releases/tag/v1.0.1');
  });
});
