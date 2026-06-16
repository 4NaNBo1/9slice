import { computeNineSliceRegions, formatSlicePercent, sliceFromPercent, validateSliceSettings, type SliceSettings } from './nine-slice';
import {
  dragNumberValue,
  formatCommittedNumberInput,
  isNumberScrubHandleClassName,
  normalizeCommittedNumberInput,
  truncateNumberValue,
} from './numeric-control';
import {
  computePreviewMetrics,
  getExtendedGuideLines,
  getGuideArrowheads,
  getSliceGuideAtPoint,
  updateSliceFromGuide,
  type ImagePoint,
  type SliceGuide,
} from './preview-drag';
import { latestReleaseUrl, shouldShowUpdate, type ReleaseUpdate } from './plugin-metadata';
import type { PluginToUiMessage, SlicePiecePayload, UiToPluginMessage } from './shared';

declare const __VERSION__: string;

interface ImageState {
  platform: 'figma' | 'mastergo';
  layerName: string;
  bytes: Uint8Array;
  image: HTMLImageElement;
  url: string;
  size: {
    width: number;
    height: number;
  };
}

type SliceInputMode = 'pixel' | 'percent';

interface NumberDragState {
  input: HTMLInputElement;
  key: keyof SliceSettings;
  mode: SliceInputMode;
  pointerId: number;
  startX: number;
  startValue: number;
  dragged: boolean;
}

const PREVIEW_MAX_SIZE = { width: 340, height: 250 };
const PREVIEW_GUIDE_EXTENSION_PX = 10;
const PREVIEW_GUIDE_ARROW_SIZE_PX = 8;
const PREVIEW_GUIDE_ARROW_GAP_PX = 4;
const PREVIEW_GUIDE_PADDING = PREVIEW_GUIDE_EXTENSION_PX + PREVIEW_GUIDE_ARROW_GAP_PX + PREVIEW_GUIDE_ARROW_SIZE_PX + 2;
const REPO_OWNER = '4NaNBo1';
const REPO_NAME = '9slice';
const CURRENT_VERSION = __VERSION__;

const app = document.getElementById('app');
let imageState: ImageState | undefined;
let slices: SliceSettings = { top: 16, right: 16, bottom: 16, left: 16 };
let statusMessage = 'Select one exportable image layer to begin.';
let busy = false;
let activeGuide: SliceGuide | undefined;
let activeNumberDrag: NumberDragState | undefined;
let availableUpdate: ReleaseUpdate | undefined;

render();
postToPlugin({ type: 'refresh-selection' });
void checkForUpdate();

window.onmessage = (event: MessageEvent) => {
  const raw = event.data as { pluginMessage?: PluginToUiMessage };
  const message = raw?.pluginMessage ?? (event.data as PluginToUiMessage);
  void handlePluginMessage(message);
};

async function handlePluginMessage(message: PluginToUiMessage): Promise<void> {
  if (message.type === 'selection-ready') {
    clearImageState();
    imageState = await decodeImage(message.platform, message.image.layerName, toUint8Array(message.image.bytes));
    slices = defaultSlices(imageState.size);
    statusMessage = `Ready: ${message.image.layerName} (${imageState.size.width} x ${imageState.size.height})`;
    busy = false;
    render();
    drawPreview();
    return;
  }

  if (message.type === 'selection-error') {
    clearImageState();
    statusMessage = message.message;
    busy = false;
    render();
    return;
  }

  if (message.type === 'create-started') {
    busy = true;
    statusMessage = 'Creating 9-slice component...';
    render();
    drawPreview();
    return;
  }

  if (message.type === 'create-done') {
    busy = false;
    statusMessage = message.message;
    render();
    drawPreview();
    return;
  }

  if (message.type === 'create-error') {
    busy = false;
    statusMessage = message.message;
    render();
    drawPreview();
  }
}

function render(): void {
  if (!app) return;

  app.innerHTML = `
    <style>
      :root {
        color: #eef2ff;
        background: #080b12;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * { box-sizing: border-box; }

      html,
      body,
      #app {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      body {
        margin: 0;
        background:
          radial-gradient(circle at 18% 0%, rgba(87, 111, 255, 0.18), transparent 32%),
          radial-gradient(circle at 100% 12%, rgba(168, 85, 247, 0.18), transparent 26%),
          linear-gradient(180deg, #111827 0%, #070a10 100%);
      }

      .shell {
        height: 100vh;
        padding: 12px 12px 34px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: hidden;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mark {
        width: 22px;
        height: 22px;
        border-radius: 7px;
        background:
          linear-gradient(90deg, rgba(255, 255, 255, 0.38) 1px, transparent 1px),
          linear-gradient(0deg, rgba(255, 255, 255, 0.38) 1px, transparent 1px),
          linear-gradient(135deg, #38bdf8 0%, #2563eb 52%, #8b5cf6 100%);
        background-size: 8px 8px, 8px 8px, auto;
        box-shadow: 0 8px 24px rgba(37, 99, 235, 0.34);
      }

      h1 {
        margin: 0;
        font-size: 16px;
        letter-spacing: -0.03em;
      }

      .badge {
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #93c5fd;
        background: rgba(15, 23, 42, 0.82);
      }

      .section-title {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .settings-head .section-title {
        margin: 0;
      }

      .card {
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.78);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
        overflow: hidden;
        backdrop-filter: blur(18px);
      }

      .preview {
        height: clamp(132px, 40vh, 188px);
        display: grid;
        place-items: center;
        padding: 10px;
        background:
          linear-gradient(45deg, rgba(148, 163, 184, 0.16) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(148, 163, 184, 0.16) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.16) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.16) 75%),
          #111827;
        background-size: 18px 18px;
        background-position: 0 0, 0 9px, 9px -9px, -9px 0;
      }

      canvas {
        max-width: 100%;
        max-height: 100%;
        border-radius: 12px;
        image-rendering: pixelated;
        filter: drop-shadow(0 20px 30px rgba(0, 0, 0, 0.34));
        touch-action: none;
        user-select: none;
      }

      .empty {
        margin: 0;
        max-width: 260px;
        color: #94a3b8;
        text-align: center;
        line-height: 1.5;
      }

      .settings-head {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 8px;
      }

      .settings {
        display: grid;
        gap: 8px;
      }

      .setting-row {
        display: grid;
        grid-template-columns: 34px minmax(68px, 0.8fr) minmax(88px, 1fr) minmax(104px, 1.15fr);
        align-items: center;
        gap: 10px;
      }

      .icon {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        position: relative;
        background: rgba(59, 130, 246, 0.12);
        --slice-line-muted: rgba(56, 189, 248, 0.22);
        --slice-line-active: #38bdf8;
        --slice-left-line: var(--slice-line-muted);
        --slice-top-line: var(--slice-line-muted);
        --slice-right-line: var(--slice-line-muted);
        --slice-bottom-line: var(--slice-line-muted);
      }

      .icon.left {
        --slice-left-line: var(--slice-line-active);
      }

      .icon.top {
        --slice-top-line: var(--slice-line-active);
      }

      .icon.right {
        --slice-right-line: var(--slice-line-active);
      }

      .icon.bottom {
        --slice-bottom-line: var(--slice-line-active);
      }

      .icon::before,
      .icon::after {
        content: "";
        position: absolute;
      }

      .icon::before {
        top: 8px;
        bottom: 8px;
        left: 10px;
        width: 2px;
        background: var(--slice-left-line);
        box-shadow: 12px 0 0 var(--slice-right-line);
      }

      .icon::after {
        left: 8px;
        right: 8px;
        top: 10px;
        height: 2px;
        background: var(--slice-top-line);
        box-shadow: 0 12px 0 var(--slice-bottom-line);
      }

      .label {
        color: #dbeafe;
        font-size: 13px;
        font-weight: 750;
      }

      input {
        width: 100%;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 12px;
        min-height: 36px;
        padding: 8px 10px;
        font: inherit;
        font-size: 13px;
        color: #eef2ff;
        background: rgba(2, 6, 23, 0.48);
      }

      .percent-input {
        color: #93c5fd;
      }

      .number-field {
        position: relative;
        display: block;
      }

      .number-field input {
        padding-right: 34px;
      }

      .number-suffix {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        display: flex;
        width: 32px;
        align-items: center;
        justify-content: center;
        color: #93c5fd;
        font-size: 12px;
        cursor: ew-resize;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
      }

      .scrub-input {
        cursor: text;
      }

      .scrub-input.is-scrubbing {
        user-select: none;
      }

      input:focus {
        outline: 2px solid rgba(56, 189, 248, 0.46);
        border-color: rgba(56, 189, 248, 0.72);
      }

      .actions {
        display: grid;
        gap: 8px;
      }

      button {
        border: 0;
        border-radius: 12px;
        padding: 9px 12px;
        font: inherit;
        font-weight: 800;
        background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
        color: #ffffff;
        cursor: pointer;
        box-shadow: 0 14px 30px rgba(37, 99, 235, 0.28);
      }

      .icon-button {
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.78);
        color: #cbd5e1;
        box-shadow: none;
      }

      .icon-button:hover {
        color: #ffffff;
        border-color: rgba(56, 189, 248, 0.5);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.48;
      }

      .status {
        min-height: 16px;
        margin: 0;
        color: #94a3b8;
        font-size: 11px;
        line-height: 1.35;
      }

      .footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10;
        padding: 6px 48px;
        color: #64748b;
        background: rgba(8, 11, 18, 0.82);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        text-align: center;
        font-size: 11px;
      }

      .footer a {
        color: #93c5fd;
        text-decoration: none;
        cursor: pointer;
      }

      .footer a:hover {
        text-decoration: underline;
      }

      .footer .update-link {
        color: #4ade80;
      }

      .stack {
        display: grid;
        gap: 6px;
        min-height: 0;
      }
    </style>
    <section class="shell">
      <div class="topbar">
        <div class="brand">
          <div class="mark"></div>
          <h1>9-Slice Scaling</h1>
        </div>
        <span class="badge">${imageState?.platform ?? 'waiting'}</span>
      </div>

      <div class="stack">
        <p class="section-title">View</p>
        <div class="card">
        <div class="preview">
          ${imageState ? '<canvas id="previewCanvas" aria-label="Preview with draggable slice guides"></canvas>' : '<p class="empty">Select one exportable image layer. The exported image preview and slice guides will appear here.</p>'}
        </div>
        </div>
      </div>

      <div class="stack">
        <div class="settings-head">
          <p class="section-title">Setting</p>
          <button class="icon-button" id="resetButton" title="Reset" ${!imageState || busy ? 'disabled' : ''}>R</button>
        </div>
        <div class="settings">
          ${sliceInput('left', 'Left')}
          ${sliceInput('top', 'Top')}
          ${sliceInput('right', 'Right')}
          ${sliceInput('bottom', 'Bottom')}
          <div class="actions">
            <button id="createButton" ${!imageState || busy ? 'disabled' : ''}>Confirm</button>
          </div>
          <p class="status" id="statusText">${escapeHtml(statusMessage)}</p>
        </div>
      </div>
    </section>
    <footer class="footer">
      by <a id="authorLink">${REPO_OWNER}</a> · <a id="versionLink">v${CURRENT_VERSION}</a>${availableUpdate ? ` · <a id="updateLink" class="update-link">v${escapeHtml(availableUpdate.version)} ↑</a>` : ''}
    </footer>
  `;

  for (const key of ['top', 'right', 'bottom', 'left'] as const) {
    const input = document.getElementById(`${key}Input`) as HTMLInputElement | null;
    input?.addEventListener('blur', () => {
      commitNumberInput(input, key, 'pixel');
    });
    input?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitNumberInput(input, key, 'pixel');
      input.blur();
    });
    if (input) attachNumberScrub(input, key, 'pixel');

    const percentInput = document.getElementById(`${key}PercentInput`) as HTMLInputElement | null;
    percentInput?.addEventListener('blur', () => {
      commitNumberInput(percentInput, key, 'percent');
    });
    percentInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitNumberInput(percentInput, key, 'percent');
      percentInput.blur();
    });
    if (percentInput) attachNumberScrub(percentInput, key, 'percent');
  }

  document.getElementById('resetButton')?.addEventListener('click', () => {
    if (!imageState) return;
    slices = defaultSlices(imageState.size);
    statusMessage = validationMessage();
    render();
    drawPreview();
  });

  document.getElementById('createButton')?.addEventListener('click', () => {
    void createNineSlice();
  });

  document.getElementById('authorLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    window.open(`https://github.com/${REPO_OWNER}`, '_blank');
  });

  document.getElementById('versionLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    window.open(`https://github.com/${REPO_OWNER}/${REPO_NAME}`, '_blank');
  });

  document.getElementById('updateLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    if (availableUpdate) window.open(latestReleaseUrl(REPO_OWNER, REPO_NAME, availableUpdate.tag), '_blank');
  });

  attachPreviewDragHandlers();
}

function sliceInput(key: keyof SliceSettings, label: string): string {
  return `
    <label class="setting-row">
      <span class="icon ${key}"></span>
      <span class="label">${label}</span>
      <span class="number-field percent-field">
        <input class="percent-input scrub-input" id="${key}PercentInput" type="text" inputmode="decimal" value="${slicePercent(key)}" aria-label="${label} slice percent" />
        <span class="number-suffix">%</span>
      </span>
      <span class="number-field pixel-field">
        <input class="scrub-input" id="${key}Input" type="text" inputmode="decimal" value="${formatNumberInputValue(slices[key])}" aria-label="${label} slice pixels" />
        <span class="number-suffix">px</span>
      </span>
    </label>
  `;
}

function slicePercent(key: keyof SliceSettings): string {
  if (!imageState) return '';
  return formatSlicePercent(slices[key], sliceAxis(key));
}

async function createNineSlice(): Promise<void> {
  if (!imageState) return;

  const validation = validateSliceSettings(imageState.size, slices);
  if (!validation.ok) {
    statusMessage = validation.message;
    render();
    drawPreview();
    return;
  }

  busy = true;
  statusMessage = 'Slicing image...';
  render();
  drawPreview();

  try {
    const pieces = await sliceImage(imageState.image, imageState.size, slices);
    postToPlugin({
      type: 'create-nine-slice',
      imageSize: imageState.size,
      slices,
      pieces,
    });
  } catch (error) {
    busy = false;
    statusMessage = error instanceof Error ? error.message : 'Failed to slice image.';
    render();
    drawPreview();
  }
}

async function sliceImage(image: HTMLImageElement, size: ImageState['size'], settings: SliceSettings): Promise<SlicePiecePayload[]> {
  const pieces: SlicePiecePayload[] = [];

  for (const region of computeNineSliceRegions(size, settings)) {
    if (region.source.width <= 0 || region.source.height <= 0) continue;

    const canvas = document.createElement('canvas');
    canvas.width = region.source.width;
    canvas.height = region.source.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');

    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      region.source.x,
      region.source.y,
      region.source.width,
      region.source.height,
      0,
      0,
      region.source.width,
      region.source.height,
    );

    pieces.push({
      key: region.key,
      bytes: await canvasToPngBytes(canvas),
    });
  }

  return pieces;
}

function drawPreview(): void {
  if (!imageState) return;

  const canvas = document.getElementById('previewCanvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  const metrics = computePreviewMetrics(imageState.size, PREVIEW_MAX_SIZE, PREVIEW_GUIDE_PADDING);
  canvas.width = metrics.canvasWidth;
  canvas.height = metrics.canvasHeight;

  const context = canvas.getContext('2d');
  if (!context) return;

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    imageState.image,
    metrics.padding,
    metrics.padding,
    imageState.size.width * metrics.scale,
    imageState.size.height * metrics.scale,
  );

  context.save();
  context.translate(metrics.padding, metrics.padding);
  context.scale(metrics.scale, metrics.scale);
  context.strokeStyle = '#ff5a1f';
  context.fillStyle = '#ff5a1f';
  context.lineWidth = Math.max(1 / metrics.scale, 1);

  const extension = PREVIEW_GUIDE_EXTENSION_PX / metrics.scale;
  const guideLines = getExtendedGuideLines(imageState.size, slices, extension);
  for (const line of guideLines) {
    drawGuideLine(context, line.x1, line.y1, line.x2, line.y2);
  }

  const arrowSize = PREVIEW_GUIDE_ARROW_SIZE_PX / metrics.scale;
  const arrowGap = PREVIEW_GUIDE_ARROW_GAP_PX / metrics.scale;
  for (const arrowhead of getGuideArrowheads(guideLines, arrowSize, arrowGap)) {
    drawGuideArrowhead(context, arrowhead.points);
  }
  context.restore();
}

function drawGuideLine(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function drawGuideArrowhead(context: CanvasRenderingContext2D, points: [ImagePoint, ImagePoint, ImagePoint]): void {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  context.lineTo(points[1].x, points[1].y);
  context.lineTo(points[2].x, points[2].y);
  context.closePath();
  context.fill();
}

function attachPreviewDragHandlers(): void {
  if (!imageState) return;

  const canvas = document.getElementById('previewCanvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  canvas.addEventListener('pointerdown', (event) => {
    const state = imageState;
    if (!state) return;

    const guide = getSliceGuideAtPoint(state.size, slices, canvasPointToImagePoint(canvas, event), guideHitTolerance());
    if (!guide) return;

    activeGuide = guide;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = previewCursorForGuide(guide);
    applyPreviewDrag(canvas, event, guide);
  });

  canvas.addEventListener('pointermove', (event) => {
    const state = imageState;
    if (!state) return;

    if (activeGuide) {
      applyPreviewDrag(canvas, event, activeGuide);
      return;
    }

    const guide = getSliceGuideAtPoint(state.size, slices, canvasPointToImagePoint(canvas, event), guideHitTolerance());
    canvas.style.cursor = previewCursorForGuide(guide);
  });

  canvas.addEventListener('pointerup', (event) => {
    const state = imageState;
    if (!state) return;

    activeGuide = undefined;
    canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = previewCursorForGuide(
      getSliceGuideAtPoint(state.size, slices, canvasPointToImagePoint(canvas, event), guideHitTolerance()),
    );
  });

  canvas.addEventListener('pointercancel', (event) => {
    activeGuide = undefined;
    canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = 'default';
  });
}

function applyPreviewDrag(canvas: HTMLCanvasElement, event: PointerEvent, guide: SliceGuide): void {
  if (!imageState) return;

  event.preventDefault();
  slices = updateSliceFromGuide(imageState.size, slices, guide, canvasPointToImagePoint(canvas, event));
  statusMessage = validationMessage();
  syncSliceControls();
  drawPreview();
}

function syncSliceControls(skipKey?: keyof SliceSettings, skipMode?: SliceInputMode): void {
  for (const key of ['top', 'right', 'bottom', 'left'] as const) {
    const input = document.getElementById(`${key}Input`) as HTMLInputElement | null;
    if (input && !(skipKey === key && skipMode === 'pixel')) input.value = formatNumberInputValue(slices[key]);

    const percentInput = document.getElementById(`${key}PercentInput`) as HTMLInputElement | null;
    if (percentInput && !(skipKey === key && skipMode === 'percent')) percentInput.value = slicePercent(key);
  }

  const status = document.getElementById('statusText');
  if (status) status.textContent = statusMessage;
}

function attachNumberScrub(input: HTMLInputElement, key: keyof SliceSettings, mode: SliceInputMode): void {
  const handle = numberScrubHandleFor(input);
  if (!handle) return;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !imageState || busy) return;

    event.preventDefault();
    activeNumberDrag = {
      input,
      key,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: normalizeCommittedNumberInput(
        input.value,
        0,
        mode === 'pixel' ? maxSliceValue(key) : maxSlicePercent(key),
        1,
      ),
      dragged: false,
    };
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!activeNumberDrag || activeNumberDrag.input !== input || activeNumberDrag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - activeNumberDrag.startX;
    if (!activeNumberDrag.dragged && Math.abs(deltaX) < 3) return;

    activeNumberDrag.dragged = true;
    input.classList.add('is-scrubbing');
    event.preventDefault();
    applyNumberDrag(activeNumberDrag, deltaX);
  });

  const stopDrag = (event: PointerEvent) => {
    if (!activeNumberDrag || activeNumberDrag.input !== input || activeNumberDrag.pointerId !== event.pointerId) return;

    if (activeNumberDrag.dragged) {
      event.preventDefault();
      syncSliceControls();
    }

    input.classList.remove('is-scrubbing');
    handle.releasePointerCapture(event.pointerId);
    activeNumberDrag = undefined;
  };

  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);
}

function numberScrubHandleFor(input: HTMLInputElement): HTMLElement | null {
  const handle = input.nextElementSibling;
  if (!(handle instanceof HTMLElement)) return null;
  return isNumberScrubHandleClassName(handle.className) ? handle : null;
}

function applyNumberDrag(state: NumberDragState, deltaX: number): void {
  if (!imageState) return;

  const min = 0;
  const max = state.mode === 'pixel' ? maxSliceValue(state.key) : maxSlicePercent(state.key);
  const step = 0.1;
  const value = dragNumberValue(state.startValue, deltaX, step, min, max);
  state.input.value = formatNumberInputValue(value);

  slices = {
    ...slices,
    [state.key]: state.mode === 'pixel' ? value : sliceFromPercent(value, sliceAxis(state.key), 0, maxSliceValue(state.key)),
  };
  statusMessage = validationMessage();
  syncSliceControls(state.key, state.mode);
  drawPreview();
}

function formatNumberInputValue(value: number): string {
  return String(truncateNumberValue(value, 1));
}

function commitNumberInput(input: HTMLInputElement, key: keyof SliceSettings, mode: SliceInputMode): void {
  if (!imageState) {
    input.value = formatNumberInputValue(slices[key]);
    return;
  }

  const value = normalizeCommittedNumberInput(input.value, 0, Number.POSITIVE_INFINITY, 1);
  input.value = formatCommittedNumberInput(input.value, 0, Number.POSITIVE_INFINITY, 1);
  slices = {
    ...slices,
    [key]: mode === 'pixel' ? value : sliceFromPercent(value, sliceAxis(key), 0, maxSliceValue(key)),
  };
  statusMessage = validationMessage();
  syncSliceControls(key, mode);
  drawPreview();
}

function sliceAxis(key: keyof SliceSettings): number {
  if (!imageState) return 1;
  return key === 'left' || key === 'right' ? imageState.size.width : imageState.size.height;
}

function maxSliceValue(key: keyof SliceSettings): number {
  if (!imageState) return 0;
  if (key === 'left') return imageState.size.width - slices.right - 1;
  if (key === 'right') return imageState.size.width - slices.left - 1;
  if (key === 'top') return imageState.size.height - slices.bottom - 1;
  return imageState.size.height - slices.top - 1;
}

function maxSlicePercent(key: keyof SliceSettings): number {
  return truncateNumberValue((maxSliceValue(key) / sliceAxis(key)) * 100, 1);
}

function canvasPointToImagePoint(canvas: HTMLCanvasElement, event: PointerEvent): ImagePoint {
  if (!imageState) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  const metrics = computePreviewMetrics(imageState.size, PREVIEW_MAX_SIZE, PREVIEW_GUIDE_PADDING);
  const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return {
    x: (canvasX - metrics.padding) / metrics.scale,
    y: (canvasY - metrics.padding) / metrics.scale,
  };
}

function guideHitTolerance(): number {
  if (!imageState) return 0;

  const metrics = computePreviewMetrics(imageState.size, PREVIEW_MAX_SIZE, PREVIEW_GUIDE_PADDING);
  return 8 / metrics.scale;
}

function previewCursorForGuide(guide: SliceGuide | undefined): string {
  if (guide === 'left' || guide === 'right') return 'ew-resize';
  if (guide === 'top' || guide === 'bottom') return 'ns-resize';
  return 'default';
}

function defaultSlices(size: ImageState['size']): SliceSettings {
  const value = Math.max(1, Math.min(16, Math.floor(Math.min(size.width, size.height) / 4)));
  return { top: value, right: value, bottom: value, left: value };
}

function validationMessage(): string {
  if (!imageState) return statusMessage;
  const validation = validateSliceSettings(imageState.size, slices);
  return validation.ok ? `Ready: ${imageState.layerName} (${imageState.size.width} x ${imageState.size.height})` : validation.message;
}

async function checkForUpdate(): Promise<void> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    if (!response.ok) return;

    const data = (await response.json()) as { tag_name?: string };
    const update = shouldShowUpdate(data.tag_name ?? '', CURRENT_VERSION);
    if (!update) return;

    availableUpdate = update;
    render();
    drawPreview();
  } catch {
    // Network checks are optional; keep the plugin usable offline.
  }
}

async function decodeImage(platform: ImageState['platform'], layerName: string, bytes: Uint8Array): Promise<ImageState> {
  const imageBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([imageBuffer], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to decode selected image.'));
    image.src = url;
  });

  return {
    platform,
    layerName,
    bytes,
    image,
    url,
    size: {
      width: image.naturalWidth,
      height: image.naturalHeight,
    },
  };
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Unable to encode slice as PNG.'));
        return;
      }

      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}

function postToPlugin(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function toUint8Array(value: Uint8Array | number[] | ArrayBuffer): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value);
}

function clearImageState(): void {
  if (imageState) {
    URL.revokeObjectURL(imageState.url);
  }
  imageState = undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
