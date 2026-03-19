import { execSync } from 'child_process';
import path from 'path';
import { existsSync, statSync } from 'fs';
import type {
  SupportedVcsBackend,
  VcsBackendSetting,
  VcsDetectionResult,
} from './types.js';

function runCommand(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

function assertNever(value: never): never {
  throw new Error(`Unsupported VCS backend setting: ${String(value)}`);
}

function resolveProjectRootForBackend(
  workingDir: string,
  backend: SupportedVcsBackend
): string {
  switch (backend) {
    case 'jj':
      return resolveJjProjectRoot(workingDir);
    case 'git':
      return resolveGitProjectRoot(workingDir);
    default:
      return assertNever(backend);
  }
}

export function isGitRepository(workingDir: string): boolean {
  try {
    runCommand('git rev-parse --show-toplevel', workingDir);
    return true;
  } catch {
    return false;
  }
}

function isJjRepository(workingDir: string): boolean {
  try {
    runCommand('jj workspace root', workingDir);
    return true;
  } catch {
    return false;
  }
}

export function resolveGitProjectRoot(workingDir: string): string {
  try {
    const gitCommonDir = runCommand(
      'git rev-parse --path-format=absolute --git-common-dir',
      workingDir
    );
    if (gitCommonDir && gitCommonDir !== '.git') {
      return path.dirname(gitCommonDir);
    }
  } catch {
    // Fall through to show-toplevel.
  }

  return runCommand('git rev-parse --show-toplevel', workingDir);
}

export function resolveJjProjectRoot(workingDir: string): string {
  try {
    return runCommand('jj workspace root --name default', workingDir);
  } catch {
    return runCommand('jj workspace root', workingDir);
  }
}

/**
 * Detects the available vcs backend for the user.
 * 
 * * If the user has specified a preferred backend, it will ensure that the project is set to suit this backend.
 * * If the user has not specified a preferred backend (e.g., "auto" option), we will auto-detect the best available VCS.
 *   * If `jj` is available, we will use jj.
 *   * Otherwise, we fall back to using git.
 * 
 * @param preferredBackend The preferred backend the user would like to do. If this is not available, returns `null` instead.
 * @returns The VCS backend that is available to be used. If not available, returns `null`.
 */
export function detectVcsBackend(
  workingDir: string,
  preferredBackend: VcsBackendSetting
): SupportedVcsBackend | null {
  switch (preferredBackend) {
    case 'jj':
      return isJjRepository(workingDir) ? 'jj' : null;
    case 'git':
      return isGitRepository(workingDir) ? 'git' : null;
    case 'auto':
      if (isJjRepository(workingDir)) {
        return 'jj';
      }

      if (isGitRepository(workingDir)) {
        return 'git';
      }

			// we were unable to detect any available vcs. this is not a good case!
      return null;
    default:
      return assertNever(preferredBackend);
  }
}

export function detectVcsForPath(
  inputPath: string,
  preferredBackend: VcsBackendSetting
): VcsDetectionResult | null {
  const workingDir = (() => {
    if (!existsSync(inputPath)) {
      return path.dirname(inputPath);
    }

    const stat = statSync(inputPath);
    return stat.isDirectory() ? inputPath : path.dirname(inputPath);
  })();

  const backend = detectVcsBackend(workingDir, preferredBackend);
  if (!backend) {
    return null;
  }

  return {
    backend,
    projectRoot: resolveProjectRootForBackend(workingDir, backend),
  };
}

export function getCurrentWorkspaceRoot(
  workingDir: string,
  backend: SupportedVcsBackend
): string {
  return backend === 'jj'
    ? runCommand('jj workspace root', workingDir)
    : runCommand('git rev-parse --show-toplevel', workingDir);
}
