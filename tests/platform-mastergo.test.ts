import { describe, expect, it } from 'vitest';

import { MasterGoAdapter } from '../src/platform/mastergo';
import { NINE_SLICE_METADATA_KEY, serializeNineSliceMetadata, type RegionKey } from '../src/nine-slice';

const regionKeys: RegionKey[] = ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight'];

interface TestNode {
  id?: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  isVisible: boolean;
  visible?: boolean;
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
  relativeTransform?: [[number, number, number], [number, number, number]];
  exportOptions: unknown[];
  resize(width: number, height: number): void;
  appendChild(child: TestNode): void;
  remove(): void;
  exportAsync(options: { format: 'PNG'; useAbsoluteBounds?: boolean; useRenderBounds?: boolean }): Promise<Uint8Array>;
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
    isVisible: true,
    parent: null,
    children: [],
    fills: [],
    strokes: [],
    effects: [],
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

function installMasterGoStub(source: TestNode, rectangles: TestNode[]): TestNode {
  const component = createNode('component');

  (globalThis as unknown as { mg: unknown }).mg = {
    createComponent: () => component,
    createFrame: () => createNode('frame'),
    createRectangle: () => {
      const rect = createNode('rect');
      rect.effects = [{ type: 'DROP_SHADOW', visible: true }];
      rectangles.push(rect);
      return rect;
    },
    createImage: async () => ({ href: 'image-ref' }),
    getImageByHref: (href: string) =>
      href === 'source-ref'
        ? {
            getBytesAsync: async () => new Uint8Array([9]),
          }
        : undefined,
    getNodeById: (id: string) => (id === source.id ? source : null),
    document: {
      currentPage: {
        selection: [source],
      },
    },
    viewport: {
      scrollAndZoomIntoView: () => undefined,
    },
    commitUndo: () => undefined,
  };
  return component;
}

describe('MasterGoAdapter.createNineSliceComponent', () => {
  it('keeps all source effects outside the created MasterGo component bounds', async () => {
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
    const component = installMasterGoStub(source, rectangles);

    await new MasterGoAdapter().createNineSliceComponent({
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
    expect(component.fills).toEqual([{ type: 'IMAGE', imageRef: 'image-ref', scaleMode: 'STRETCH', isVisible: false, alpha: 0, blendMode: 'NORMAL' }]);
    expect(component.children.map((child) => child.name)).toEqual(regionKeys);
    expect(rectangles.every((rect) => rect.parent === component && rect.effects.length === 0)).toBe(true);
  });

  it('lays out slice nodes at the selected layer size', async () => {
    const source = createNode('source', 200, 100);
    source.id = 'source-id';
    source.relativeTransform = [
      [1, 0, 24],
      [0, 1, 36],
    ];
    createParent([source]);

    const rectangles: TestNode[] = [];
    installMasterGoStub(source, rectangles);

    await new MasterGoAdapter().createNineSliceComponent({
      imageSize: { width: 100, height: 50 },
      slices: { top: 10, right: 10, bottom: 10, left: 10 },
      pieces: regionKeys.map((key) => ({ key, bytes: new Uint8Array([1]) })),
      sourceName: 'source',
      sourceNodeId: 'source-id',
      sourceBytes: new Uint8Array([1]),
      sourceBounds: { x: 24, y: 36, width: 200, height: 100 },
    });

    const byName = new Map(rectangles.map((rect) => [rect.name, rect]));
    expect(byName.get('topLeft')).toMatchObject({ x: 0, y: 0, width: 20, height: 20 });
    expect(byName.get('top')).toMatchObject({ x: 20, y: 0, width: 160, height: 20 });
    expect(byName.get('topRight')).toMatchObject({ x: 180, y: 0, width: 20, height: 20 });
    expect(byName.get('center')).toMatchObject({ x: 20, y: 20, width: 160, height: 60 });
    expect(byName.get('bottomRight')).toMatchObject({ x: 180, y: 80, width: 20, height: 20 });
  });

  it('hides the selected MasterGo node after creating the replacement component', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    createParent([source]);

    const rectangles: TestNode[] = [];
    installMasterGoStub(source, rectangles);

    await new MasterGoAdapter().createNineSliceComponent({
      imageSize: { width: 100, height: 50 },
      slices: { top: 10, right: 10, bottom: 10, left: 10 },
      pieces: regionKeys.map((key) => ({ key, bytes: new Uint8Array([1]) })),
      sourceName: 'source',
      sourceNodeId: 'source-id',
      sourceBytes: new Uint8Array([1]),
      sourceBounds: { x: 0, y: 0, width: 100, height: 50 },
    });

    expect(source.isVisible).toBe(false);
  });

  it('stores slice metadata on the created MasterGo component', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    createParent([source]);

    const rectangles: TestNode[] = [];
    const component = installMasterGoStub(source, rectangles);

    await new MasterGoAdapter().createNineSliceComponent({
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

  it('removes the selected MasterGo nine-slice component when replacing it', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    const parent = createParent([source]);

    const rectangles: TestNode[] = [];
    const component = installMasterGoStub(source, rectangles);

    await new MasterGoAdapter().createNineSliceComponent({
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

  it('restores effects from an existing MasterGo nine-slice content layer when replacing it', async () => {
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

    const rectangles: TestNode[] = [];
    const component = installMasterGoStub(source, rectangles);

    await new MasterGoAdapter().createNineSliceComponent({
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

describe('MasterGoAdapter.commitUndo', () => {
  it('forwards the commit to mg.commitUndo', () => {
    let commitCount = 0;
    (globalThis as unknown as { mg: unknown }).mg = {
      commitUndo: () => {
        commitCount += 1;
      },
    };

    new MasterGoAdapter().commitUndo();

    expect(commitCount).toBe(1);
  });
});

describe('MasterGoAdapter.readSelectedImage', () => {
  it('reads ordinary MasterGo image fill bytes without exporting the layer', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    source.fills = [{ type: 'IMAGE', imageRef: 'source-ref' }];
    createParent([source]);

    installMasterGoStub(source, []);

    await expect(new MasterGoAdapter().readSelectedImage()).resolves.toMatchObject({
      bytes: new Uint8Array([9]),
    });

    expect(source.exportOptions).toEqual([]);
  });

  it('includes normalized MasterGo corner radii with the selected image', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    source.cornerRadius = 14;
    source.topLeftRadius = 6;
    source.bottomRightRadius = 9;
    source.fills = [{ type: 'IMAGE', imageRef: 'source-ref' }];
    createParent([source]);

    installMasterGoStub(source, []);

    await expect(new MasterGoAdapter().readSelectedImage()).resolves.toMatchObject({
      cornerRadii: {
        topLeft: 6,
        topRight: 14,
        bottomRight: 9,
        bottomLeft: 14,
      },
    });
  });

  it('restores slice metadata and source image bytes from a selected nine-slice component', async () => {
    const source = createNode('source', 100, 50);
    source.id = 'source-id';
    source.fills = [{ type: 'IMAGE', imageRef: 'source-ref' }];
    source.setPluginData(
      NINE_SLICE_METADATA_KEY,
      serializeNineSliceMetadata({
        imageSize: { width: 100, height: 50 },
        slices: { top: 10, right: 11, bottom: 12, left: 13 },
      }),
    );
    createParent([source]);

    installMasterGoStub(source, []);

    await expect(new MasterGoAdapter().readSelectedImage()).resolves.toMatchObject({
      bytes: new Uint8Array([9]),
      layerName: 'source',
      sourceNodeId: 'source-id',
      isNineSlice: true,
      slices: { top: 10, right: 11, bottom: 12, left: 13 },
    });
  });
});
