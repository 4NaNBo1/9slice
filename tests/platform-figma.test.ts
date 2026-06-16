import { describe, expect, it } from 'vitest';

import { NINE_SLICE_METADATA_KEY, serializeNineSliceMetadata, type RegionKey } from '../src/nine-slice';
import { FigmaAdapter } from '../src/platform/figma';

const regionKeys: RegionKey[] = ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight'];

interface TestNode {
  id?: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  parent: TestParent | TestNode | null;
  children: TestNode[];
  fills: unknown[];
  strokes: unknown[];
  effects: unknown[];
  effectStyleId?: string;
  clipsContent?: boolean;
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  constraints?: unknown;
  relativeTransform: [[number, number, number], [number, number, number]];
  exportOptions: unknown[];
  resize(width: number, height: number): void;
  appendChild(child: TestNode): void;
  remove(): void;
  exportAsync(options: { format: 'PNG'; useAbsoluteBounds?: boolean }): Promise<Uint8Array>;
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
}

interface TestParent {
  children: TestNode[];
  insertChild(index: number, child: TestNode): void;
}

function createNode(name: string, width = 0, height = 0): TestNode {
  const pluginData = new Map<string, string>();
  return {
    name,
    width,
    height,
    x: 0,
    y: 0,
    visible: true,
    parent: null,
    children: [],
    fills: [],
    strokes: [],
    effects: [],
    relativeTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    exportOptions: [],
    resize(nextWidth, nextHeight) {
      this.width = nextWidth;
      this.height = nextHeight;
    },
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
    },
    remove() {
      if (!this.parent || !('children' in this.parent)) return;
      const siblings = this.parent.children;
      const index = siblings.indexOf(this);
      if (index >= 0) siblings.splice(index, 1);
      this.parent = null;
    },
    async exportAsync(options) {
      this.exportOptions.push(options);
      return new Uint8Array([7]);
    },
    getPluginData(key) {
      return pluginData.get(key) ?? '';
    },
    setPluginData(key, value) {
      if (value) {
        pluginData.set(key, value);
      } else {
        pluginData.delete(key);
      }
    },
  };
}

function createParent(children: TestNode[]): TestParent {
  const parent: TestParent = {
    children,
    insertChild(index, child) {
      child.parent = this;
      this.children.splice(index, 0, child);
    },
  };

  for (const child of children) {
    child.parent = parent;
  }

  return parent;
}

function installFigmaStub(source: TestNode, rectangles: TestNode[]): TestNode {
  const component = createNode('component');

  (globalThis as unknown as { figma: unknown }).figma = {
    createComponent: () => component,
    createFrame: () => createNode('frame'),
    createRectangle: () => {
      const rect = createNode('rect');
      rectangles.push(rect);
      return rect;
    },
    createImage: () => ({ hash: 'image-hash' }),
    getImageByHash: (hash: string) =>
      hash === 'source-hash'
        ? {
            getBytesAsync: async () => new Uint8Array([9]),
          }
        : null,
    getNodeByIdAsync: async (id: string) => (id === source.id ? source : null),
    currentPage: {
      selection: [source],
    },
    viewport: {
      scrollAndZoomIntoView: () => undefined,
    },
    ui: {
      postMessage: () => undefined,
    },
    showUI: () => undefined,
    notify: () => undefined,
    closePlugin: () => undefined,
    commitUndo: () => undefined,
    on: () => undefined,
  };
  return component;
}

describe('FigmaAdapter.createNineSliceComponent', () => {
  it('keeps all source effects outside the created Figma component bounds', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    source.effects = [
      { type: 'DROP_SHADOW', visible: true },
      { type: 'LAYER_BLUR', visible: true },
    ];
    source.effectStyleId = 'effect-style-id';
    source.cornerRadius = 12;
    createParent([source]);

    const rectangles: TestNode[] = [];
    const component = installFigmaStub(source, rectangles);

    await new FigmaAdapter().createNineSliceComponent({
      imageSize: { width: 100, height: 50 },
      slices: { top: 10, right: 10, bottom: 10, left: 10 },
      pieces: regionKeys.map((key) => ({ key, bytes: new Uint8Array([1]) })),
      sourceName: 'source',
      sourceNodeId: 'source-id',
      sourceBytes: new Uint8Array([1]),
      sourceBounds: { x: 0, y: 0, width: 100, height: 50 },
    });

    expect(component).toMatchObject({
      clipsContent: false,
      effects: source.effects,
      effectStyleId: 'effect-style-id',
      cornerRadius: 12,
    });
    expect(component.fills).toEqual([{ type: 'IMAGE', imageHash: 'image-hash', scaleMode: 'FILL', visible: false, opacity: 0 }]);
    expect(component.children.map((child) => child.name)).toEqual(regionKeys);
    expect(rectangles.every((rect) => rect.parent === component)).toBe(true);
  });

  it('stores slice metadata on the created Figma component', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    createParent([source]);

    const component = installFigmaStub(source, []);

    await new FigmaAdapter().createNineSliceComponent({
      imageSize: { width: 100, height: 50 },
      slices: { top: 10, right: 11, bottom: 12, left: 13 },
      pieces: regionKeys.map((key) => ({ key, bytes: new Uint8Array([1]) })),
      sourceName: 'source',
      sourceNodeId: 'source-id',
      sourceBytes: new Uint8Array([1]),
      sourceBounds: { x: 0, y: 0, width: 100, height: 50 },
    });

    expect(component.getPluginData(NINE_SLICE_METADATA_KEY)).toBe(
      serializeNineSliceMetadata({
        imageSize: { width: 100, height: 50 },
        slices: { top: 10, right: 11, bottom: 12, left: 13 },
      }),
    );
  });

  it('removes the selected Figma nine-slice component when replacing it', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    const parent = createParent([source]);

    const component = installFigmaStub(source, []);

    await new FigmaAdapter().createNineSliceComponent({
      imageSize: { width: 100, height: 50 },
      slices: { top: 10, right: 10, bottom: 10, left: 10 },
      pieces: regionKeys.map((key) => ({ key, bytes: new Uint8Array([1]) })),
      sourceName: 'source',
      sourceNodeId: 'source-id',
      sourceBytes: new Uint8Array([1]),
      sourceBounds: { x: 0, y: 0, width: 100, height: 50 },
      replaceSource: true,
    });

    expect(parent.children).toEqual([component]);
  });

  it('restores effects from an existing Figma nine-slice content layer when replacing it', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    source.setPluginData(
      NINE_SLICE_METADATA_KEY,
      serializeNineSliceMetadata({
        imageSize: { width: 100, height: 50 },
        slices: { top: 10, right: 10, bottom: 10, left: 10 },
      }),
    );
    const sourceContent = createNode('content', 100, 50);
    sourceContent.effects = [{ type: 'DROP_SHADOW', visible: true }];
    sourceContent.effectStyleId = 'effect-style-id';
    source.appendChild(sourceContent);
    createParent([source]);

    const component = installFigmaStub(source, []);

    await new FigmaAdapter().createNineSliceComponent({
      imageSize: { width: 100, height: 50 },
      slices: { top: 10, right: 10, bottom: 10, left: 10 },
      pieces: regionKeys.map((key) => ({ key, bytes: new Uint8Array([1]) })),
      sourceName: 'source',
      sourceNodeId: 'source-id',
      sourceBytes: new Uint8Array([1]),
      sourceBounds: { x: 0, y: 0, width: 100, height: 50 },
      replaceSource: true,
    });

    expect(component.effects).toEqual(sourceContent.effects);
    expect(component.effectStyleId).toBe('effect-style-id');
  });
});

describe('FigmaAdapter.commitUndo', () => {
  it('forwards the commit to figma.commitUndo', () => {
    let commitCount = 0;
    (globalThis as unknown as { figma: unknown }).figma = {
      commitUndo: () => {
        commitCount += 1;
      },
    };

    new FigmaAdapter().commitUndo();

    expect(commitCount).toBe(1);
  });
});

describe('FigmaAdapter.readSelectedImage', () => {
  it('reads ordinary Figma image fill bytes without exporting the layer', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    source.fills = [{ type: 'IMAGE', imageHash: 'source-hash', scaleMode: 'FILL' }];
    createParent([source]);

    installFigmaStub(source, []);

    await expect(new FigmaAdapter().readSelectedImage()).resolves.toMatchObject({
      bytes: new Uint8Array([9]),
    });

    expect(source.exportOptions).toEqual([]);
  });

  it('includes normalized Figma corner radii with the selected image', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    source.cornerRadius = 12;
    source.topRightRadius = 8;
    source.bottomLeftRadius = 10;
    source.fills = [{ type: 'IMAGE', imageHash: 'source-hash', scaleMode: 'FILL' }];
    createParent([source]);

    installFigmaStub(source, []);

    await expect(new FigmaAdapter().readSelectedImage()).resolves.toMatchObject({
      cornerRadii: {
        topLeft: 12,
        topRight: 8,
        bottomRight: 12,
        bottomLeft: 10,
      },
    });
  });

  it('restores slice metadata and source image bytes from a selected nine-slice component', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    source.fills = [{ type: 'IMAGE', imageHash: 'source-hash', scaleMode: 'FILL' }];
    source.setPluginData(
      NINE_SLICE_METADATA_KEY,
      serializeNineSliceMetadata({
        imageSize: { width: 100, height: 50 },
        slices: { top: 10, right: 11, bottom: 12, left: 13 },
      }),
    );
    createParent([source]);

    installFigmaStub(source, []);

    await expect(new FigmaAdapter().readSelectedImage()).resolves.toMatchObject({
      bytes: new Uint8Array([9]),
      layerName: 'source',
      sourceNodeId: 'source-id',
      isNineSlice: true,
      slices: { top: 10, right: 11, bottom: 12, left: 13 },
    });
  });
});
