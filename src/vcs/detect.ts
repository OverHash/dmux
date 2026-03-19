import path from 'path';
import { existsSync, statSync } from 'fs';
import type {
  SupportedVcsBackend,
  VcsBackendSetting,
  VcsDetectionResult,
} from './types.js';
import { getAutoDetectBackends, getVcsBackend } from './registry.js';

function assertNever(value: never): never {
  throw new Error(`Unsupported VCS backend setting: ${String(value)}`);
}

function resolveProjectRootForBackend(
  workingDir: string,
  backend: SupportedVcsBackend
): string {
  return getVcsBackend(backend).resolveProjectRoot(workingDir);
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
    case 'git':
      return getVcsBackend(preferredBackend).isRepository(workingDir)
        ? preferredBackend
        : null;
    case 'auto':
      for (const backend of getAutoDetectBackends()) {
        if (backend.isRepository(workingDir)) {
          return backend.id;
        }
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
  return getVcsBackend(backend).getCurrentWorkspaceRoot(workingDir);
}
