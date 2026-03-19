import { execSync } from 'child_process';
import path from 'path';
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
      if (gitCommonDir && gitCommonDir !== '.git') {
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
};
