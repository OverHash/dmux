import fs from 'fs';
import path from 'path';
import type { MergeTargetReference, WorkspaceVcsState } from '../types.js';
import {
  isAgentName,
  type AgentName,
  type PermissionMode,
} from './agentLaunch.js';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { sanitizePaneDisplayName } from './paneTitle.js';

type WorktreeMetadataBase = {
  agent?: AgentName;
  permissionMode?: PermissionMode;
  displayName?: string;
  branchName?: string;
  mergeTargetChain?: MergeTargetReference[];
};

export type WorktreeMetadata = WorktreeMetadataBase & WorkspaceVcsState;

const METADATA_DIR = '.dmux';
const METADATA_FILE = 'worktree-metadata.json';
const PERMISSION_MODES: ReadonlySet<PermissionMode> = new Set([
  '',
  'plan',
  'acceptEdits',
  'bypassPermissions',
]);

function isMergeTargetReference(value: unknown): value is MergeTargetReference {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.branchName !== 'string' || candidate.branchName.length === 0) {
    return false;
  }
  if (candidate.displayName !== undefined && typeof candidate.displayName !== 'string') {
    return false;
  }
  if (candidate.slug !== undefined && typeof candidate.slug !== 'string') {
    return false;
  }
  if (
    candidate.worktreePath !== undefined
    && typeof candidate.worktreePath !== 'string'
  ) {
    return false;
  }

  return true;
}

function normalizeMergeTargetChain(
  mergeTargetChain: unknown
): MergeTargetReference[] | undefined {
  if (!Array.isArray(mergeTargetChain)) return undefined;

  const normalized = mergeTargetChain
    .filter(isMergeTargetReference)
    .map((entry) => ({
      displayName: entry.displayName,
      branchName: entry.branchName,
      slug: entry.slug,
      worktreePath: entry.worktreePath,
    }));

  return normalized.length > 0 ? normalized : undefined;
}

export function getWorktreeMetadataPath(worktreePath: string): string {
  return path.join(worktreePath, METADATA_DIR, METADATA_FILE);
}

export function readWorktreeMetadata(worktreePath: string): WorktreeMetadata | null {
  try {
    const metadataPath = getWorktreeMetadataPath(worktreePath);
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Record<string, unknown>;

    const metadataBase: WorktreeMetadataBase = {};

    if (typeof parsed.agent === 'string' && isAgentName(parsed.agent)) {
      metadataBase.agent = parsed.agent;
    }

    if (
      typeof parsed.permissionMode === 'string'
      && PERMISSION_MODES.has(parsed.permissionMode as PermissionMode)
    ) {
      metadataBase.permissionMode = parsed.permissionMode as PermissionMode;
    }

    if (typeof parsed.displayName === 'string') {
      const displayName = sanitizePaneDisplayName(parsed.displayName);
      if (displayName.length > 0) {
        metadataBase.displayName = displayName;
      }
    }

    if (typeof parsed.branchName === 'string' && parsed.branchName.length > 0) {
      metadataBase.branchName = parsed.branchName;
    }

    const mergeTargetChain = normalizeMergeTargetChain(parsed.mergeTargetChain);
    if (mergeTargetChain) {
      metadataBase.mergeTargetChain = mergeTargetChain;
    }

    const parsedTargetRef = typeof parsed.targetRef === 'string' && parsed.targetRef.length > 0
      ? parsed.targetRef
      : undefined;
    const parsedBranchName = typeof parsed.branchName === 'string' && parsed.branchName.length > 0
      ? parsed.branchName
      : undefined;
    const parsedWorkspaceName = typeof parsed.workspaceName === 'string' && parsed.workspaceName.length > 0
      ? parsed.workspaceName
      : undefined;

    if (parsed.vcsBackend === 'jj') {
      const targetRef = parsedTargetRef;
      const workspaceName = parsedWorkspaceName || path.basename(worktreePath);

      if (!targetRef) {
        return null;
      }

      return {
        ...metadataBase,
        vcsBackend: 'jj',
        targetRef,
        workspaceName,
      };
    }

    return {
      ...metadataBase,
      vcsBackend: 'git',
      targetRef: parsedTargetRef || parsedBranchName,
      branchName: parsedBranchName,
    };
  } catch {
    return null;
  }
}

export function writeWorktreeMetadata(
  worktreePath: string,
  metadata: WorktreeMetadata
): void {
  const metadataPath = getWorktreeMetadataPath(worktreePath);
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  atomicWriteJsonSync(metadataPath, {
    ...metadata,
    displayName: metadata.displayName
      ? sanitizePaneDisplayName(metadata.displayName)
      : undefined,
  });
}
