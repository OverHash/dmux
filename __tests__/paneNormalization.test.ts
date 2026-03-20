import { describe, expect, it } from 'vitest';
import { normalizePane, normalizePanes } from '../src/utils/paneNormalization.js';

describe('paneNormalization', () => {
  it('normalizes legacy git panes to explicit git backend and targetRef', () => {
    const normalized = normalizePane({
      id: 'dmux-1',
      slug: 'feature-pane',
      branchName: 'feat/feature-pane',
      prompt: 'test',
      paneId: '%1',
      worktreePath: '/repo/.dmux/worktrees/feature-pane',
    });

    expect(normalized.vcsBackend).toBe('git');
    expect(normalized.targetRef).toBe('feat/feature-pane');
    if (normalized.vcsBackend === 'git') {
      expect(normalized.branchName).toBe('feat/feature-pane');
    }
  });

  it('preserves explicit jj panes while filling missing workspace defaults', () => {
    const normalized = normalizePane({
      id: 'dmux-2',
      slug: 'jj-pane',
      vcsBackend: 'jj',
      targetRef: 'feat/jj-pane',
      workspaceName: 'jj-pane',
      prompt: 'test',
      paneId: '%2',
      worktreePath: '/repo/.dmux/worktrees/jj-pane',
    });

    expect(normalized.vcsBackend).toBe('jj');
    expect(normalized.targetRef).toBe('feat/jj-pane');
    if (normalized.vcsBackend === 'jj') {
      expect(normalized.workspaceName).toBe('jj-pane');
    }
  });

  it('normalizes pane arrays defensively', () => {
    const normalized = normalizePanes([
      {
        id: 'dmux-3',
        slug: 'shell-pane',
        prompt: '',
        paneId: '%3',
        type: 'shell',
      },
    ] as any);

    expect(normalized[0].vcsBackend).toBe('git');
    expect(normalized[0].targetRef).toBe('shell-pane');
  });
});
