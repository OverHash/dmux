import React, { useEffect, useRef, useState } from 'react';
import { Text, useInput } from 'ink';

interface InlineCursorInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
}

interface InlineCursorInputKey {
  tab?: boolean;
  shift?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  escape?: boolean;
  return?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  delete?: boolean;
  backspace?: boolean;
}

interface InlineCursorInputState {
  value: string;
  cursor: number;
}

interface InlineCursorInputEvent {
  input: string;
  key: InlineCursorInputKey;
  rawKey: string;
}

interface InlineCursorInputResolution extends InlineCursorInputState {
  handled: boolean;
}

export function resolveInlineCursorInputEdit(
  state: InlineCursorInputState,
  event: InlineCursorInputEvent
): InlineCursorInputResolution {
  const { value, cursor } = state;
  const { input, key, rawKey } = event;
  const isBackTab = input === '\u001b[Z' || (key.tab && key.shift);

  if (key.tab || isBackTab || key.upArrow || key.downArrow || key.escape || key.return) {
    return { value, cursor, handled: false };
  }

  if (key.leftArrow) {
    return { value, cursor: Math.max(0, cursor - 1), handled: true };
  }

  if (key.rightArrow) {
    return { value, cursor: Math.min(value.length, cursor + 1), handled: true };
  }

  if (key.ctrl && input === 'a') {
    return { value, cursor: 0, handled: true };
  }

  if (key.ctrl && input === 'e') {
    return { value, cursor: value.length, handled: true };
  }

  // Forward delete key (Delete) commonly arrives as ESC [ 3 ~.
  // Some terminals misreport Backspace as key.delete with an empty sequence,
  // so prefer raw key sequence detection when available.
  const isForwardDeleteSequence =
    rawKey === '\u001b[3~'
    || rawKey === '\u001b[3;2~'
    || rawKey === '\u001b[3;5~'
    || rawKey === '\u001b[3;6~'
    || input === '\u001b[3~'
    || input === '\u001b[3;2~'
    || input === '\u001b[3;5~'
    || input === '\u001b[3;6~';

  const isBackspaceSequence =
    rawKey === '\x7f'
    || rawKey === '\x08'
    || input === '\x7f'
    || input === '\x08';

  const isBackspace =
    key.backspace
    || isBackspaceSequence
    || (key.delete && !isForwardDeleteSequence && !isBackspaceSequence && input.length === 0);

  const isForwardDelete = isForwardDeleteSequence || (key.delete && !isBackspace);

  if (isForwardDelete) {
    if (cursor >= value.length) {
      return { value, cursor, handled: true };
    }

    return {
      value: value.slice(0, cursor) + value.slice(cursor + 1),
      cursor,
      handled: true,
    };
  }

  // Backspace deletes character to the left of cursor.
  if (isBackspace) {
    if (cursor <= 0) {
      return { value, cursor, handled: true };
    }

    return {
      value: value.slice(0, cursor - 1) + value.slice(cursor),
      cursor: cursor - 1,
      handled: true,
    };
  }

  if (input && !key.ctrl && !key.meta) {
    return {
      value: value.slice(0, cursor) + input + value.slice(cursor),
      cursor: cursor + input.length,
      handled: true,
    };
  }

  return { value, cursor, handled: false };
}

const InlineCursorInput: React.FC<InlineCursorInputProps> = ({
  value,
  onChange,
  placeholder = '',
  focus = false,
}) => {
  const [cursor, setCursor] = useState(value.length);
  const lastRawKeyRef = useRef('');

  useEffect(() => {
    const onData = (chunk: Buffer | string) => {
      if (!focus) return;
      lastRawKeyRef.current = chunk.toString();
    };

    process.stdin.on('data', onData);
    return () => {
      process.stdin.off('data', onData);
    };
  }, [focus]);

  useEffect(() => {
    setCursor((prev) => Math.max(0, Math.min(prev, value.length)));
  }, [value.length]);

  useInput((input, key) => {
    if (!focus) return;

    const rawKey = lastRawKeyRef.current;
    lastRawKeyRef.current = '';

    const resolution = resolveInlineCursorInputEdit(
      { value, cursor },
      { input, key, rawKey }
    );

    if (!resolution.handled) {
      return;
    }

    if (resolution.value !== value) {
      onChange(resolution.value);
    }
    if (resolution.cursor !== cursor) {
      setCursor(resolution.cursor);
    }
  });

  if (!value.length) {
    if (!focus) {
      return <Text dimColor>{placeholder}</Text>;
    }

    return (
      <Text>
        <Text inverse> </Text>
        <Text dimColor>{placeholder}</Text>
      </Text>
    );
  }

  const before = value.slice(0, cursor);
  const atCursor = cursor < value.length ? value[cursor] : ' ';
  const after = cursor < value.length ? value.slice(cursor + 1) : '';

  return (
    <Text>
      {before}
      {focus ? <Text inverse>{atCursor}</Text> : atCursor}
      {after}
    </Text>
  );
};

export default InlineCursorInput;
