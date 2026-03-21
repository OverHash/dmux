import type { GitWorkspaceVcsState, JjWorkspaceVcsState } from '../types.js';

type GitRefLike = GitWorkspaceVcsState & {
  slug?: string;
};

type LegacyGitRefLike = {
  vcsBackend?: undefined;
  targetRef?: string;
  branchName?: string;
  slug?: string;
};

type JjRefLike = JjWorkspaceVcsState;

type RefLike = GitRefLike | LegacyGitRefLike | JjRefLike;

function assertNever(value: never): never {
  throw new Error(`Unsupported VCS backend: ${String(value)}`);
}

export function getTargetRef(ref: RefLike): string {
  const backend = ref.vcsBackend;

  switch (backend) {
    case undefined:
      return ref.targetRef || ref.branchName || ref.slug || '';
    case 'git':
      return ref.targetRef;
    case 'jj':
      return ref.targetRef;
    default:
      return assertNever(backend);
  }
}

export function getWorkspaceName(ref: RefLike): string | undefined {
  const backend = ref.vcsBackend;

  switch (backend) {
    case undefined:
      return ref.slug;
    case 'git':
      return ref.slug;
    case 'jj':
      return ref.workspaceName;
    default:
      return assertNever(backend);
  }
}
