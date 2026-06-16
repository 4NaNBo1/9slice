import { computeNineSliceRegions, mapSemanticConstraints } from '../nine-slice';
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

    const bytes = await node.exportAsync({ format: 'PNG' });
    return {
      bytes,
      layerName: node.name || 'Image',
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

    const component = mg.createComponent();
    component.name = options.sourceName;
    safeResize(component, options.imageSize.width, options.imageSize.height);
    component.fills = [await createImagePaint(options.sourceBytes)];
    component.strokes = [];
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

    const piecesByKey = new Map(options.pieces.map((piece) => [piece.key, piece]));
    for (const region of computeNineSliceRegions(options.imageSize, options.slices)) {
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

    safeResize(component, source.width ?? options.imageSize.width, source.height ?? options.imageSize.height);
    source.visible = false;
    mg.document.currentPage.selection = [component];
    try {
      mg.viewport.scrollAndZoomIntoView([component]);
    } catch {
      // Viewport helper is not present in all MasterGo plugin runtimes.
    }
  }
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
