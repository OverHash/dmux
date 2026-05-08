import { execSync } from 'child_process';
import type { DmuxPane } from '../types.js';
import { getGitStatus, type GitStatus } from './mergeValidation.js';

export type ChildWorkspacePrecheckResult =
  | { kind: 'clean' }
  | { kind: 'git_dirty'; status: GitStatus }
  | { kind: 'jj_dirty'; summary: string };

function getJjWorkingCopySummary(worktreePath: string): string {
  try {
    return execSync('jj diff --summary -r @', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return '';
  }
}

export function getChildWorkspacePrecheck(pane: DmuxPane): ChildWorkspacePrecheckResult {
  if (!pane.worktreePath) {
    return { kind: 'clean' };
  }

  switch (pane.vcsBackend) {
    case 'git': {
      const status = getGitStatus(pane.worktreePath);
      return status.hasChanges
        ? { kind: 'git_dirty', status }
        : { kind: 'clean' };
    }
    case 'jj': {
      const summary = getJjWorkingCopySummary(pane.worktreePath);
      return summary.length > 0
        ? { kind: 'jj_dirty', summary }
        : { kind: 'clean' };
    }
  }
}
