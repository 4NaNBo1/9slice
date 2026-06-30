import { parseNineSliceMetadata, type NineSliceMetadata } from './nine-slice';

export const NINE_SLICE_METADATA_KEY = 'nineSliceSettings';
export const NINE_SLICE_SHARED_NAMESPACE = '9slice';
export const NINE_SLICE_LAYER_NAME_DELIMITER = '\uE000';

function base64UrlDecodeUtf8(encoded: string): string {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function decodeNineSliceLayerName(rawName: string): { displayName: string; settingsJson?: string } {
  const idx = rawName.indexOf(NINE_SLICE_LAYER_NAME_DELIMITER);
  if (idx < 0) return { displayName: rawName };
  const displayName = rawName.slice(0, idx) || rawName;
  try {
    const settingsJson = base64UrlDecodeUtf8(rawName.slice(idx + 1));
    if (!parseNineSliceMetadata(settingsJson)) return { displayName: rawName };
    return { displayName, settingsJson };
  } catch {
    return { displayName: rawName };
  }
}

export function readNineSliceMetadataFromNode(node: any): NineSliceMetadata | undefined {
  if (!node || typeof node !== 'object') return undefined;
  try {
    if (typeof node.getSharedPluginData === 'function') {
      const shared = node.getSharedPluginData(NINE_SLICE_SHARED_NAMESPACE, NINE_SLICE_METADATA_KEY);
      const parsed = shared ? parseNineSliceMetadata(shared) : undefined;
      if (parsed) return parsed;
    }
  } catch { /* ignore */ }
  if (typeof node.getPluginData === 'function') {
    try {
      const raw = node.getPluginData(NINE_SLICE_METADATA_KEY);
      if (raw) return parseNineSliceMetadata(raw);
    } catch { /* ignore */ }
  }
  const fromName = decodeNineSliceLayerName(typeof node.name === 'string' ? node.name : '');
  if (fromName.settingsJson) return parseNineSliceMetadata(fromName.settingsJson);
  return undefined;
}
