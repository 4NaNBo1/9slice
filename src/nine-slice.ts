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

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface RgbaImageData {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface DefaultSliceSettingsOptions {
  cornerRadii?: Partial<CornerRadii>;
  alphaData?: RgbaImageData;
  alphaThreshold?: number;
}

interface AlphaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const NINE_SLICE_METADATA_KEY = 'nineSliceSettings';
export const NINE_SLICE_METADATA_VERSION = 1;

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

export interface NineSliceMetadata {
  version: typeof NINE_SLICE_METADATA_VERSION;
  imageSize: Size;
  slices: SliceSettings;
}

export interface NineSliceRegionNode {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

export function computeDefaultSliceSettings(image: Size, options: DefaultSliceSettingsOptions = {}): SliceSettings {
  const fromCornerRadii = sliceSettingsFromCornerRadii(options.cornerRadii);
  const fromAlpha = sliceSettingsFromAlphaData(options.alphaData, options.alphaThreshold ?? 254);

  if (!fromCornerRadii && !fromAlpha) {
    return clampSliceSettingsToImage(image, sizeBasedDefaultSliceSettings(image));
  }

  return clampSliceSettingsToImage(image, maxSliceSettings(fromCornerRadii, fromAlpha));
}

export function serializeNineSliceMetadata(metadata: Omit<NineSliceMetadata, 'version'>): string {
  return JSON.stringify({
    version: NINE_SLICE_METADATA_VERSION,
    imageSize: metadata.imageSize,
    slices: metadata.slices,
  });
}

export function parseNineSliceMetadata(raw: string): NineSliceMetadata | undefined {
  if (!raw) return undefined;

  try {
    const value = JSON.parse(raw) as Partial<NineSliceMetadata>;
    if (value.version !== NINE_SLICE_METADATA_VERSION) return undefined;
    if (!isSize(value.imageSize) || !isSliceSettings(value.slices)) return undefined;
    if (!validateSliceSettings(value.imageSize, value.slices).ok) return undefined;

    return {
      version: NINE_SLICE_METADATA_VERSION,
      imageSize: value.imageSize,
      slices: value.slices,
    };
  } catch {
    return undefined;
  }
}

export function inferSliceSettingsFromRegionNodes(image: Size, nodes: NineSliceRegionNode[]): SliceSettings | undefined {
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const requiredKeys: RegionKey[] = ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight'];
  if (requiredKeys.some((key) => !byName.has(key))) return undefined;

  const topLeft = byName.get('topLeft');
  const topRight = byName.get('topRight');
  const bottomLeft = byName.get('bottomLeft');
  const bottomRight = byName.get('bottomRight');
  if (!topLeft || !topRight || !bottomLeft || !bottomRight) return undefined;

  const slices = {
    top: roundNumberValue(topLeft.height, 1),
    right: roundNumberValue(topRight.width, 1),
    bottom: roundNumberValue(bottomLeft.height, 1),
    left: roundNumberValue(topLeft.width, 1),
  };

  const cornersAgree =
    roundNumberValue(bottomLeft.width, 1) === slices.left &&
    roundNumberValue(bottomRight.width, 1) === slices.right &&
    roundNumberValue(topRight.height, 1) === slices.top &&
    roundNumberValue(bottomRight.height, 1) === slices.bottom;
  if (!cornersAgree) return undefined;

  return validateSliceSettings(image, slices).ok ? slices : undefined;
}

function hasAtMostDecimalPlaces(value: number, decimals: number): boolean {
  return Number.isFinite(value) && truncateNumberValue(value, decimals) === value;
}

function sizeBasedDefaultSliceSettings(image: Size): SliceSettings {
  const value = Math.max(0, Math.min(16, Math.floor(Math.min(image.width, image.height) / 4)));
  return { top: value, right: value, bottom: value, left: value };
}

function sliceSettingsFromCornerRadii(radii: Partial<CornerRadii> | undefined): SliceSettings | undefined {
  if (!radii) return undefined;

  const corners = {
    topLeft: normalizeDefaultSliceValue(radii.topLeft),
    topRight: normalizeDefaultSliceValue(radii.topRight),
    bottomRight: normalizeDefaultSliceValue(radii.bottomRight),
    bottomLeft: normalizeDefaultSliceValue(radii.bottomLeft),
  };
  if (Object.values(corners).every((value) => value === 0)) return undefined;

  return {
    top: Math.max(corners.topLeft, corners.topRight),
    right: Math.max(corners.topRight, corners.bottomRight),
    bottom: Math.max(corners.bottomLeft, corners.bottomRight),
    left: Math.max(corners.topLeft, corners.bottomLeft),
  };
}

function sliceSettingsFromAlphaData(alphaData: RgbaImageData | undefined, alphaThreshold: number): SliceSettings | undefined {
  if (!alphaData || !isSize(alphaData) || alphaData.data.length < alphaData.width * alphaData.height * 4) return undefined;

  const threshold = normalizeAlphaThreshold(alphaThreshold);
  const contentBounds = findAlphaContentBounds(alphaData, threshold);
  if (!contentBounds) return undefined;

  const topLeft = scanTransparentCorner(alphaData, contentBounds, 'topLeft', threshold);
  const topRight = scanTransparentCorner(alphaData, contentBounds, 'topRight', threshold);
  const bottomRight = scanTransparentCorner(alphaData, contentBounds, 'bottomRight', threshold);
  const bottomLeft = scanTransparentCorner(alphaData, contentBounds, 'bottomLeft', threshold);
  const rightPadding = alphaData.width - contentBounds.x - contentBounds.width;
  const bottomPadding = alphaData.height - contentBounds.y - contentBounds.height;

  const slices = {
    top: Math.max(contentBounds.y + topLeft.vertical, contentBounds.y + topRight.vertical),
    right: Math.max(rightPadding + topRight.horizontal, rightPadding + bottomRight.horizontal),
    bottom: Math.max(bottomPadding + bottomLeft.vertical, bottomPadding + bottomRight.vertical),
    left: Math.max(contentBounds.x + topLeft.horizontal, contentBounds.x + bottomLeft.horizontal),
  };

  return Object.values(slices).some((value) => value > 0) ? slices : undefined;
}

function findAlphaContentBounds(alphaData: RgbaImageData, alphaThreshold: number): AlphaBounds | undefined {
  let minX = alphaData.width;
  let minY = alphaData.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < alphaData.height; y += 1) {
    for (let x = 0; x < alphaData.width; x += 1) {
      if ((alphaData.data[(y * alphaData.width + x) * 4 + 3] ?? 0) <= alphaThreshold) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return undefined;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function scanTransparentCorner(
  alphaData: RgbaImageData,
  bounds: AlphaBounds,
  corner: keyof CornerRadii,
  alphaThreshold: number,
): { horizontal: number; vertical: number } {
  const quadrantWidth = Math.ceil(bounds.width / 2);
  const quadrantHeight = Math.ceil(bounds.height / 2);
  const visited = new Uint8Array(quadrantWidth * quadrantHeight);
  const queue: number[] = [];

  const enqueue = (localX: number, localY: number) => {
    if (localX < 0 || localY < 0 || localX >= quadrantWidth || localY >= quadrantHeight) return;

    const index = localY * quadrantWidth + localX;
    if (visited[index]) return;

    visited[index] = 1;
    if (cornerAlpha(alphaData, bounds, corner, localX, localY) <= alphaThreshold) {
      queue.push(index);
    }
  };

  enqueue(0, 0);

  let horizontal = 0;
  let vertical = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const localX = index % quadrantWidth;
    const localY = Math.floor(index / quadrantWidth);

    horizontal = Math.max(horizontal, localX + 1);
    vertical = Math.max(vertical, localY + 1);

    enqueue(localX + 1, localY);
    enqueue(localX - 1, localY);
    enqueue(localX, localY + 1);
    enqueue(localX, localY - 1);
  }

  return { horizontal, vertical };
}

function cornerAlpha(alphaData: RgbaImageData, bounds: AlphaBounds, corner: keyof CornerRadii, localX: number, localY: number): number {
  const x = bounds.x + (corner === 'topRight' || corner === 'bottomRight' ? bounds.width - 1 - localX : localX);
  const y = bounds.y + (corner === 'bottomLeft' || corner === 'bottomRight' ? bounds.height - 1 - localY : localY);
  return alphaData.data[(y * alphaData.width + x) * 4 + 3] ?? 255;
}

function normalizeAlphaThreshold(value: number): number {
  if (!Number.isFinite(value)) return 254;
  return Math.max(0, Math.min(254, Math.round(value)));
}

function maxSliceSettings(...settings: Array<SliceSettings | undefined>): SliceSettings {
  const best: SliceSettings = { top: 0, right: 0, bottom: 0, left: 0 };

  for (const current of settings) {
    best.top = Math.max(best.top, current?.top ?? 0);
    best.right = Math.max(best.right, current?.right ?? 0);
    best.bottom = Math.max(best.bottom, current?.bottom ?? 0);
    best.left = Math.max(best.left, current?.left ?? 0);
  }

  return best;
}

function clampSliceSettingsToImage(image: Size, slices: SliceSettings): SliceSettings {
  const [left, right] = clampSlicePair(slices.left, slices.right, image.width);
  const [top, bottom] = clampSlicePair(slices.top, slices.bottom, image.height);
  return { top, right, bottom, left };
}

function clampSlicePair(start: number, end: number, axis: number): [number, number] {
  let nextStart = normalizeDefaultSliceValue(start);
  let nextEnd = normalizeDefaultSliceValue(end);
  const maxTotal = Math.max(0, normalizeDefaultSliceValue(axis - 1));
  const total = nextStart + nextEnd;

  if (total <= maxTotal) return [nextStart, nextEnd];
  if (maxTotal === 0 || total === 0) return [0, 0];

  const scale = maxTotal / total;
  nextStart = normalizeDefaultSliceValue(nextStart * scale);
  nextEnd = normalizeDefaultSliceValue(nextEnd * scale);

  while (nextStart + nextEnd > maxTotal) {
    if (nextStart >= nextEnd) {
      nextStart = normalizeDefaultSliceValue(nextStart - 0.1);
    } else {
      nextEnd = normalizeDefaultSliceValue(nextEnd - 0.1);
    }
  }

  return [nextStart, nextEnd];
}

function normalizeDefaultSliceValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, roundNumberValue(value, 1)) : 0;
}

function isSize(value: unknown): value is Size {
  const size = value as Size;
  return Number.isFinite(size?.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0;
}

function isSliceSettings(value: unknown): value is SliceSettings {
  const slices = value as SliceSettings;
  return (
    Number.isFinite(slices?.top) &&
    Number.isFinite(slices.right) &&
    Number.isFinite(slices.bottom) &&
    Number.isFinite(slices.left)
  );
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

export function computeNineSliceRegionsForTarget(image: Size, target: Size, slices: SliceSettings): NineSliceRegion[] {
  const horizontalScale = target.width / image.width;
  const verticalScale = target.height / image.height;
  const targetSlices = {
    top: slices.top * verticalScale,
    right: slices.right * horizontalScale,
    bottom: slices.bottom * verticalScale,
    left: slices.left * horizontalScale,
  };

  const sourceRegions = computeNineSliceRegions(image, slices);
  const targetRegions = computeNineSliceRegions(target, targetSlices);

  return sourceRegions.map((sourceRegion, index) => ({
    ...sourceRegion,
    destination: targetRegions[index].destination,
  }));
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
