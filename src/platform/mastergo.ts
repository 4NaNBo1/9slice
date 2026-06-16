import {
  computeNineSliceRegionsForTarget,
  inferSliceSettingsFromRegionNodes,
  mapSemanticConstraints,
  NINE_SLICE_METADATA_KEY,
  parseNineSliceMetadata,
  serializeNineSliceMetadata,
  type CornerRadii,
} from '../nine-slice';
import { getInsertIndexAboveSource } from './layer-order';
import type { CreateNineSliceOptions, PlatformAdapter, SelectionInfo } from './types';

declare const mg: any;

function safeResize(node: any, width: number, height: number): void {
  if (typeof node.resize === 'function') {
    node.resize(width, height);
    return;
  }

  node.width = width;
  node.height = height;
}

function getCurrentSelection(): any[] {
  return mg.document.currentPage.selection ?? [];
}

export class MasterGoAdapter implements PlatformAdapter {
  readonly platform = 'mastergo' as const;

  showUI(html: string): void {
    mg.showUI(html, { width: 390, height: 640 });
  }

  postMessage(message: unknown): void {
    mg.ui.postMessage(message);
  }

  notify(message: string, options?: { error?: boolean }): void {
    try {
      mg.notify(message, options);
    } catch {
      mg.notify(message);
    }
  }

  closePlugin(): void {
    mg.closePlugin();
  }

  commitUndo(): void {
    try {
      mg.commitUndo();
    } catch {
      // Older/private MasterGo runtimes may not expose commitUndo.
    }
  }

  onMessage(handler: (message: unknown) => void): void {
    mg.ui.onmessage = handler;
  }

  onSelectionChange(handler: () => void): void {
    try {
      mg.on('selectionchange', handler);
    } catch {
      // Older/private MasterGo environments may not expose selectionchange.
    }
  }

  getSelectionInfo(): SelectionInfo {
    const selection = getCurrentSelection();
    return {
      count: selection.length,
      names: selection.map((node) => node.name || 'Unnamed'),
    };
  }

  async readSelectedImage() {
    const selection = getCurrentSelection();
    if (selection.length !== 1) {
      throw new Error('Select exactly one image layer.');
    }

    const node = selection[0];
    if ((node.width ?? 0) <= 0 || (node.height ?? 0) <= 0 || typeof node.exportAsync !== 'function') {
      throw new Error('Selected layer must be exportable and have a visible size.');
    }

    const nineSlice = readNineSliceSelection(node);
    const cornerRadii = readCornerRadii(node);
    const fillBytes = await readImageFillBytes(node);
    const bytes = fillBytes ?? (await exportNodeImage(node));
    return {
      bytes,
      layerName: node.name || 'Image',
      slices: nineSlice?.slices,
      isNineSlice: Boolean(nineSlice),
      ...(cornerRadii ? { cornerRadii } : {}),
      sourceNodeId: node.id,
      layerBounds: {
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width ?? 0,
        height: node.height ?? 0,
      },
    };
  }

  async createNineSliceComponent(options: CreateNineSliceOptions): Promise<void> {
    const source = getSourceNode(options.sourceNodeId);
    if (!options.sourceBytes) {
      throw new Error('Unable to read the selected layer export.');
    }

    const targetSize = {
      width: source.width ?? options.sourceBounds?.width ?? options.imageSize.width,
      height: source.height ?? options.sourceBounds?.height ?? options.imageSize.height,
    };
    const component = mg.createComponent();
    component.name = options.sourceName;
    safeResize(component, targetSize.width, targetSize.height);
    component.fills = [await createStoredImagePaint(options.sourceBytes)];
    component.strokes = [];
    component.setPluginData(
      NINE_SLICE_METADATA_KEY,
      serializeNineSliceMetadata({
        imageSize: options.imageSize,
        slices: options.slices,
      }),
    );
    try {
      component.clipsContent = false;
    } catch {
      // MasterGo component clipping support varies by version.
    }

    const sourceParent = source.parent;
    const insertIndex = getInsertIndexAboveSource(sourceParent, source);
    sourceParent.insertChild(insertIndex, component);
    if (source.relativeTransform) {
      component.relativeTransform = source.relativeTransform;
    } else {
      component.x = source.x ?? 0;
      component.y = source.y ?? 0;
    }

    const effectSource = effectSourceFor(source, Boolean(options.replaceSource));
    copyEffects(effectSource, component);
    copyCornerRadii(effectSource, component);

    const piecesByKey = new Map(options.pieces.map((piece) => [piece.key, piece]));
    for (const region of computeNineSliceRegionsForTarget(options.imageSize, targetSize, options.slices)) {
      if (region.destination.width <= 0 || region.destination.height <= 0) continue;

      const piece = piecesByKey.get(region.key);
      if (!piece) continue;

      const rect = mg.createRectangle();
      rect.name = region.key;
      component.appendChild(rect);
      rect.x = region.destination.x;
      rect.y = region.destination.y;
      safeResize(rect, region.destination.width, region.destination.height);
      rect.constraints = mapSemanticConstraints('mastergo', region.constraints);
      rect.fills = [await createImagePaint(piece.bytes)];
      rect.strokes = [];
      try {
        rect.effects = [];
      } catch {
        // MasterGo can attach default effects to new nodes; clear when supported.
      }
    }

    if (options.replaceSource && typeof source.remove === 'function') {
      source.remove();
    } else {
      source.isVisible = false;
    }
    mg.document.currentPage.selection = [component];
    try {
      mg.viewport.scrollAndZoomIntoView([component]);
    } catch {
      // Viewport helper is not present in all MasterGo plugin runtimes.
    }
  }
}

async function exportNodeImage(node: any): Promise<Uint8Array> {
  const effects = Array.isArray(node.effects) ? [...node.effects] : undefined;

  try {
    if (effects?.length) {
      node.effects = [];
    }
    return node.exportAsync({ format: 'PNG', useAbsoluteBounds: true, useRenderBounds: false });
  } finally {
    if (effects) {
      node.effects = effects;
    }
  }
}

function effectSourceFor(source: any, allowNestedEffectSource: boolean): any {
  if (hasEffects(source) || !allowNestedEffectSource || !Array.isArray(source.children)) return source;

  return source.children.find((child: any) => child?.name === 'content' && hasEffects(child)) ?? source;
}

function hasEffects(node: any): boolean {
  return (Array.isArray(node?.effects) && node.effects.length > 0) || (typeof node?.effectStyleId === 'string' && node.effectStyleId.length > 0);
}

function copyEffects(source: any, target: any): void {
  if (Array.isArray(source.effects)) {
    target.effects = [...source.effects];
  }

  if (typeof source.effectStyleId !== 'string' || !source.effectStyleId) return;

  try {
    target.effectStyleId = source.effectStyleId;
  } catch {
    // MasterGo effect style assignment support varies by runtime.
  }
}

function copyCornerRadii(source: any, target: any): void {
  if (typeof source?.cornerRadius === 'number') target.cornerRadius = source.cornerRadius;
  if (typeof source?.topLeftRadius === 'number') target.topLeftRadius = source.topLeftRadius;
  if (typeof source?.topRightRadius === 'number') target.topRightRadius = source.topRightRadius;
  if (typeof source?.bottomLeftRadius === 'number') target.bottomLeftRadius = source.bottomLeftRadius;
  if (typeof source?.bottomRightRadius === 'number') target.bottomRightRadius = source.bottomRightRadius;
}

function readCornerRadii(source: any): CornerRadii | undefined {
  const uniform = normalizeCornerRadius(source?.cornerRadius);
  const cornerRadii = {
    topLeft: normalizeCornerRadius(source?.topLeftRadius, uniform),
    topRight: normalizeCornerRadius(source?.topRightRadius, uniform),
    bottomRight: normalizeCornerRadius(source?.bottomRightRadius, uniform),
    bottomLeft: normalizeCornerRadius(source?.bottomLeftRadius, uniform),
  };

  return Object.values(cornerRadii).some((value) => value > 0) ? cornerRadii : undefined;
}

function normalizeCornerRadius(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : fallback;
}

function readNineSliceSelection(node: any): { slices: CreateNineSliceOptions['slices'] } | undefined {
  if (typeof node.getPluginData === 'function') {
    const metadata = parseNineSliceMetadata(node.getPluginData(NINE_SLICE_METADATA_KEY));
    if (metadata) return { slices: metadata.slices };
  }

  if (!Array.isArray(node.children)) return undefined;

  const slices = inferSliceSettingsFromRegionNodes(
    { width: node.width ?? 0, height: node.height ?? 0 },
    node.children.map((child: any) => ({
      name: child.name,
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? 0,
      height: child.height ?? 0,
    })),
  );
  return slices ? { slices } : undefined;
}

async function readImageFillBytes(node: any): Promise<Uint8Array | undefined> {
  if (!Array.isArray(node.fills)) return undefined;

  const imagePaint = node.fills.find((paint: any) => paint?.type === 'IMAGE' && typeof paint.imageRef === 'string');
  if (!imagePaint || typeof mg.getImageByHref !== 'function') return undefined;

  return mg.getImageByHref(imagePaint.imageRef)?.getBytesAsync();
}

function getSourceNode(sourceNodeId: string | undefined): any {
  if (!sourceNodeId) {
    throw new Error('Unable to locate the selected layer.');
  }

  const node = mg.getNodeById(sourceNodeId);
  if (!node || !node.parent || typeof node.parent.insertChild !== 'function') {
    throw new Error('Selected layer is no longer available.');
  }

  return node;
}

async function createImagePaint(bytes: Uint8Array): Promise<any> {
  const image = await mg.createImage(bytes);
  return {
    type: 'IMAGE',
    imageRef: image.href,
    scaleMode: 'STRETCH',
    isVisible: true,
    alpha: 1,
    blendMode: 'NORMAL',
  };
}

async function createStoredImagePaint(bytes: Uint8Array): Promise<any> {
  return {
    ...(await createImagePaint(bytes)),
    isVisible: false,
    alpha: 0,
  };
}
