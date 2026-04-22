import { execSync } from 'child_process';
import path from 'path';
import { isValidBranchName } from '../utils/git.js';
import type { VcsBackend } from './types.js';

function runGitCommand(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

export const gitVcsBackend: VcsBackend = {
  id: 'git',
  displayName: 'Git',
  capabilities: {
    supportsMerge: true,
  },

  isRepository(workingDir: string): boolean {
    try {
      runGitCommand('git rev-parse --show-toplevel', workingDir);
      return true;
    } catch {
      return false;
    }
  },
  resolveProjectRoot(workingDir: string): string {
    try {
      const gitCommonDir = runGitCommand(
        'git rev-parse --path-format=absolute --git-common-dir',
        workingDir
      );
      if (gitCommonDir && gitCommonDir !== '.git' && path.isAbsolute(gitCommonDir)) {
        return path.dirname(gitCommonDir);
      }
    } catch {
      // Fall through to show-toplevel.
			// This is an assumption that we are not in a worktree
    }

    return runGitCommand('git rev-parse --show-toplevel', workingDir);
  },
  getCurrentWorkspaceRoot(workingDir: string): string {
    return runGitCommand('git rev-parse --show-toplevel', workingDir);
  },

  createWorkspace(input) {
		// 1. prune stale worktree records
		// 2. validate the configured start point
		// 3. create or reuse the branch-backed worktree

    // IMPORTANT: Prune stale worktree records here, synchronously from dmux.
		// Running this inside the pane can race with later setup and reintroduce
		// conflicts.
    try {
      runGitCommand('git worktree prune', input.projectRoot);
    } catch {
      // Ignore prune errors and continue with the attempted creation.
    }

    const baseBranch = input.settings.baseBranch || '';
    if (baseBranch && !isValidBranchName(baseBranch)) {
      throw new Error(`Invalid base branch name: ${baseBranch}`);
    }

    const resolvedStartPoint = input.startPointRef || baseBranch;
    if (resolvedStartPoint && !isValidBranchName(resolvedStartPoint)) {
      throw new Error(`Invalid worktree start-point branch name: ${resolvedStartPoint}`);
    }

    if (resolvedStartPoint) {
      try {
        runGitCommand(`git rev-parse --verify --end-of-options "${resolvedStartPoint}"`, input.projectRoot);
      } catch {
        if (input.startPointRef) {
          throw new Error(
            `Worktree start-point branch "${resolvedStartPoint}" does not exist anymore. Reopen the parent worktree or recreate it before branching again.`
          );
        }

        throw new Error(
          `Base branch "${resolvedStartPoint}" does not exist. Update the baseBranch setting to a valid branch name.`
        );
      }
    }

    let branchExists = false;
    try {
      runGitCommand(`git show-ref --verify --quiet "refs/heads/${input.targetRef}"`, input.projectRoot);
      branchExists = true;
    } catch {
      branchExists = false;
    }

    const startPointArg = resolvedStartPoint ? ` "${resolvedStartPoint}"` : '';
    const worktreeAddCmd = branchExists
      ? `git worktree add "${input.worktreePath}" "${input.targetRef}"`
      : `git worktree add "${input.worktreePath}" -b "${input.targetRef}"${startPointArg}`;

    runGitCommand(worktreeAddCmd, input.projectRoot);

    if (!this.isRepository(input.worktreePath)) {
      throw new Error(`Workspace directory not created at ${input.worktreePath}`);
    }

    return {
      cwd: input.worktreePath,
      vcsState: {
        vcsBackend: 'git',
        targetRef: input.targetRef,
        branchName: input.targetRef !== input.slug ? input.targetRef : undefined,
      },
    };
  },
  resolveWorkspaceState(input) {
    const storedState = input.storedState?.vcsBackend === 'git'
      ? input.storedState
      : undefined;
    const targetRef = storedState?.targetRef || runGitCommand('git branch --show-current', input.worktreePath) || input.slug;

    return {
      vcsBackend: 'git',
      targetRef,
      branchName: targetRef !== input.slug ? targetRef : undefined,
    };
  },
};
