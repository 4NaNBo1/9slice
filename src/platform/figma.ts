import { computeNineSliceRegions, mapSemanticConstraints } from '../nine-slice';
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

    const bytes = (await node.exportAsync({ format: 'PNG' })) as Uint8Array;
    return {
      bytes,
      layerName: node.name || 'Image',
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

    const component = figma.createComponent();
    component.name = options.sourceName;
    resizeNode(component, options.imageSize.width, options.imageSize.height);
    component.clipsContent = false;
    (component as unknown as { fills: unknown[]; strokes: unknown[] }).fills = [createImagePaint(options.sourceBytes, 'FILL')];
    (component as unknown as { fills: unknown[]; strokes: unknown[] }).strokes = [];

    const sourceParent = source.parent;
    if (!sourceParent) {
      throw new Error('Selected layer cannot be replaced in place.');
    }

    const insertIndex = getInsertIndexAboveSource(sourceParent, source);
    sourceParent.insertChild(insertIndex, component);
    component.relativeTransform = source.relativeTransform;

    const piecesByKey = new Map(options.pieces.map((piece) => [piece.key, piece]));
    for (const region of computeNineSliceRegions(options.imageSize, options.slices)) {
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

    resizeNode(component, source.width, source.height);
    source.visible = false;
    figma.currentPage.selection = [component];
    figma.viewport.scrollAndZoomIntoView([component]);
  }
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
