import { execSync } from 'child_process';

export const MAX_VISIBLE_GIT_REFS = 10;
export const START_POINT_ERROR_MESSAGE = 'Base branch must match an existing local or remote ref (choose from the list).';

export interface StartPointEnterResolution {
  accepted: boolean;
  nextValue: string;
  error?: string;
}

export interface GitRefCandidate {
  label: string;
  value: string;
  shortName: string;
  hasLocalBranch: boolean;
  hasRemoteBranch: boolean;
  acceptedValues: string[];
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

function candidateAcceptsValue(candidate: GitRefCandidate, value: string): boolean {
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

export function parseGitRefList(raw: string): string[] {
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
): GitRefCandidate[] {
  const candidates: GitRefCandidate[] = [];
  const localCandidatesByShortName = new Map<string, GitRefCandidate>();

  for (const localRef of localRefs) {
    const candidate: GitRefCandidate = {
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

export function loadGitRefCandidates(repoRoot: string): GitRefCandidate[] {
  try {
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

    return normalizeGitRefCandidates(parseGitRefList(localRaw), parseGitRefList(remoteRaw));
  } catch {
    return [];
  }
}

export function filterGitRefCandidates(
  candidates: GitRefCandidate[],
  query: string
): GitRefCandidate[] {
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

export function getVisibleGitRefWindow(
  candidates: GitRefCandidate[],
  selectedIndex: number,
  maxVisible: number = MAX_VISIBLE_GIT_REFS
): { startIndex: number; visibleCandidates: GitRefCandidate[] } {
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
  availableRefs: GitRefCandidate[]
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return availableRefs.some((candidate) => candidateAcceptsValue(candidate, trimmed));
}

export function resolveStartPointEnter(input: {
  currentValue: string;
  availableRefs: GitRefCandidate[];
  filteredRefs: GitRefCandidate[];
  selectedIndex: number;
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
    error: START_POINT_ERROR_MESSAGE,
  };
}
