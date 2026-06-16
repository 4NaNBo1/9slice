import type { Size, SliceSettings } from '../nine-slice';
import type { SelectedImagePayload, SlicePiecePayload } from '../shared';

export interface CreateNineSliceOptions {
  imageSize: Size;
  slices: SliceSettings;
  pieces: SlicePiecePayload[];
  sourceName: string;
  sourceNodeId?: string;
  sourceBytes?: Uint8Array;
  sourceBounds?: SelectedImagePayload['layerBounds'];
}

export interface SelectionInfo {
  count: number;
  names: string[];
}

export interface PlatformAdapter {
  readonly platform: 'figma' | 'mastergo';
  showUI(html: string): void;
  postMessage(message: unknown): void;
  notify(message: string, options?: { error?: boolean }): void;
  closePlugin(): void;
  onMessage(handler: (message: unknown) => void): void;
  onSelectionChange(handler: () => void): void;
  getSelectionInfo(): SelectionInfo;
  readSelectedImage(): Promise<SelectedImagePayload>;
  createNineSliceComponent(options: CreateNineSliceOptions): Promise<void>;
}
