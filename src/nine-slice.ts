import { truncateNumberValue } from './numeric-control';

export type Platform = 'figma' | 'mastergo';

export interface Size {
  width: number;
  height: number;
}

export interface SliceSettings {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RegionKey =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'left'
  | 'center'
  | 'right'
  | 'bottomLeft'
  | 'bottom'
  | 'bottomRight';

export type HorizontalConstraint = 'left' | 'right' | 'stretch';
export type VerticalConstraint = 'top' | 'bottom' | 'stretch';

export interface SemanticConstraints {
  horizontal: HorizontalConstraint;
  vertical: VerticalConstraint;
}

export interface NineSliceRegion {
  key: RegionKey;
  source: Rect;
  destination: Rect;
  constraints: SemanticConstraints;
}

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function formatSlicePercent(slice: number, axis: number): string {
  return String(roundNumberValue((slice / axis) * 100, 1));
}

export function sliceFromPercent(percent: number, axis: number, min: number, _max: number): number {
  const pixelValue = Number.isFinite(percent) ? roundNumberValue((truncateNumberValue(percent, 1) / 100) * axis, 1) : min;
  return Math.max(min, pixelValue);
}

function roundNumberValue(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Number((Math.round(value * factor) / factor).toFixed(decimals));
}

export function validateSliceSettings(image: Size, slices: SliceSettings): ValidationResult {
  const values = [slices.top, slices.right, slices.bottom, slices.left];
  if (values.some((value) => !hasAtMostDecimalPlaces(value, 1) || value < 0)) {
    return { ok: false, message: 'Slice values must be non-negative numbers with at most one decimal place.' };
  }

  if (slices.left + slices.right >= image.width) {
    return { ok: false, message: 'Left and right slices must leave a stretchable center width.' };
  }

  if (slices.top + slices.bottom >= image.height) {
    return { ok: false, message: 'Top and bottom slices must leave a stretchable center height.' };
  }

  return { ok: true };
}

function hasAtMostDecimalPlaces(value: number, decimals: number): boolean {
  return Number.isFinite(value) && truncateNumberValue(value, decimals) === value;
}

export function computeNineSliceRegions(image: Size, slices: SliceSettings): NineSliceRegion[] {
  const centerWidth = image.width - slices.left - slices.right;
  const middleHeight = image.height - slices.top - slices.bottom;
  const rightX = image.width - slices.right;
  const bottomY = image.height - slices.bottom;

  const columns = [
    { x: 0, width: slices.left, horizontal: 'left' as const },
    { x: slices.left, width: centerWidth, horizontal: 'stretch' as const },
    { x: rightX, width: slices.right, horizontal: 'right' as const },
  ];
  const rows = [
    { y: 0, height: slices.top, vertical: 'top' as const },
    { y: slices.top, height: middleHeight, vertical: 'stretch' as const },
    { y: bottomY, height: slices.bottom, vertical: 'bottom' as const },
  ];
  const keys: RegionKey[][] = [
    ['topLeft', 'top', 'topRight'],
    ['left', 'center', 'right'],
    ['bottomLeft', 'bottom', 'bottomRight'],
  ];

  return rows.flatMap((row, rowIndex) =>
    columns.map((column, columnIndex) => {
      const rect = {
        x: column.x,
        y: row.y,
        width: column.width,
        height: row.height,
      };

      return {
        key: keys[rowIndex][columnIndex],
        source: rect,
        destination: rect,
        constraints: {
          horizontal: column.horizontal,
          vertical: row.vertical,
        },
      };
    }),
  );
}

export function mapSemanticConstraints(platform: 'figma', constraints: SemanticConstraints): { horizontal: 'MIN' | 'MAX' | 'STRETCH'; vertical: 'MIN' | 'MAX' | 'STRETCH' };
export function mapSemanticConstraints(platform: 'mastergo', constraints: SemanticConstraints): { horizontal: 'START' | 'END' | 'STARTANDEND'; vertical: 'START' | 'END' | 'STARTANDEND' };
export function mapSemanticConstraints(platform: Platform, constraints: SemanticConstraints) {
  if (platform === 'figma') {
    return {
      horizontal: constraints.horizontal === 'right' ? 'MAX' : constraints.horizontal === 'stretch' ? 'STRETCH' : 'MIN',
      vertical: constraints.vertical === 'bottom' ? 'MAX' : constraints.vertical === 'stretch' ? 'STRETCH' : 'MIN',
    };
  }

  return {
    horizontal: constraints.horizontal === 'right' ? 'END' : constraints.horizontal === 'stretch' ? 'STARTANDEND' : 'START',
    vertical: constraints.vertical === 'bottom' ? 'END' : constraints.vertical === 'stretch' ? 'STARTANDEND' : 'START',
  };
}
