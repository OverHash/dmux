import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergePane } from '../../src/actions/implementations/mergeAction.js';
import { createWorktreePane } from '../fixtures/mockPanes.js';
import { createMockContext } from '../fixtures/mockContext.js';
import { expectInfo } from '../helpers/actionAssertions.js';

const resolveMergeTargetMock = vi.hoisted(() => vi.fn());
const executeMergeMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/mergeTargets.js', () => ({
  buildFallbackMergeMessage: vi.fn(),
  buildMissingMergeTargetMessage: vi.fn(() => 'missing merge target'),
  resolveMergeTarget: resolveMergeTargetMock,
}));

vi.mock('../../src/actions/merge/mergeExecution.js', () => ({
  executeMerge: executeMergeMock,
}));

vi.mock('../../src/utils/hooks.js', () => ({
  triggerHook: vi.fn(),
}));

vi.mock('../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

describe('mergeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks merge for jj panes before merge target resolution runs', async () => {
    const pane = createWorktreePane({
      slug: 'jj-pane',
      vcsBackend: 'jj',
      targetRef: 'feat/jj-pane',
      workspaceName: 'jj-pane',
    });
    const context = createMockContext([pane]);

    const result = await mergePane(pane, context);

    expectInfo(result, 'merge is still git-only');
    expect(result.title).toBe('Merge Not Yet Supported for jj');
    expect(result.dismissable).toBe(true);
    expect(resolveMergeTargetMock).not.toHaveBeenCalled();
    expect(executeMergeMock).not.toHaveBeenCalled();
  });

  it('continues into normal merge flow for git panes', async () => {
    const pane = createWorktreePane({
      slug: 'git-pane',
      vcsBackend: 'git',
      targetRef: 'feat/git-pane',
      branchName: 'feat/git-pane',
    });
    const context = createMockContext([pane]);

    resolveMergeTargetMock.mockReturnValue(null);

    const result = await mergePane(pane, context);

    expect(resolveMergeTargetMock).toHaveBeenCalledWith(pane);
    expect(result.type).toBe('error');
    expect(result.message).toBe('missing merge target');
  });
});
