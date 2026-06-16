import type { CornerRadii, RegionKey, Size, SliceSettings } from './nine-slice';

export interface SelectedImagePayload {
  bytes: Uint8Array;
  layerName: string;
  slices?: SliceSettings;
  isNineSlice?: boolean;
  cornerRadii?: CornerRadii;
  sourceNodeId?: string;
  layerBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SlicePiecePayload {
  key: RegionKey;
  bytes: Uint8Array;
}

export type UiToPluginMessage =
  | {
      type: 'create-nine-slice';
      imageSize: Size;
      slices: SliceSettings;
      pieces: SlicePiecePayload[];
    }
  | { type: 'refresh-selection' }
  | { type: 'cancel' };

export type PluginToUiMessage =
  | { type: 'selection-ready'; platform: 'figma' | 'mastergo'; image: SelectedImagePayload }
  | { type: 'selection-error'; platform: 'figma' | 'mastergo'; message: string }
  | { type: 'create-started' }
  | { type: 'create-done'; message: string }
  | { type: 'create-error'; message: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export function unwrapUiMessage(raw: unknown): UiToPluginMessage {
  const wrapped = raw as { pluginMessage?: UiToPluginMessage };
  return wrapped?.pluginMessage ?? (raw as UiToPluginMessage);
}
