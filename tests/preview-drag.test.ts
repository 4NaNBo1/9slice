import { describe, expect, it } from 'vitest';

import {
  computePreviewMetrics,
  getExtendedGuideLines,
  getGuideArrowheads,
  getSliceGuideAtPoint,
  updateSliceFromGuide,
} from '../src/preview-drag';

const image = { width: 100, height: 80 };
const slices = { top: 10, right: 20, bottom: 30, left: 15 };

describe('getSliceGuideAtPoint', () => {
  it('finds the nearest slice guide within the hit tolerance', () => {
    expect(getSliceGuideAtPoint(image, slices, { x: 16, y: 35 }, 4)).toBe('left');
    expect(getSliceGuideAtPoint(image, slices, { x: 78, y: 35 }, 4)).toBe('right');
    expect(getSliceGuideAtPoint(image, slices, { x: 50, y: 12 }, 4)).toBe('top');
    expect(getSliceGuideAtPoint(image, slices, { x: 50, y: 48 }, 4)).toBe('bottom');
    expect(getSliceGuideAtPoint(image, slices, { x: 50, y: 35 }, 4)).toBeUndefined();
  });
});

describe('updateSliceFromGuide', () => {
  it('updates the dragged guide in image pixels', () => {
    expect(updateSliceFromGuide(image, slices, 'left', { x: 24, y: 0 })).toEqual({ ...slices, left: 24 });
    expect(updateSliceFromGuide(image, slices, 'right', { x: 72, y: 0 })).toEqual({ ...slices, right: 28 });
    expect(updateSliceFromGuide(image, slices, 'top', { x: 0, y: 18 })).toEqual({ ...slices, top: 18 });
    expect(updateSliceFromGuide(image, slices, 'bottom', { x: 0, y: 55 })).toEqual({ ...slices, bottom: 25 });
  });

  it('keeps the stretchable center at least one pixel wide and tall', () => {
    expect(updateSliceFromGuide(image, slices, 'left', { x: 99, y: 0 })).toEqual({ ...slices, left: 79 });
    expect(updateSliceFromGuide(image, slices, 'right', { x: 0, y: 0 })).toEqual({ ...slices, right: 84 });
    expect(updateSliceFromGuide(image, slices, 'top', { x: 0, y: 79 })).toEqual({ ...slices, top: 49 });
    expect(updateSliceFromGuide(image, slices, 'bottom', { x: 0, y: 0 })).toEqual({ ...slices, bottom: 69 });
  });
});

describe('computePreviewMetrics', () => {
  it('reserves canvas padding for guide lines extending outside the image', () => {
    expect(computePreviewMetrics({ width: 400, height: 200 }, { width: 340, height: 250 }, 12)).toEqual({
      scale: 0.79,
      padding: 12,
      canvasWidth: 340,
      canvasHeight: 182,
    });
  });
});

describe('getExtendedGuideLines', () => {
  it('extends vertical and horizontal guide lines beyond the image bounds', () => {
    expect(getExtendedGuideLines(image, slices, 8)).toEqual([
      { guide: 'left', x1: 15, y1: -8, x2: 15, y2: 88 },
      { guide: 'right', x1: 80, y1: -8, x2: 80, y2: 88 },
      { guide: 'top', x1: -8, y1: 10, x2: 108, y2: 10 },
      { guide: 'bottom', x1: -8, y1: 50, x2: 108, y2: 50 },
    ]);
  });
});

describe('getGuideArrowheads', () => {
  it('places inward-pointing triangle markers 4 pixels away from each guide line end', () => {
    expect(getGuideArrowheads(getExtendedGuideLines(image, slices, 8), 6, 4)).toEqual([
      { guide: 'left', points: [{ x: 15, y: -12 }, { x: 12, y: -18 }, { x: 18, y: -18 }] },
      { guide: 'left', points: [{ x: 15, y: 92 }, { x: 12, y: 98 }, { x: 18, y: 98 }] },
      { guide: 'right', points: [{ x: 80, y: -12 }, { x: 77, y: -18 }, { x: 83, y: -18 }] },
      { guide: 'right', points: [{ x: 80, y: 92 }, { x: 77, y: 98 }, { x: 83, y: 98 }] },
      { guide: 'top', points: [{ x: -12, y: 10 }, { x: -18, y: 7 }, { x: -18, y: 13 }] },
      { guide: 'top', points: [{ x: 112, y: 10 }, { x: 118, y: 7 }, { x: 118, y: 13 }] },
      { guide: 'bottom', points: [{ x: -12, y: 50 }, { x: -18, y: 47 }, { x: -18, y: 53 }] },
      { guide: 'bottom', points: [{ x: 112, y: 50 }, { x: 118, y: 47 }, { x: 118, y: 53 }] },
    ]);
  });
});
