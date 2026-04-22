import { beforeEach, describe, expect, it, vi } from 'vitest';

const getGitStatusMock = vi.hoisted(() => vi.fn());
const execSyncMock = vi.hoisted(() => vi.fn());

vi.mock('../src/utils/mergeValidation.js', () => ({
  getGitStatus: getGitStatusMock,
}));

vi.mock('child_process', () => ({
  execSync: execSyncMock,
}));

describe('child workspace precheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses git status for git panes', async () => {
    getGitStatusMock.mockReturnValue({
      hasChanges: true,
      files: ['file.ts'],
      summary: ' M file.ts',
    });

    const { getChildWorkspacePrecheck } = await import('../src/utils/childWorkspacePrecheck.js');

    const result = getChildWorkspacePrecheck({
      id: 'dmux-1',
      slug: 'git-pane',
      vcsBackend: 'git',
      targetRef: 'feat/git-pane',
      branchName: 'feat/git-pane',
      prompt: 'test',
      paneId: '%1',
      worktreePath: '/repo/.dmux/worktrees/git-pane',
    });

    expect(result.kind).toBe('git_dirty');
    expect(getGitStatusMock).toHaveBeenCalledWith('/repo/.dmux/worktrees/git-pane');
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it('uses jj diff summary for jj panes', async () => {
    execSyncMock.mockReturnValue('M file.ts\n');

    const { getChildWorkspacePrecheck } = await import('../src/utils/childWorkspacePrecheck.js');

    const result = getChildWorkspacePrecheck({
      id: 'dmux-2',
      slug: 'jj-pane',
      vcsBackend: 'jj',
      targetRef: 'feat/jj-pane',
      workspaceName: 'jj-pane',
      prompt: 'test',
      paneId: '%2',
      worktreePath: '/repo/.dmux/worktrees/jj-pane',
    });

    expect(result.kind).toBe('jj_dirty');
    expect(execSyncMock).toHaveBeenCalledWith('jj diff --summary -r @', expect.objectContaining({
      cwd: '/repo/.dmux/worktrees/jj-pane',
      encoding: 'utf-8',
    }));
    expect(getGitStatusMock).not.toHaveBeenCalled();
  });

  it('treats clean jj panes as clean without consulting git', async () => {
    execSyncMock.mockReturnValue('\n');

    const { getChildWorkspacePrecheck } = await import('../src/utils/childWorkspacePrecheck.js');

    const result = getChildWorkspacePrecheck({
      id: 'dmux-3',
      slug: 'jj-clean',
      vcsBackend: 'jj',
      targetRef: 'feat/jj-clean',
      workspaceName: 'jj-clean',
      prompt: 'test',
      paneId: '%3',
      worktreePath: '/repo/.dmux/worktrees/jj-clean',
    });

    expect(result.kind).toBe('clean');
    expect(getGitStatusMock).not.toHaveBeenCalled();
  });
});
