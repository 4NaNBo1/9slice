import { describe, expect, it } from 'vitest';
import {
  computeDefaultSliceSettings,
  computeNineSliceRegions,
  inferSliceSettingsFromRegionNodes,
  formatSlicePercent,
  mapSemanticConstraints,
  parseNineSliceMetadata,
  serializeNineSliceMetadata,
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

describe('computeDefaultSliceSettings', () => {
  it('keeps the existing size-based default when no rounded-corner signal is available', () => {
    expect(computeDefaultSliceSettings({ width: 100, height: 80 })).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    expect(computeDefaultSliceSettings({ width: 12, height: 8 })).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
  });

  it('keeps tiny image defaults inside valid slice bounds', () => {
    expect(computeDefaultSliceSettings({ width: 2, height: 2 })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('derives side slices from the largest adjacent explicit corner radius', () => {
    expect(
      computeDefaultSliceSettings(
        { width: 100, height: 80 },
        {
          cornerRadii: {
            topLeft: 24,
            topRight: 8,
            bottomRight: 12,
            bottomLeft: 18,
          },
        },
      ),
    ).toEqual({ top: 24, right: 12, bottom: 18, left: 24 });
  });

  it('derives rounded sides from transparent corner pixels when explicit radii are unavailable', () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const setAlpha = (x: number, y: number, alpha: number) => {
      data[(y * width + x) * 4 + 3] = alpha;
    };

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        setAlpha(x, y, 0);
      }
    }

    for (let y = 0; y < 7; y += 1) {
      for (let x = width - 4; x < width; x += 1) {
        setAlpha(x, y, 128);
      }
    }

    expect(computeDefaultSliceSettings({ width, height }, { alphaData: { width, height, data } })).toEqual({
      top: 7,
      right: 4,
      bottom: 0,
      left: 6,
    });
  });

  it('does not treat transparent padding around rounded content as the full corner radius', () => {
    const width = 100;
    const height = 50;
    const data = new Uint8ClampedArray(width * height * 4);
    const setAlpha = (x: number, y: number, alpha: number) => {
      data[(y * width + x) * 4 + 3] = alpha;
    };

    for (let y = 5; y < 45; y += 1) {
      for (let x = 20; x < 80; x += 1) {
        setAlpha(x, y, 255);
      }
    }

    for (let y = 5; y < 15; y += 1) {
      for (let x = 20; x < 32; x += 1) setAlpha(x, y, 0);
      for (let x = 66; x < 80; x += 1) setAlpha(x, y, 0);
    }

    for (let y = 37; y < 45; y += 1) {
      for (let x = 20; x < 32; x += 1) setAlpha(x, y, 0);
      for (let x = 66; x < 80; x += 1) setAlpha(x, y, 0);
    }

    expect(computeDefaultSliceSettings({ width, height }, { alphaData: { width, height, data } })).toEqual({
      top: 15,
      right: 34,
      bottom: 13,
      left: 32,
    });
  });

  it('combines explicit radii and alpha-derived rounded corners conservatively', () => {
    const width = 30;
    const height = 24;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);

    for (let y = height - 9; y < height; y += 1) {
      for (let x = width - 11; x < width; x += 1) {
        data[(y * width + x) * 4 + 3] = 0;
      }
    }

    expect(
      computeDefaultSliceSettings(
        { width, height },
        {
          cornerRadii: { topLeft: 8, topRight: 4, bottomRight: 0, bottomLeft: 6 },
          alphaData: { width, height, data },
        },
      ),
    ).toEqual({ top: 8, right: 11, bottom: 9, left: 8 });
  });

  it('clamps rounded defaults to leave a stretchable center area', () => {
    expect(
      computeDefaultSliceSettings(
        { width: 30, height: 20 },
        {
          cornerRadii: {
            topLeft: 16,
            topRight: 16,
            bottomRight: 16,
            bottomLeft: 16,
          },
        },
      ),
    ).toEqual({ top: 9.5, right: 14.5, bottom: 9.5, left: 14.5 });
  });
});

describe('nine-slice metadata', () => {
  it('serializes and parses valid metadata', () => {
    const serialized = serializeNineSliceMetadata({
      imageSize: { width: 100, height: 80 },
      slices: { top: 10, right: 20, bottom: 30, left: 15 },
    });

    expect(parseNineSliceMetadata(serialized)).toEqual({
      version: 1,
      imageSize: { width: 100, height: 80 },
      slices: { top: 10, right: 20, bottom: 30, left: 15 },
    });
  });

  it('rejects malformed or invalid metadata', () => {
    expect(parseNineSliceMetadata('')).toBeUndefined();
    expect(parseNineSliceMetadata('{bad json')).toBeUndefined();
    expect(
      parseNineSliceMetadata(
        JSON.stringify({
          version: 1,
          imageSize: { width: 100, height: 80 },
          slices: { top: 40, right: 10, bottom: 40, left: 10 },
        }),
      ),
    ).toBeUndefined();
  });

  it('infers slice settings from nine region child nodes', () => {
    expect(
      inferSliceSettingsFromRegionNodes(
        { width: 100, height: 80 },
        [
          { name: 'topLeft', x: 0, y: 0, width: 15, height: 10 },
          { name: 'top', x: 15, y: 0, width: 65, height: 10 },
          { name: 'topRight', x: 80, y: 0, width: 20, height: 10 },
          { name: 'left', x: 0, y: 10, width: 15, height: 40 },
          { name: 'center', x: 15, y: 10, width: 65, height: 40 },
          { name: 'right', x: 80, y: 10, width: 20, height: 40 },
          { name: 'bottomLeft', x: 0, y: 50, width: 15, height: 30 },
          { name: 'bottom', x: 15, y: 50, width: 65, height: 30 },
          { name: 'bottomRight', x: 80, y: 50, width: 20, height: 30 },
        ],
      ),
    ).toEqual({ top: 10, right: 20, bottom: 30, left: 15 });
  });

  it('does not infer slices from incomplete or invalid region nodes', () => {
    expect(inferSliceSettingsFromRegionNodes({ width: 100, height: 80 }, [])).toBeUndefined();
    expect(
      inferSliceSettingsFromRegionNodes(
        { width: 100, height: 80 },
        [
          { name: 'topLeft', x: 0, y: 0, width: 50, height: 10 },
          { name: 'topRight', x: 50, y: 0, width: 50, height: 10 },
          { name: 'bottomLeft', x: 0, y: 70, width: 50, height: 10 },
          { name: 'bottomRight', x: 50, y: 70, width: 50, height: 10 },
        ],
      ),
    ).toBeUndefined();
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
