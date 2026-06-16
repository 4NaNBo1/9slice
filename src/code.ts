declare const __html__: string;

import { logger, setLogSink } from './logger';
import { validateSliceSettings } from './nine-slice';
import { createPlatformAdapter } from './platform';
import type { SelectedImagePayload } from './shared';
import { unwrapUiMessage } from './shared';

const platform = createPlatformAdapter();
let selectedImage: SelectedImagePayload | undefined;

setLogSink((message) => platform.postMessage(message));
platform.showUI(__html__);

void refreshSelection();
platform.onSelectionChange(() => {
  void refreshSelection();
});

platform.onMessage((rawMessage) => {
  void handleMessage(rawMessage);
});

async function handleMessage(rawMessage: unknown): Promise<void> {
  const message = unwrapUiMessage(rawMessage);

  if (message.type === 'refresh-selection') {
    await refreshSelection();
    return;
  }

  if (message.type === 'cancel') {
    platform.closePlugin();
    return;
  }

  if (message.type === 'create-nine-slice') {
    if (!selectedImage) {
      platform.postMessage({ type: 'create-error', message: 'Select an image-filled layer first.' });
      return;
    }

    const validation = validateSliceSettings(message.imageSize, message.slices);
    if (!validation.ok) {
      platform.postMessage({ type: 'create-error', message: validation.message });
      return;
    }

    try {
      platform.postMessage({ type: 'create-started' });
      await platform.createNineSliceComponent({
        imageSize: message.imageSize,
        slices: message.slices,
        pieces: message.pieces,
        sourceName: selectedImage.layerName,
        sourceNodeId: selectedImage.sourceNodeId,
        sourceBytes: selectedImage.bytes,
        sourceBounds: selectedImage.layerBounds,
      });
      platform.postMessage({ type: 'create-done', message: '9-slice component created.' });
      platform.notify('9-slice component created.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to create 9-slice component.';
      logger.error(text);
      platform.postMessage({ type: 'create-error', message: text });
      platform.notify(text, { error: true });
    }
  }
}

async function refreshSelection(): Promise<void> {
  try {
    selectedImage = await platform.readSelectedImage();
    platform.postMessage({
      type: 'selection-ready',
      platform: platform.platform,
      image: selectedImage,
    });
  } catch (error) {
    selectedImage = undefined;
    const message = error instanceof Error ? error.message : 'Select an image-filled layer.';
    platform.postMessage({
      type: 'selection-error',
      platform: platform.platform,
      message,
    });
  }
}
