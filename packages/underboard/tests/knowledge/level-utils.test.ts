import { describe, it, expect } from 'vitest';
import { internalToDisplay, displayToInternal } from '../../src/knowledge/level-utils.js';

describe('level-utils', () => {
  it('internalToDisplay maps scale=3 correctly', () => {
    expect(internalToDisplay(0, '3')).toBe('beginner');
    expect(internalToDisplay(0.33, '3')).toBe('beginner');
    expect(internalToDisplay(0.34, '3')).toBe('intermediate');
    expect(internalToDisplay(0.66, '3')).toBe('intermediate');
    expect(internalToDisplay(0.67, '3')).toBe('expert');
    expect(internalToDisplay(1, '3')).toBe('expert');
  });

  it('internalToDisplay maps scale=5 correctly', () => {
    expect(internalToDisplay(0, '5')).toBe('novice');
    expect(internalToDisplay(0.2, '5')).toBe('novice');
    expect(internalToDisplay(0.21, '5')).toBe('beginner');
    expect(internalToDisplay(0.4, '5')).toBe('beginner');
    expect(internalToDisplay(0.5, '5')).toBe('intermediate');
    expect(internalToDisplay(0.8, '5')).toBe('advanced');
    expect(internalToDisplay(0.9, '5')).toBe('expert');
  });

  it('internalToDisplay continuous returns clamped number', () => {
    expect(internalToDisplay(-1, 'continuous')).toBe(0);
    expect(internalToDisplay(0.5, 'continuous')).toBe(0.5);
    expect(internalToDisplay(2, 'continuous')).toBe(1);
  });

  it('displayToInternal maps scale=3 correctly', () => {
    expect(displayToInternal('beginner', '3')).toBe(0.15);
    expect(displayToInternal('intermediate', '3')).toBe(0.5);
    expect(displayToInternal('expert', '3')).toBe(0.85);
    expect(displayToInternal('unknown', '3')).toBe(null);
  });

  it('displayToInternal maps scale=5 correctly', () => {
    expect(displayToInternal('novice', '5')).toBe(0.1);
    expect(displayToInternal('beginner', '5')).toBe(0.3);
    expect(displayToInternal('intermediate', '5')).toBe(0.5);
    expect(displayToInternal('advanced', '5')).toBe(0.7);
    expect(displayToInternal('expert', '5')).toBe(0.9);
    expect(displayToInternal('badlabel', '5')).toBe(null);
  });

  it('displayToInternal continuous parses and clamps numbers', () => {
    expect(displayToInternal('0.5', 'continuous')).toBe(0.5);
    expect(displayToInternal(0.75, 'continuous')).toBe(0.75);
    expect(displayToInternal('not a number', 'continuous')).toBe(null);
  });
});
