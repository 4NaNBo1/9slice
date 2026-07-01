import {
  computeNineSliceRegionsForTarget,
  inferSliceSettingsFromRegionNodes,
  mapSemanticConstraints,
  NINE_SLICE_METADATA_KEY,
  parseNineSliceMetadata,
  serializeNineSliceMetadata,
  type CornerRadii,
} from '../nine-slice';
import { readNineSliceMetadataFromNode } from '../psd-nine-slice-bridge';
import { getInsertIndexAboveSource } from './layer-order';
import type { CreateNineSliceOptions, PlatformAdapter, SelectionInfo } from './types';

type FigmaImagePaint = {
  type: 'IMAGE';
  imageHash: string;
  scaleMode: 'FILL' | 'CROP';
  imageTransform?: [[number, number, number], [number, number, number]];
};

function resizeNode(node: SceneNode & LayoutMixin, width: number, height: number): void {
  node.resize(width, height);
}

export class FigmaAdapter implements PlatformAdapter {
  readonly platform = 'figma' as const;

  showUI(html: string): void {
    figma.showUI(html, { width: 390, height: 640, title: '9-Slice Scaling' });
  }

  postMessage(message: unknown): void {
    figma.ui.postMessage(message);
  }

  notify(message: string, options?: { error?: boolean }): void {
    figma.notify(message, options);
  }

  closePlugin(): void {
    figma.closePlugin();
  }

  commitUndo(): void {
    figma.commitUndo();
  }

  onMessage(handler: (message: unknown) => void): void {
    figma.ui.onmessage = handler;
  }

  onSelectionChange(handler: () => void): void {
    figma.on('selectionchange', handler);
  }

  getSelectionInfo(): SelectionInfo {
    const selection = figma.currentPage.selection;
    return {
      count: selection.length,
      names: selection.map((node) => node.name || 'Unnamed'),
    };
  }

  async readSelectedImage() {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) {
      throw new Error('Select exactly one image layer.');
    }

    const node = selection[0] as SceneNode & LayoutMixin;
    if (node.width <= 0 || node.height <= 0) {
      throw new Error('Selected layer must have a visible size.');
    }

    const nineSlice = readNineSliceSelection(node);
    const cornerRadii = readCornerRadii(node);
    const fillBytes = await readImageFillBytes(node);
    const bytes = fillBytes ?? (await exportNodeImage(node));
    const metadata = readNineSliceMetadataFromNode(node);
    return {
      bytes,
      layerName: node.name || 'Image',
      slices: nineSlice?.slices ?? metadata?.slices,
      imageSize: metadata?.imageSize,
      isNineSlice: Boolean(nineSlice || metadata),
      ...(cornerRadii ? { cornerRadii } : {}),
      sourceNodeId: node.id,
      layerBounds: {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      },
    };
  }

  async createNineSliceComponent(options: CreateNineSliceOptions): Promise<void> {
    const source = await getSourceNode(options.sourceNodeId);
    if (!options.sourceBytes) {
      throw new Error('Unable to read the selected layer export.');
    }

    const targetSize = { width: source.width, height: source.height };
    const component = figma.createComponent();
    component.name = options.sourceName;
    resizeNode(component, targetSize.width, targetSize.height);
    component.clipsContent = false;
    (component as unknown as { fills: unknown[]; strokes: unknown[] }).fills = [createStoredImagePaint(options.sourceBytes)];
    (component as unknown as { fills: unknown[]; strokes: unknown[] }).strokes = [];
    component.setPluginData(
      NINE_SLICE_METADATA_KEY,
      serializeNineSliceMetadata({
        imageSize: options.imageSize,
        slices: options.slices,
      }),
    );

    const sourceParent = source.parent;
    if (!sourceParent) {
      throw new Error('Selected layer cannot be replaced in place.');
    }

    const insertIndex = getInsertIndexAboveSource(sourceParent, source);
    sourceParent.insertChild(insertIndex, component);
    component.relativeTransform = source.relativeTransform;

    const effectSource = effectSourceFor(source, Boolean(options.replaceSource));
    copyEffects(effectSource, component);
    copyCornerRadii(effectSource, component);

    const piecesByKey = new Map(options.pieces.map((piece) => [piece.key, piece]));
    for (const region of computeNineSliceRegionsForTarget(options.imageSize, targetSize, options.slices)) {
      if (region.destination.width <= 0 || region.destination.height <= 0) continue;

      const piece = piecesByKey.get(region.key);
      if (!piece) continue;

      const rect = figma.createRectangle();
      rect.name = region.key;
      component.appendChild(rect);
      rect.x = region.destination.x;
      rect.y = region.destination.y;
      rect.resize(region.destination.width, region.destination.height);
      rect.constraints = mapSemanticConstraints('figma', region.constraints);
      (rect as unknown as { fills: unknown[]; strokes: unknown[] }).fills = [createImagePaint(piece.bytes, 'CROP')];
      (rect as unknown as { fills: unknown[]; strokes: unknown[] }).strokes = [];
    }

    if (options.replaceSource) {
      source.remove();
    } else {
      source.visible = false;
    }
    figma.currentPage.selection = [component];
    figma.viewport.scrollAndZoomIntoView([component]);
  }
}

async function exportNodeImage(node: SceneNode): Promise<Uint8Array> {
  const effectHost = node as SceneNode & { effects?: ReadonlyArray<unknown> };
  const effects = Array.isArray(effectHost.effects) ? [...effectHost.effects] : undefined;

  try {
    if (effects?.length) {
      (effectHost as { effects: ReadonlyArray<unknown> }).effects = [];
    }
    return (await node.exportAsync({ format: 'PNG', useAbsoluteBounds: true })) as Uint8Array;
  } finally {
    if (effects) {
      (effectHost as { effects: ReadonlyArray<unknown> }).effects = effects;
    }
  }
}

function effectSourceFor(source: unknown, allowNestedEffectSource: boolean): unknown {
  if (hasEffects(source) || !allowNestedEffectSource) return source;

  const children = (source as { children?: unknown }).children;
  if (!Array.isArray(children)) return source;

  return children.find((child) => (child as { name?: unknown }).name === 'content' && hasEffects(child)) ?? source;
}

function hasEffects(node: unknown): boolean {
  const effects = (node as { effects?: unknown }).effects;
  const effectStyleId = (node as { effectStyleId?: unknown }).effectStyleId;
  return (Array.isArray(effects) && effects.length > 0) || (typeof effectStyleId === 'string' && effectStyleId.length > 0);
}

function copyEffects(source: unknown, target: unknown): void {
  const effects = (source as { effects?: unknown }).effects;
  if (Array.isArray(effects)) {
    (target as { effects?: unknown[] }).effects = [...effects];
  }

  const effectStyleId = (source as { effectStyleId?: unknown }).effectStyleId;
  if (typeof effectStyleId !== 'string' || !effectStyleId) return;

  try {
    (target as { effectStyleId?: string }).effectStyleId = effectStyleId;
  } catch {
    // Some node/style combinations do not allow assigning effect styles.
  }
}

function copyCornerRadii(source: unknown, target: unknown): void {
  const radii = source as {
    cornerRadius?: unknown;
    topLeftRadius?: unknown;
    topRightRadius?: unknown;
    bottomLeftRadius?: unknown;
    bottomRightRadius?: unknown;
  };
  const writable = target as {
    cornerRadius?: unknown;
    topLeftRadius?: unknown;
    topRightRadius?: unknown;
    bottomLeftRadius?: unknown;
    bottomRightRadius?: unknown;
  };

  if (typeof radii.cornerRadius === 'number') writable.cornerRadius = radii.cornerRadius;
  if (typeof radii.topLeftRadius === 'number') writable.topLeftRadius = radii.topLeftRadius;
  if (typeof radii.topRightRadius === 'number') writable.topRightRadius = radii.topRightRadius;
  if (typeof radii.bottomLeftRadius === 'number') writable.bottomLeftRadius = radii.bottomLeftRadius;
  if (typeof radii.bottomRightRadius === 'number') writable.bottomRightRadius = radii.bottomRightRadius;
}

function readCornerRadii(source: unknown): CornerRadii | undefined {
  const radii = source as {
    cornerRadius?: unknown;
    topLeftRadius?: unknown;
    topRightRadius?: unknown;
    bottomLeftRadius?: unknown;
    bottomRightRadius?: unknown;
  };
  const uniform = normalizeCornerRadius(radii.cornerRadius);
  const cornerRadii = {
    topLeft: normalizeCornerRadius(radii.topLeftRadius, uniform),
    topRight: normalizeCornerRadius(radii.topRightRadius, uniform),
    bottomRight: normalizeCornerRadius(radii.bottomRightRadius, uniform),
    bottomLeft: normalizeCornerRadius(radii.bottomLeftRadius, uniform),
  };

  return Object.values(cornerRadii).some((value) => value > 0) ? cornerRadii : undefined;
}

function normalizeCornerRadius(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : fallback;
}

function readNineSliceSelection(node: SceneNode & LayoutMixin): { slices: CreateNineSliceOptions['slices'] } | undefined {
  const metadata = readNineSliceMetadataFromNode(node);
  if (metadata) return { slices: metadata.slices };

  if (!('children' in node)) return undefined;

  const slices = inferSliceSettingsFromRegionNodes(
    { width: node.width, height: node.height },
    node.children.map((child) => ({
      name: child.name,
      x: child.x,
      y: child.y,
      width: child.width,
      height: child.height,
    })),
  );
  return slices ? { slices } : undefined;
}

async function readImageFillBytes(node: unknown): Promise<Uint8Array | undefined> {
  const fills = (node as { fills?: unknown }).fills;
  if (!Array.isArray(fills)) return undefined;

  const imagePaint = fills.find((paint): paint is FigmaImagePaint => {
    const candidate = paint as Partial<FigmaImagePaint>;
    return candidate.type === 'IMAGE' && typeof candidate.imageHash === 'string';
  });
  if (!imagePaint) return undefined;

  return (figma.getImageByHash(imagePaint.imageHash) ?? undefined)?.getBytesAsync();
}

async function getSourceNode(sourceNodeId: string | undefined): Promise<SceneNode & LayoutMixin> {
  if (!sourceNodeId) {
    throw new Error('Unable to locate the selected layer.');
  }

  const node = await figma.getNodeByIdAsync(sourceNodeId);
  if (!node || !('visible' in node) || !('parent' in node) || !('resize' in node)) {
    throw new Error('Selected layer is no longer available.');
  }

  if (!node.parent) {
    throw new Error('Selected layer cannot be replaced in place.');
  }

  return node as SceneNode & LayoutMixin;
}

function createImagePaint(bytes: Uint8Array, scaleMode: FigmaImagePaint['scaleMode']): FigmaImagePaint {
  const image = (figma as unknown as { createImage(data: Uint8Array): { hash: string } }).createImage(bytes);

  const paint: FigmaImagePaint = {
    type: 'IMAGE',
    imageHash: image.hash,
    scaleMode,
  };

  if (scaleMode === 'CROP') {
    paint.imageTransform = [
      [1, 0, 0],
      [0, 1, 0],
    ];
  }

  return paint;
}

function createStoredImagePaint(bytes: Uint8Array): FigmaImagePaint & { visible: false; opacity: 0 } {
  return {
    ...createImagePaint(bytes, 'FILL'),
    visible: false,
    opacity: 0,
  };
}
