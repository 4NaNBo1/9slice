import type { Size, SliceSettings } from './nine-slice';

export type SliceGuide = keyof SliceSettings;

export interface ImagePoint {
  x: number;
  y: number;
}

export interface PreviewMaxSize {
  width: number;
  height: number;
}

export interface PreviewMetrics {
  scale: number;
  padding: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface GuideLine {
  guide: SliceGuide;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GuideArrowhead {
  guide: SliceGuide;
  points: [ImagePoint, ImagePoint, ImagePoint];
}

export function computePreviewMetrics(image: Size, maxSize: PreviewMaxSize, padding: number): PreviewMetrics {
  const scale = Math.min((maxSize.width - padding * 2) / image.width, (maxSize.height - padding * 2) / image.height, 1);
  return {
    scale,
    padding,
    canvasWidth: Math.max(1, Math.round(image.width * scale + padding * 2)),
    canvasHeight: Math.max(1, Math.round(image.height * scale + padding * 2)),
  };
}

export function getExtendedGuideLines(image: Size, slices: SliceSettings, extension: number): GuideLine[] {
  const right = image.width - slices.right;
  const bottom = image.height - slices.bottom;

  return [
    { guide: 'left', x1: slices.left, y1: -extension, x2: slices.left, y2: image.height + extension },
    { guide: 'right', x1: right, y1: -extension, x2: right, y2: image.height + extension },
    { guide: 'top', x1: -extension, y1: slices.top, x2: image.width + extension, y2: slices.top },
    { guide: 'bottom', x1: -extension, y1: bottom, x2: image.width + extension, y2: bottom },
  ];
}

export function getGuideArrowheads(lines: GuideLine[], size: number, gap: number): GuideArrowhead[] {
  const halfSize = size / 2;

  return lines.flatMap((line) => {
    if (line.x1 === line.x2) {
      const topTipY = line.y1 - gap;
      const bottomTipY = line.y2 + gap;
      return [
        {
          guide: line.guide,
          points: [
            { x: line.x1, y: topTipY },
            { x: line.x1 - halfSize, y: topTipY - size },
            { x: line.x1 + halfSize, y: topTipY - size },
          ],
        },
        {
          guide: line.guide,
          points: [
            { x: line.x2, y: bottomTipY },
            { x: line.x2 - halfSize, y: bottomTipY + size },
            { x: line.x2 + halfSize, y: bottomTipY + size },
          ],
        },
      ];
    }

    const leftTipX = line.x1 - gap;
    const rightTipX = line.x2 + gap;
    return [
      {
        guide: line.guide,
        points: [
          { x: leftTipX, y: line.y1 },
          { x: leftTipX - size, y: line.y1 - halfSize },
          { x: leftTipX - size, y: line.y1 + halfSize },
        ],
      },
      {
        guide: line.guide,
        points: [
          { x: rightTipX, y: line.y2 },
          { x: rightTipX + size, y: line.y2 - halfSize },
          { x: rightTipX + size, y: line.y2 + halfSize },
        ],
      },
    ];
  });
}

export function getSliceGuideAtPoint(
  image: Size,
  slices: SliceSettings,
  point: ImagePoint,
  tolerance: number,
): SliceGuide | undefined {
  if (point.x < 0 || point.y < 0 || point.x > image.width || point.y > image.height) {
    return undefined;
  }

  const candidates: Array<{ guide: SliceGuide; distance: number }> = [
    { guide: 'left', distance: Math.abs(point.x - slices.left) },
    { guide: 'right', distance: Math.abs(point.x - (image.width - slices.right)) },
    { guide: 'top', distance: Math.abs(point.y - slices.top) },
    { guide: 'bottom', distance: Math.abs(point.y - (image.height - slices.bottom)) },
  ];

  const nearest = candidates.reduce((best, candidate) => (candidate.distance < best.distance ? candidate : best));
  return nearest.distance <= tolerance ? nearest.guide : undefined;
}

export function updateSliceFromGuide(
  image: Size,
  slices: SliceSettings,
  guide: SliceGuide,
  point: ImagePoint,
): SliceSettings {
  if (guide === 'left') {
    return { ...slices, left: clamp(Math.round(point.x), 0, image.width - slices.right - 1) };
  }

  if (guide === 'right') {
    return { ...slices, right: clamp(Math.round(image.width - point.x), 0, image.width - slices.left - 1) };
  }

  if (guide === 'top') {
    return { ...slices, top: clamp(Math.round(point.y), 0, image.height - slices.bottom - 1) };
  }

  return { ...slices, bottom: clamp(Math.round(image.height - point.y), 0, image.height - slices.top - 1) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
