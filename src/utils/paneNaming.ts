import { appendSlugSuffix } from './agentLaunch.js';

export interface ResolvePaneNamingInput {
  generatedSlug: string;
  slugSuffix?: string;
  branchPrefix?: string;
  branchNameOverride?: string;
}

export interface ResolvedPaneNaming {
  slug: string;
  branchName: string;
}

export function sanitizeWorktreeSlugFromBranch(branchName: string): string {
  const normalized = branchName
    .trim()
    .toLowerCase()
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'pane';
}

export function resolvePaneNaming(input: ResolvePaneNamingInput): ResolvedPaneNaming {
  const generatedSlug = (input.generatedSlug || '').trim() || 'pane';
  const explicitBranchName = (input.branchNameOverride || '').trim();
  const branchPrefix = input.branchPrefix || '';

  const baseBranchName = explicitBranchName || `${branchPrefix}${generatedSlug}`;
  const baseSlug = explicitBranchName
    ? sanitizeWorktreeSlugFromBranch(explicitBranchName)
    : generatedSlug;

  return {
    slug: appendSlugSuffix(baseSlug, input.slugSuffix),
    branchName: appendSlugSuffix(baseBranchName, input.slugSuffix),
  };
}
