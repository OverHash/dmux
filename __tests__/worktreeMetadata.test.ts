import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readWorktreeMetadata,
  writeWorktreeMetadata,
} from '../src/utils/worktreeMetadata.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe('worktree metadata persistence', () => {
  it('round-trips branch and merge-target metadata for reopened worktrees', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-worktree-meta-'));
    tempDirs.push(tempDir);

    writeWorktreeMetadata(tempDir, {
      agent: 'codex',
      permissionMode: 'bypassPermissions',
      branchName: 'feat/child-worktree',
      mergeTargetChain: [
        {
          slug: 'feature-parent',
          branchName: 'feature-parent',
          worktreePath: '/repo/.dmux/worktrees/feature-parent',
        },
        {
          slug: 'main',
          branchName: 'main',
          worktreePath: '/repo',
        },
      ],
    });

    expect(readWorktreeMetadata(tempDir)).toEqual({
      agent: 'codex',
      permissionMode: 'bypassPermissions',
      vcsBackend: 'git',
      targetRef: 'feat/child-worktree',
      branchName: 'feat/child-worktree',
      mergeTargetChain: [
        {
          slug: 'feature-parent',
          branchName: 'feature-parent',
          worktreePath: '/repo/.dmux/worktrees/feature-parent',
        },
        {
          slug: 'main',
          branchName: 'main',
          worktreePath: '/repo',
        },
      ],
    });
  });

  it('reads generic jj workspace metadata while preserving backward compatibility', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-worktree-meta-'));
    tempDirs.push(tempDir);

    writeWorktreeMetadata(tempDir, {
      vcsBackend: 'jj',
      targetRef: 'feat/jj-workspace',
      workspaceName: 'jj-workspace',
    });

    expect(readWorktreeMetadata(tempDir)).toEqual({
      vcsBackend: 'jj',
      targetRef: 'feat/jj-workspace',
      workspaceName: 'jj-workspace',
    });
  });

	// Test specific logic for migration path of dmux adding jj support
	// .. before jj support, dmux would only store `branchName` in the metadata json
	// .. and so we need to ensure that dmux correctly can handle reading this
	// .. state for users who migrate from an older dmux version
  it('reads legacy git metadata files that only store branchName', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-worktree-meta-'));
    tempDirs.push(tempDir);

    const metadataDir = path.join(tempDir, '.dmux');
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(
      path.join(metadataDir, 'worktree-metadata.json'),
      JSON.stringify({
        agent: 'claude',
        permissionMode: 'plan',
        branchName: 'feat/legacy-branch',
      })
    );

    expect(readWorktreeMetadata(tempDir)).toEqual({
      agent: 'claude',
      permissionMode: 'plan',
      vcsBackend: 'git',
      targetRef: 'feat/legacy-branch',
      branchName: 'feat/legacy-branch',
    });
  });
});
