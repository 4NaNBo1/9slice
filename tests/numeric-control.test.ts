import { describe, expect, it } from 'vitest';

import {
  dragNumberValue,
  formatCommittedNumberInput,
  isNumberScrubHandleClassName,
  normalizeCommittedNumberInput,
  normalizeNumberValue,
  truncateNumberValue,
} from '../src/numeric-control';

describe('dragNumberValue', () => {
  it('changes numeric values by horizontal drag distance and step size', () => {
    expect(dragNumberValue(16, 12, 1, 0, 99)).toBe(19);
    expect(dragNumberValue(10, -8, 0.1, 0, 99)).toBe(9.8);
  });

  it('clamps dragged values to the allowed range', () => {
    expect(dragNumberValue(2, -20, 1, 0, 99)).toBe(0);
    expect(dragNumberValue(98, 20, 1, 0, 99)).toBe(99);
  });
});

describe('isNumberScrubHandleClassName', () => {
  it('only treats the unit suffix as a numeric scrub handle', () => {
    expect(isNumberScrubHandleClassName('number-suffix')).toBe(true);
    expect(isNumberScrubHandleClassName('number-suffix active')).toBe(true);
    expect(isNumberScrubHandleClassName('scrub-input')).toBe(false);
    expect(isNumberScrubHandleClassName('number-field')).toBe(false);
  });
});

describe('truncateNumberValue', () => {
  it('discards digits beyond one decimal place without rounding', () => {
    expect(truncateNumberValue(12.34, 1)).toBe(12.3);
    expect(truncateNumberValue(12.39, 1)).toBe(12.3);
  });
});

describe('normalizeNumberValue', () => {
  it('corrects arbitrary input to a non-negative one-decimal value', () => {
    expect(normalizeNumberValue(12.39, 0, 99, 1)).toBe(12.3);
    expect(normalizeNumberValue(-4.2, 0, 99, 1)).toBe(0);
    expect(normalizeNumberValue(Number.NaN, 0, 99, 1)).toBe(0);
  });
});

describe('normalizeCommittedNumberInput', () => {
  it('keeps the nearest one-decimal value from arbitrary text input', () => {
    expect(normalizeCommittedNumberInput('1.1.2', 0, 99, 1)).toBe(1.1);
    expect(normalizeCommittedNumberInput('1。1', 0, 99, 1)).toBe(1.1);
    expect(normalizeCommittedNumberInput('0.12', 0, 99, 1)).toBe(0.1);
  });

  it('falls back to the allowed range for invalid or negative committed input', () => {
    expect(normalizeCommittedNumberInput('abc', 0, 99, 1)).toBe(0);
    expect(normalizeCommittedNumberInput('-4', 0, 99, 1)).toBe(0);
  });
});

describe('formatCommittedNumberInput', () => {
  it('formats arbitrary committed input as a normalized one-decimal display value', () => {
    expect(formatCommittedNumberInput('3。7', 0, 99, 1)).toBe('3.7');
    expect(formatCommittedNumberInput('0.12', 0, 99, 1)).toBe('0.1');
  });
});
