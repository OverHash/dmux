import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
const rmMock = vi.hoisted(() => vi.fn(async () => {}));
const triggerHookMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('fs/promises', () => ({
  rm: rmMock,
}));

vi.mock('../../src/utils/hooks.js', () => ({
  triggerHook: triggerHookMock,
}));

vi.mock('../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

function createSuccessfulChild() {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    unref: () => void;
  };
  child.stderr = new EventEmitter();
  child.unref = vi.fn();

  queueMicrotask(() => {
    child.emit('close', 0);
  });

  return child;
}

describe('WorktreeCleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockImplementation(() => createSuccessfulChild());
  });

  it('removes git worktrees and deletes the branch when requested', async () => {
    const { WorktreeCleanupService } = await import('../../src/services/WorktreeCleanupService.js');

    const service = WorktreeCleanupService.getInstance();
    await service.enqueueCleanup({
      pane: {
        id: 'dmux-1',
        slug: 'git-pane',
        vcsBackend: 'git',
        targetRef: 'feat/git-pane',
        branchName: 'feat/git-pane',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/repo/.dmux/worktrees/git-pane',
      },
      paneProjectRoot: '/repo',
      mainRepoPath: '/repo',
      deleteBranch: true,
    });

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', '/repo/.dmux/worktrees/git-pane', '--force'],
      expect.objectContaining({ cwd: '/repo' })
    );
    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['branch', '-D', 'feat/git-pane'],
      expect.objectContaining({ cwd: '/repo' })
    );
    expect(triggerHookMock).toHaveBeenCalledWith(
      'worktree_removed',
      '/repo',
      expect.objectContaining({ slug: 'git-pane' })
    );
  });

  it('forgets jj workspaces, removes their directories, and deletes bookmarks', async () => {
    const { WorktreeCleanupService } = await import('../../src/services/WorktreeCleanupService.js');

    const service = WorktreeCleanupService.getInstance();
    await service.enqueueCleanup({
      pane: {
        id: 'dmux-2',
        slug: 'jj-pane',
        vcsBackend: 'jj',
        targetRef: 'feat/jj-pane',
        workspaceName: 'jj-pane',
        prompt: 'test',
        paneId: '%2',
        worktreePath: '/repo/.dmux/worktrees/jj-pane',
      },
      paneProjectRoot: '/repo',
      mainRepoPath: '/repo',
      deleteBranch: true,
    });

    expect(spawnMock).toHaveBeenCalledWith(
      'jj',
      ['workspace', 'forget', 'jj-pane'],
      expect.objectContaining({ cwd: '/repo' })
    );
    expect(rmMock).toHaveBeenCalledWith('/repo/.dmux/worktrees/jj-pane', {
      recursive: true,
      force: true,
    });
    expect(spawnMock).toHaveBeenCalledWith(
      'jj',
      ['bookmark', 'delete', 'feat/jj-pane'],
      expect.objectContaining({ cwd: '/repo' })
    );
    expect(triggerHookMock).toHaveBeenCalledWith(
      'worktree_removed',
      '/repo',
      expect.objectContaining({ slug: 'jj-pane' })
    );
  });

  it('forgets jj workspaces without deleting bookmarks for kill_and_clean', async () => {
    const { WorktreeCleanupService } = await import('../../src/services/WorktreeCleanupService.js');

    const service = WorktreeCleanupService.getInstance();
    await service.enqueueCleanup({
      pane: {
        id: 'dmux-3',
        slug: 'jj-keep-bookmark',
        vcsBackend: 'jj',
        targetRef: 'feat/jj-keep-bookmark',
        workspaceName: 'jj-keep-bookmark',
        prompt: 'test',
        paneId: '%3',
        worktreePath: '/repo/.dmux/worktrees/jj-keep-bookmark',
      },
      paneProjectRoot: '/repo',
      mainRepoPath: '/repo',
      deleteBranch: false,
    });

    expect(spawnMock).toHaveBeenCalledWith(
      'jj',
      ['workspace', 'forget', 'jj-keep-bookmark'],
      expect.objectContaining({ cwd: '/repo' })
    );
    expect(spawnMock).not.toHaveBeenCalledWith(
      'jj',
      ['bookmark', 'delete', 'feat/jj-keep-bookmark'],
      expect.anything()
    );
  });
});
