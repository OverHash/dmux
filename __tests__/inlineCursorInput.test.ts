import { describe, expect, it } from 'vitest';
import { resolveInlineCursorInputEdit } from '../src/components/inputs/InlineCursorInput.js';

describe('InlineCursorInput editing', () => {
  it('treats Delete as forward delete', () => {
    const resolution = resolveInlineCursorInputEdit(
      { value: 'mainx', cursor: 4 },
      {
        input: '\u001b[3~',
        key: { delete: true },
        rawKey: '\u001b[3~',
      }
    );

    expect(resolution).toEqual({
      value: 'main',
      cursor: 4,
      handled: true,
    });
  });

  it('treats Backspace as left delete', () => {
    const resolution = resolveInlineCursorInputEdit(
      { value: 'mainx', cursor: 4 },
      {
        input: '\x7f',
        key: { backspace: true },
        rawKey: '\x7f',
      }
    );

    expect(resolution).toEqual({
      value: 'maix',
      cursor: 3,
      handled: true,
    });
  });

  it('treats ambiguous delete-with-empty-input as backspace when raw key is absent', () => {
    const resolution = resolveInlineCursorInputEdit(
      { value: 'mainx', cursor: 4 },
      {
        input: '',
        key: { delete: true },
        rawKey: '',
      }
    );

    expect(resolution).toEqual({
      value: 'maix',
      cursor: 3,
      handled: true,
    });
  });
});
