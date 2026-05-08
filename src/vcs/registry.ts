import { gitVcsBackend } from './gitBackend.js';
import { jjVcsBackend } from './jjBackend.js';
import type { SupportedVcsBackend, VcsBackend } from './types.js';

const VCS_BACKEND_REGISTRY: Record<SupportedVcsBackend, VcsBackend> = {
  git: gitVcsBackend,
  jj: jjVcsBackend,
};

export function getVcsBackend(id: SupportedVcsBackend): VcsBackend {
  return VCS_BACKEND_REGISTRY[id];
}

export function getAutoDetectBackends(
  preferredBackend: SupportedVcsBackend = 'git'
): readonly VcsBackend[] {
  switch (preferredBackend) {
    case 'git':
      return [gitVcsBackend, jjVcsBackend];
    case 'jj':
      return [jjVcsBackend, gitVcsBackend];
    default:
      return preferredBackend satisfies never;
  }
}
