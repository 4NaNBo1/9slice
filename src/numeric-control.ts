export const NUMBER_SCRUB_HANDLE_CLASS = 'number-suffix';

export function dragNumberValue(
  startValue: number,
  deltaX: number,
  step: number,
  min: number,
  max: number,
  pixelsPerStep = 4,
): number {
  const steps = Math.round(deltaX / pixelsPerStep);
  const decimals = decimalPlaces(step);
  const value = startValue + steps * step;
  const rounded = Number(value.toFixed(decimals));
  return Math.max(min, Math.min(rounded, max));
}

export function isNumberScrubHandleClassName(className: string): boolean {
  return className.split(/\s+/).includes(NUMBER_SCRUB_HANDLE_CLASS);
}

export function truncateNumberValue(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Number((Math.trunc(value * factor) / factor).toFixed(decimals));
}

export function normalizeNumberValue(value: number, min: number, max: number, decimals: number): number {
  if (!Number.isFinite(value)) return min;

  const truncated = truncateNumberValue(value, decimals);
  return Math.max(min, Math.min(truncated, max));
}

export function normalizeCommittedNumberInput(value: string, min: number, max: number, decimals: number): number {
  const normalizedText = normalizeDecimalText(value).trim();
  if (normalizedText.startsWith('-')) return min;

  const match = normalizedText.match(/\d+(?:\.\d*)?|\.\d+/);
  if (!match) return min;

  return normalizeNumberValue(Number(match[0]), min, max, decimals);
}

export function formatCommittedNumberInput(value: string, min: number, max: number, decimals: number): string {
  return String(normalizeCommittedNumberInput(value, min, max, decimals));
}

function normalizeDecimalText(value: string): string {
  return value.replace(/[\u3002\uff0e\uff61]/g, '.');
}

function decimalPlaces(value: number): number {
  const [, decimal = ''] = String(value).split('.');
  return decimal.length;
}
