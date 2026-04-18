import { describe, expect, it } from 'vitest';
import {
  clampSelectedIndex,
  filterGitRefCandidates,
  getVisibleGitRefWindow,
  isValidStartPointOverride,
  normalizeGitRefCandidates,
  parseGitRefList,
} from '../src/components/popups/newPaneGitOptions.js';

describe('new pane git options helpers', () => {
  it('parses ref output preserving order and removing duplicates', () => {
    const parsed = parseGitRefList('main\norigin/main\norigin/main\n\nfeature/a\n');
    expect(parsed).toEqual(['main', 'origin/main', 'feature/a']);
  });

  it('prefers short local names while keeping remote-only refs qualified', () => {
    const candidates = normalizeGitRefCandidates(
      ['main', 'feature/local-only'],
      ['origin/main', 'origin/release/2026.04', 'upstream/release/2026.04']
    );

    expect(candidates).toEqual([
      {
        label: 'main',
        value: 'main',
        shortName: 'main',
        hasLocalBranch: true,
        hasRemoteBranch: true,
      },
      {
        label: 'feature/local-only',
        value: 'feature/local-only',
        shortName: 'feature/local-only',
        hasLocalBranch: true,
        hasRemoteBranch: false,
      },
      {
        label: 'origin/release/2026.04',
        value: 'origin/release/2026.04',
        shortName: 'release/2026.04',
        hasLocalBranch: false,
        hasRemoteBranch: true,
      },
      {
        label: 'upstream/release/2026.04',
        value: 'upstream/release/2026.04',
        shortName: 'release/2026.04',
        hasLocalBranch: false,
        hasRemoteBranch: true,
      },
    ]);
  });

  it('filters refs case-insensitively across labels and short names', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/release/2026.04', 'upstream/hotfix/auth']
    );

    expect(filterGitRefCandidates(candidates, 'release')).toEqual([candidates[1]]);
    expect(filterGitRefCandidates(candidates, 'HOTFIX')).toEqual([candidates[2]]);
    expect(filterGitRefCandidates(candidates, 'main')).toEqual([candidates[0]]);
  });

  it('clamps selection index to valid bounds', () => {
    expect(clampSelectedIndex(-1, 3)).toBe(0);
    expect(clampSelectedIndex(1, 3)).toBe(1);
    expect(clampSelectedIndex(9, 3)).toBe(2);
    expect(clampSelectedIndex(4, 0)).toBe(0);
  });

  it('calculates a visible ref window centered around selection', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      label: `origin/branch-${i}`,
      value: `origin/branch-${i}`,
      shortName: `branch-${i}`,
      hasLocalBranch: false,
      hasRemoteBranch: true,
    }));
    const window = getVisibleGitRefWindow(candidates, 12, 10);

    expect(window.startIndex).toBe(7);
    expect(window.visibleCandidates).toHaveLength(10);
    expect(window.visibleCandidates[0].label).toBe('origin/branch-7');
    expect(window.visibleCandidates[9].label).toBe('origin/branch-16');
  });

  it('requires overrides to exactly match submitted ref values', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/main', 'origin/release/2026.04']
    );

    expect(isValidStartPointOverride('', candidates)).toBe(true);
    expect(isValidStartPointOverride('main', candidates)).toBe(true);
    expect(isValidStartPointOverride('origin/main', candidates)).toBe(false);
    expect(isValidStartPointOverride('origin/release/2026.04', candidates)).toBe(true);
    expect(isValidStartPointOverride('release/2026.04', candidates)).toBe(false);
  });
});
