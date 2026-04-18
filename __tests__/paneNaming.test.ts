import { describe, expect, it } from 'vitest';
import {
  resolvePaneNaming,
  sanitizeWorktreeSlugFromBranch,
} from '../src/utils/paneNaming.js';

describe('pane naming resolution', () => {
  it('uses generated slug and branch prefix by default', () => {
    const resolved = resolvePaneNaming({
      generatedSlug: 'fix-auth',
      branchPrefix: 'feat/',
    });

    expect(resolved).toEqual({
      slug: 'fix-auth',
      branchName: 'feat/fix-auth',
    });
  });

  it('uses explicit branch overrides for branch and slug', () => {
    const resolved = resolvePaneNaming({
      generatedSlug: 'ignored-slug',
      branchPrefix: 'feat/',
      branchNameOverride: 'feat/LIN-123-fix-auth',
    });

    expect(resolved.branchName).toBe('feat/LIN-123-fix-auth');
    expect(resolved.slug).toBe('feat-lin-123-fix-auth');
  });

  it('applies multi-agent suffix to both branch and slug', () => {
    const resolved = resolvePaneNaming({
      generatedSlug: 'lin-123-fix-auth',
      branchNameOverride: 'feat/LIN-123-fix-auth',
      slugSuffix: 'claude-code',
    });

    expect(resolved.branchName).toBe('feat/LIN-123-fix-auth-claude-code');
    expect(resolved.slug).toBe('feat-lin-123-fix-auth-claude-code');
  });

  it('does not append duplicate suffixes', () => {
    const resolved = resolvePaneNaming({
      generatedSlug: 'fix-auth-claude-code',
      slugSuffix: 'claude-code',
    });

    expect(resolved.branchName).toBe('fix-auth-claude-code');
    expect(resolved.slug).toBe('fix-auth-claude-code');
  });
});

describe('sanitizeWorktreeSlugFromBranch', () => {
  it('normalizes branch paths into flat worktree-safe names', () => {
    expect(sanitizeWorktreeSlugFromBranch('feat/LIN-999 Add Auth')).toBe('feat-lin-999-add-auth');
  });

  it('falls back to pane when branch contains no usable chars', () => {
    expect(sanitizeWorktreeSlugFromBranch('////')).toBe('pane');
  });
});
