import { describe, expect, it } from 'vitest';
import {
  computeNineSliceRegions,
  formatSlicePercent,
  mapSemanticConstraints,
  sliceFromPercent,
  validateSliceSettings,
} from '../src/nine-slice';

describe('validateSliceSettings', () => {
  it('accepts non-negative slices with at most one decimal place inside the image bounds', () => {
    expect(validateSliceSettings({ width: 100, height: 80 }, { top: 10.1, right: 12, bottom: 14, left: 16 })).toEqual({
      ok: true,
    });
  });

  it('rejects negative slice values and slices with more than one decimal place', () => {
    expect(validateSliceSettings({ width: 100, height: 80 }, { top: -1, right: 0, bottom: 0, left: 0 })).toEqual({
      ok: false,
      message: 'Slice values must be non-negative numbers with at most one decimal place.',
    });

    expect(validateSliceSettings({ width: 100, height: 80 }, { top: 1.23, right: 0, bottom: 0, left: 0 })).toEqual({
      ok: false,
      message: 'Slice values must be non-negative numbers with at most one decimal place.',
    });
  });

  it('rejects slices that consume the full width or height', () => {
    expect(validateSliceSettings({ width: 100, height: 80 }, { top: 10, right: 60, bottom: 10, left: 40 })).toEqual({
      ok: false,
      message: 'Left and right slices must leave a stretchable center width.',
    });

    expect(validateSliceSettings({ width: 100, height: 80 }, { top: 40, right: 10, bottom: 40, left: 10 })).toEqual({
      ok: false,
      message: 'Top and bottom slices must leave a stretchable center height.',
    });
  });
});

describe('computeNineSliceRegions', () => {
  it('returns source and destination rectangles for all nine regions', () => {
    expect(computeNineSliceRegions({ width: 100, height: 80 }, { top: 10, right: 20, bottom: 30, left: 15 })).toEqual([
      { key: 'topLeft', source: { x: 0, y: 0, width: 15, height: 10 }, destination: { x: 0, y: 0, width: 15, height: 10 }, constraints: { horizontal: 'left', vertical: 'top' } },
      { key: 'top', source: { x: 15, y: 0, width: 65, height: 10 }, destination: { x: 15, y: 0, width: 65, height: 10 }, constraints: { horizontal: 'stretch', vertical: 'top' } },
      { key: 'topRight', source: { x: 80, y: 0, width: 20, height: 10 }, destination: { x: 80, y: 0, width: 20, height: 10 }, constraints: { horizontal: 'right', vertical: 'top' } },
      { key: 'left', source: { x: 0, y: 10, width: 15, height: 40 }, destination: { x: 0, y: 10, width: 15, height: 40 }, constraints: { horizontal: 'left', vertical: 'stretch' } },
      { key: 'center', source: { x: 15, y: 10, width: 65, height: 40 }, destination: { x: 15, y: 10, width: 65, height: 40 }, constraints: { horizontal: 'stretch', vertical: 'stretch' } },
      { key: 'right', source: { x: 80, y: 10, width: 20, height: 40 }, destination: { x: 80, y: 10, width: 20, height: 40 }, constraints: { horizontal: 'right', vertical: 'stretch' } },
      { key: 'bottomLeft', source: { x: 0, y: 50, width: 15, height: 30 }, destination: { x: 0, y: 50, width: 15, height: 30 }, constraints: { horizontal: 'left', vertical: 'bottom' } },
      { key: 'bottom', source: { x: 15, y: 50, width: 65, height: 30 }, destination: { x: 15, y: 50, width: 65, height: 30 }, constraints: { horizontal: 'stretch', vertical: 'bottom' } },
      { key: 'bottomRight', source: { x: 80, y: 50, width: 20, height: 30 }, destination: { x: 80, y: 50, width: 20, height: 30 }, constraints: { horizontal: 'right', vertical: 'bottom' } },
    ]);
  });
});

describe('slice percentage conversion', () => {
  it('formats a slice value as the nearest percentage of its axis with at most one decimal place', () => {
    expect(formatSlicePercent(16, 64)).toBe('25');
    expect(formatSlicePercent(10, 80)).toBe('12.5');
    expect(formatSlicePercent(10.23, 80)).toBe('12.8');
  });

  it('converts editable percentages back to normalized one-decimal pixel slices', () => {
    expect(sliceFromPercent(12.5, 80, 0, 79)).toBe(10);
    expect(sliceFromPercent(33.39, 100, 0, 99)).toBe(33.3);
  });

  it('preserves a displayed percent value when it is committed without editing', () => {
    const displayedPercent = formatSlicePercent(16, 140);

    expect(sliceFromPercent(Number(displayedPercent), 140, 0, 139)).toBe(16);
  });

  it('keeps a committed percentage stable when another control syncs the display', () => {
    const committedSlice = sliceFromPercent(14, 143, 0, 142);

    expect(formatSlicePercent(committedSlice, 143)).toBe('14');
  });

  it('keeps percentage-derived slices unclamped so validation matches pixel input behavior', () => {
    expect(sliceFromPercent(90, 100, 0, 79)).toBe(90);
    expect(sliceFromPercent(-10, 100, 0, 99)).toBe(0);
  });
});

describe('mapSemanticConstraints', () => {
  it('maps semantic constraints to Figma and MasterGo values', () => {
    expect(mapSemanticConstraints('figma', { horizontal: 'left', vertical: 'bottom' })).toEqual({
      horizontal: 'MIN',
      vertical: 'MAX',
    });

    expect(mapSemanticConstraints('mastergo', { horizontal: 'stretch', vertical: 'stretch' })).toEqual({
      horizontal: 'STARTANDEND',
      vertical: 'STARTANDEND',
    });
  });
});
