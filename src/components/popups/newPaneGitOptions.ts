import { execSync } from 'child_process';
import type { SupportedVcsBackend } from '../../vcs/types.js';

export const MAX_VISIBLE_START_POINT_REFS = 10;
export const START_POINT_ERROR_MESSAGE = 'Base branch must match an existing local or remote ref (choose from the list).';
export const START_POINT_BOOKMARK_ERROR_MESSAGE = 'Base bookmark must match an existing local bookmark (choose from the list).';

export interface StartPointEnterResolution {
  accepted: boolean;
  nextValue: string;
  error?: string;
}

export interface StartPointRefCandidate {
  label: string;
  value: string;
  shortName: string;
  hasLocalBranch: boolean;
  hasRemoteBranch: boolean;
  acceptedValues: string[];
}

function assertNever(value: never): never {
  throw new Error(`Unsupported VCS backend: ${String(value)}`);
}

export function getStartPointErrorMessage(
  backend: SupportedVcsBackend
): string {
  switch (backend) {
    case 'git':
      return START_POINT_ERROR_MESSAGE;
    case 'jj':
      return START_POINT_BOOKMARK_ERROR_MESSAGE;
    default:
      return assertNever(backend);
  }
}

function normalizeAcceptedValues(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    ordered.push(trimmed);
  }

  return ordered;
}

function candidateAcceptsValue(candidate: StartPointRefCandidate, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return candidate.acceptedValues.some((acceptedValue) => acceptedValue === trimmed);
}

function getRemoteShortName(remoteRef: string): string {
  const slashIndex = remoteRef.indexOf('/');
  return slashIndex >= 0 ? remoteRef.slice(slashIndex + 1) : remoteRef;
}

export function parseStartPointRefList(raw: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const line of raw.split('\n')) {
    const ref = line.trim();
    if (!ref || seen.has(ref)) {
      continue;
    }
    seen.add(ref);
    ordered.push(ref);
  }

  return ordered;
}

export function normalizeGitRefCandidates(
  localRefs: string[],
  remoteRefs: string[]
): StartPointRefCandidate[] {
  const candidates: StartPointRefCandidate[] = [];
  const localCandidatesByShortName = new Map<string, StartPointRefCandidate>();

  for (const localRef of localRefs) {
    const candidate: StartPointRefCandidate = {
      label: localRef,
      value: localRef,
      shortName: localRef,
      hasLocalBranch: true,
      hasRemoteBranch: false,
      acceptedValues: [localRef],
    };
    candidates.push(candidate);
    localCandidatesByShortName.set(localRef, candidate);
  }

  for (const remoteRef of remoteRefs) {
    // Ignore symbolic/default remote pointers (e.g. "origin" or "origin/HEAD").
    // We only want concrete remote branch refs here.
    if (!remoteRef.includes('/') || remoteRef.endsWith('/HEAD')) {
      continue;
    }

    const shortName = getRemoteShortName(remoteRef);
    const localCandidate = localCandidatesByShortName.get(shortName);
    if (localCandidate) {
      localCandidate.hasRemoteBranch = true;
      localCandidate.acceptedValues = normalizeAcceptedValues([
        ...localCandidate.acceptedValues,
        remoteRef,
      ]);
      continue;
    }

    candidates.push({
      label: remoteRef,
      value: remoteRef,
      shortName,
      hasLocalBranch: false,
      hasRemoteBranch: true,
      acceptedValues: [remoteRef],
    });
  }

  return candidates;
}

function loadGitStartPointRefCandidates(repoRoot: string): StartPointRefCandidate[] {
  const localRaw = execSync(
    "git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads",
    {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    }
  );
  const remoteRaw = execSync(
    "git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes",
    {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    }
  );

  return normalizeGitRefCandidates(
    parseStartPointRefList(localRaw),
    parseStartPointRefList(remoteRaw)
  );
}

function loadJjStartPointRefCandidates(repoRoot: string): StartPointRefCandidate[] {
  const bookmarkRaw = execSync(
    "jj bookmark list --all --template 'name ++ \"\\n\"'",
    {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    }
  );

  return parseStartPointRefList(bookmarkRaw).map((bookmark) => ({
    label: bookmark,
    value: bookmark,
    shortName: bookmark,
    hasLocalBranch: true,
    hasRemoteBranch: false,
    acceptedValues: [bookmark],
  }));
}

export function loadStartPointRefCandidates(
  repoRoot: string,
  backend: SupportedVcsBackend
): StartPointRefCandidate[] {
  try {
    switch (backend) {
      case 'git':
        return loadGitStartPointRefCandidates(repoRoot);
      case 'jj':
        return loadJjStartPointRefCandidates(repoRoot);
      default:
        return assertNever(backend);
    }
  } catch {
    return [];
  }
}

export function filterStartPointRefCandidates(
  candidates: StartPointRefCandidate[],
  query: string
): StartPointRefCandidate[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return candidates;
  }

  return candidates.filter((candidate) => (
    candidate.label.toLowerCase().includes(normalizedQuery)
    || candidate.shortName.toLowerCase().includes(normalizedQuery)
    || candidate.value.toLowerCase().includes(normalizedQuery)
    || candidate.acceptedValues.some((acceptedValue) => acceptedValue.toLowerCase().includes(normalizedQuery))
  ));
}

export function clampSelectedIndex(selectedIndex: number, totalItems: number): number {
  if (totalItems <= 0) return 0;
  if (selectedIndex < 0) return 0;
  if (selectedIndex >= totalItems) return totalItems - 1;
  return selectedIndex;
}

export function getVisibleStartPointRefWindow(
  candidates: StartPointRefCandidate[],
  selectedIndex: number,
  maxVisible: number = MAX_VISIBLE_START_POINT_REFS
): { startIndex: number; visibleCandidates: StartPointRefCandidate[] } {
  if (candidates.length <= maxVisible) {
    return { startIndex: 0, visibleCandidates: candidates };
  }

  const clampedIndex = clampSelectedIndex(selectedIndex, candidates.length);
  let startIndex = Math.max(0, clampedIndex - Math.floor(maxVisible / 2));
  const maxStart = Math.max(0, candidates.length - maxVisible);
  startIndex = Math.min(startIndex, maxStart);

  return {
    startIndex,
    visibleCandidates: candidates.slice(startIndex, startIndex + maxVisible),
  };
}

export function isValidStartPointOverride(
  value: string,
  availableRefs: StartPointRefCandidate[]
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return availableRefs.some((candidate) => candidateAcceptsValue(candidate, trimmed));
}

export function resolveStartPointEnter(input: {
  currentValue: string;
  availableRefs: StartPointRefCandidate[];
  filteredRefs: StartPointRefCandidate[];
  selectedIndex: number;
  backend: SupportedVcsBackend;
}): StartPointEnterResolution {
  const trimmed = input.currentValue.trim();
  if (trimmed && input.availableRefs.some((candidate) => candidateAcceptsValue(candidate, trimmed))) {
    return {
      accepted: true,
      nextValue: trimmed,
    };
  }

  if (input.filteredRefs.length > 0 && input.selectedIndex < input.filteredRefs.length) {
    return {
      accepted: true,
      nextValue: input.filteredRefs[input.selectedIndex].value,
    };
  }

  if (!trimmed) {
    return {
      accepted: true,
      nextValue: '',
    };
  }

  return {
    accepted: false,
    nextValue: trimmed,
    error: getStartPointErrorMessage(input.backend),
  };
}
