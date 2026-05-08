import { execSync } from 'child_process';
import type { VcsBackend } from './types.js';

function runJjCommand(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

export const jjVcsBackend: VcsBackend = {
  id: 'jj',
  displayName: 'jj',
  capabilities: {
    supportsMerge: false,
  },

  isRepository(workingDir: string): boolean {
    try {
      runJjCommand('jj workspace root', workingDir);
      return true;
    } catch {
      return false;
    }
  },
  resolveProjectRoot(workingDir: string): string {
    try {
      return runJjCommand('jj workspace root --name default', workingDir);
    } catch {
      return runJjCommand('jj workspace root', workingDir);
    }
  },
  getCurrentWorkspaceRoot(workingDir: string): string {
    return runJjCommand('jj workspace root', workingDir);
  },

  createWorkspace(input) {
    const workspaceName = input.workspaceName || input.slug;
    const revisionArg = input.startPointRef ? ` --revision "${input.startPointRef}"` : '';

    const workspaceAddCmd = `jj workspace add --name "${workspaceName}"${revisionArg} "${input.worktreePath}"`;

    try {
      runJjCommand(workspaceAddCmd, input.projectRoot);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // jj can reject workspace operations when the default workspace has a stale
      // working copy (e.g. after an operation was abandoned). Auto-recover and
      // retry so dmux doesn't fail mid-pane-creation.
      if (errorMsg.includes('stale')) {
        runJjCommand('jj workspace update-stale', input.projectRoot);
        runJjCommand(workspaceAddCmd, input.projectRoot);
      } else {
        throw error;
      }
    }
    runJjCommand(`jj bookmark set "${input.targetRef}" -r @`, input.worktreePath);

    if (!this.isRepository(input.worktreePath)) {
      throw new Error(`Workspace directory not created at ${input.worktreePath}`);
    }

    return {
      cwd: input.worktreePath,
      vcsState: {
        vcsBackend: 'jj',
        targetRef: input.targetRef,
        workspaceName,
      },
    };
  },
  resolveWorkspaceState(input) {
    const storedState = input.storedState?.vcsBackend === 'jj'
      ? input.storedState
      : undefined;

    return {
      vcsBackend: 'jj',
      targetRef: storedState?.targetRef || input.slug,
      workspaceName: storedState?.workspaceName || input.slug,
    };
  },
};
