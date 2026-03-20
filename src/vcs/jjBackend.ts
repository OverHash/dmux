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
};
