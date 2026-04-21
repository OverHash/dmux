import { describe, expect, it } from 'vitest';
import {
  START_POINT_ERROR_MESSAGE,
  START_POINT_BOOKMARK_ERROR_MESSAGE,
  clampSelectedIndex,
  filterStartPointRefCandidates,
  getStartPointErrorMessage,
  getVisibleStartPointRefWindow,
  isValidStartPointOverride,
  normalizeGitRefCandidates,
  parseStartPointRefList,
  resolveStartPointEnter,
} from '../src/components/popups/newPaneGitOptions.js';

describe('new pane git options helpers', () => {
  it('parses ref output preserving order and removing duplicates', () => {
    const parsed = parseStartPointRefList('main\norigin/main\norigin/main\n\nfeature/a\n');
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
        acceptedValues: ['main', 'origin/main'],
      },
      {
        label: 'feature/local-only',
        value: 'feature/local-only',
        shortName: 'feature/local-only',
        hasLocalBranch: true,
        hasRemoteBranch: false,
        acceptedValues: ['feature/local-only'],
      },
      {
        label: 'origin/release/2026.04',
        value: 'origin/release/2026.04',
        shortName: 'release/2026.04',
        hasLocalBranch: false,
        hasRemoteBranch: true,
        acceptedValues: ['origin/release/2026.04'],
      },
      {
        label: 'upstream/release/2026.04',
        value: 'upstream/release/2026.04',
        shortName: 'release/2026.04',
        hasLocalBranch: false,
        hasRemoteBranch: true,
        acceptedValues: ['upstream/release/2026.04'],
      },
    ]);
  });

  it('ignores symbolic remote pointers like bare origin and origin/HEAD', () => {
    const candidates = normalizeGitRefCandidates(
      ['master'],
      ['origin', 'origin/HEAD', 'origin/master']
    );

    expect(candidates).toEqual([
      {
        label: 'master',
        value: 'master',
        shortName: 'master',
        hasLocalBranch: true,
        hasRemoteBranch: true,
        acceptedValues: ['master', 'origin/master'],
      },
    ]);
  });

  it('filters refs case-insensitively across labels and short names', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/release/2026.04', 'upstream/hotfix/auth']
    );

    expect(filterStartPointRefCandidates(candidates, 'release')).toEqual([candidates[1]]);
    expect(filterStartPointRefCandidates(candidates, 'HOTFIX')).toEqual([candidates[2]]);
    expect(filterStartPointRefCandidates(candidates, 'main')).toEqual([candidates[0]]);
  });

  it('matches accepted remote aliases when local-backed short names are displayed', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/main']
    );

    expect(filterStartPointRefCandidates(candidates, 'origin/main')).toEqual([candidates[0]]);
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
    const window = getVisibleStartPointRefWindow(candidates, 12, 10);

    expect(window.startIndex).toBe(7);
    expect(window.visibleCandidates).toHaveLength(10);
    expect(window.visibleCandidates[0].label).toBe('origin/branch-7');
    expect(window.visibleCandidates[9].label).toBe('origin/branch-16');
  });

  it('accepts exact local and qualified remote refs', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/main', 'origin/release/2026.04']
    );

    expect(isValidStartPointOverride('', candidates)).toBe(true);
    expect(isValidStartPointOverride('main', candidates)).toBe(true);
    expect(isValidStartPointOverride('origin/main', candidates)).toBe(true);
    expect(isValidStartPointOverride('origin/release/2026.04', candidates)).toBe(true);
    expect(isValidStartPointOverride('release/2026.04', candidates)).toBe(false);
  });

  it('accepts highlighted ref on Enter in start-point field', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/release/2026.04']
    );

    const resolution = resolveStartPointEnter({
      currentValue: 'rel',
      availableRefs: candidates,
      filteredRefs: [candidates[1]],
      selectedIndex: 0,
      backend: 'git',
    });

    expect(resolution).toEqual({
      accepted: true,
      nextValue: 'origin/release/2026.04',
    });
  });

  it('accepts exact typed ref when no filtered list is available', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/release/2026.04']
    );

    const resolution = resolveStartPointEnter({
      currentValue: 'main',
      availableRefs: candidates,
      filteredRefs: [],
      selectedIndex: 0,
      backend: 'git',
    });

    expect(resolution).toEqual({
      accepted: true,
      nextValue: 'main',
    });
  });

  it('preserves an exact typed qualified remote ref when local short name also exists', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/main']
    );

    const resolution = resolveStartPointEnter({
      currentValue: 'origin/main',
      availableRefs: candidates,
      filteredRefs: [candidates[0]],
      selectedIndex: 0,
      backend: 'git',
    });

    expect(resolution).toEqual({
      accepted: true,
      nextValue: 'origin/main',
    });
  });

  it('rejects invalid start-point refs on Enter with strict message', () => {
    const candidates = normalizeGitRefCandidates(
      ['main'],
      ['origin/release/2026.04']
    );

    const resolution = resolveStartPointEnter({
      currentValue: 'missing-branch',
      availableRefs: candidates,
      filteredRefs: [],
      selectedIndex: 0,
      backend: 'git',
    });

    expect(resolution).toEqual({
      accepted: false,
      nextValue: 'missing-branch',
      error: START_POINT_ERROR_MESSAGE,
    });
  });

  it('uses bookmark-specific validation copy for jj', () => {
    expect(getStartPointErrorMessage('git')).toBe(START_POINT_ERROR_MESSAGE);
    expect(getStartPointErrorMessage('jj')).toBe(START_POINT_BOOKMARK_ERROR_MESSAGE);

    const resolution = resolveStartPointEnter({
      currentValue: 'missing-bookmark',
      availableRefs: normalizeGitRefCandidates(['main'], []),
      filteredRefs: [],
      selectedIndex: 0,
      backend: 'jj',
    });

    expect(resolution).toEqual({
      accepted: false,
      nextValue: 'missing-bookmark',
      error: START_POINT_BOOKMARK_ERROR_MESSAGE,
    });
  });
});
