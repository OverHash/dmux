import type { GitWorkspaceVcsState, JjWorkspaceVcsState } from '../types.js';

type GitRefLike = GitWorkspaceVcsState & {
  slug?: string;
};

type JjRefLike = JjWorkspaceVcsState;

type RefLike = GitRefLike | JjRefLike;

function assertNever(value: never): never {
  throw new Error(`Unsupported VCS backend: ${String(value)}`);
}

export function getTargetRef(ref: RefLike): string {
  const backend = ref.vcsBackend;

  switch (backend) {
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
    case 'git':
      return ref.slug;
    case 'jj':
      return ref.workspaceName;
    default:
      return assertNever(backend);
  }
}
