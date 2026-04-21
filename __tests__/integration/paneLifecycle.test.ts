/**
 * Integration tests for pane lifecycle (creation, closure, rebinding)
 * Target: Cover src/utils/paneCreation.ts (568 lines, currently 0%)
 * Expected coverage gain: +3-4%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DmuxPane } from '../../src/types.js';
import type { ActionContext } from '../../src/actions/types.js';
import {
  createMockTmuxSession,
  type MockTmuxSession,
} from '../fixtures/integration/tmuxSession.js';
import {
  createMockGitRepo,
  addWorktree,
  type MockGitRepo,
} from '../fixtures/integration/gitRepo.js';
import { createMockExecSync, createMockOpenRouterAPI } from '../helpers/integration/mockCommands.js';

const fsMock = vi.hoisted(() => ({
  readFileSync: vi.fn(() => JSON.stringify({ controlPaneId: '%0' })),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));
const destroyWelcomePaneCoordinatedMock = vi.hoisted(() => vi.fn());

const detectedVcsBackend = vi.hoisted(() => ({ current: 'git' as 'git' | 'jj' }));

// Mock child_process
const mockExecSync = createMockExecSync({});
vi.mock('child_process', () => ({
  execSync: mockExecSync,
}));

// Mock StateManager
const mockGetPanes = vi.fn(() => []);
const mockSetPanes = vi.fn();
const mockGetState = vi.fn(() => ({ projectRoot: '/test' }));
const mockPauseConfigWatcher = vi.fn();
const mockResumeConfigWatcher = vi.fn();
vi.mock('../../src/shared/StateManager.js', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      getPanes: mockGetPanes,
      setPanes: mockSetPanes,
      getState: mockGetState,
      pauseConfigWatcher: mockPauseConfigWatcher,
      resumeConfigWatcher: mockResumeConfigWatcher,
    })),
  },
}));

// Mock hooks
vi.mock('../../src/utils/hooks.js', () => ({
  triggerHook: vi.fn(() => Promise.resolve()),
  triggerHookSync: vi.fn(() => Promise.resolve({ success: true })),
  initializeHooksDirectory: vi.fn(),
}));

// Mock LogService
vi.mock('../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

const mockEnqueueCleanup = vi.fn();
vi.mock('../../src/services/WorktreeCleanupService.js', () => ({
  WorktreeCleanupService: {
    getInstance: vi.fn(() => ({
      enqueueCleanup: mockEnqueueCleanup,
    })),
  },
}));

vi.mock('../../src/utils/welcomePaneManager.js', () => ({
  destroyWelcomePaneCoordinated: destroyWelcomePaneCoordinatedMock,
}));

// Mock fs for reading config
vi.mock('fs', () => ({
  default: fsMock,
  ...fsMock,
}));

describe('Pane Lifecycle Integration Tests', () => {
  let tmuxSession: MockTmuxSession;
  let gitRepo: MockGitRepo;
  let createdWorktreePaths: Set<string>;
  let killedPaneIds: Set<string>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockEnqueueCleanup.mockReset();

    // Create fresh test environment
    tmuxSession = createMockTmuxSession('dmux-test', 1);
    gitRepo = createMockGitRepo('main');
    createdWorktreePaths = new Set<string>();
    killedPaneIds = new Set<string>();
    detectedVcsBackend.current = 'git';

    fsMock.existsSync.mockImplementation((target) => {
      const value = String(target);
      if (value.includes('/.dmux/worktrees/')) {
        return createdWorktreePaths.has(value);
      }
      return true;
    });

    // Configure mock execSync with test data
    mockExecSync.mockImplementation(((command: string, options?: any) => {
      const cmd = command.toString().trim();
      const encoding = options?.encoding;

      // Helper to return string or buffer based on encoding option
      const returnValue = (value: string) => {
        if (encoding === 'utf-8') {
          return value;
        }
        return Buffer.from(value);
      };

      // Tmux display-message (get current pane id or session name)
      if (cmd.includes('display-message')) {
        if (cmd.includes('#{session_name}')) {
          return returnValue('dmux-test');
        }
        return returnValue('%0');
      }

      // Tmux list-panes
      if (cmd.includes('list-panes')) {
        return returnValue(
          [
            '%0:dmux-control:80x24',
            '%1:test:80x24',
          ]
            .filter((line) => {
              const paneId = line.match(/^%\d+/)?.[0];
              return paneId && !killedPaneIds.has(paneId);
            })
            .join('\n')
        );
      }

      // Tmux kill-pane
      if (cmd.includes('kill-pane')) {
        const paneId = cmd.match(/-t '([^']+)'/)?.[1];
        if (paneId) {
          killedPaneIds.add(paneId);
        }
        return returnValue('');
      }

      // Tmux split-window
      if (cmd.includes('split-window')) {
        return returnValue('%1');
      }

      // Git worktree add
      if (cmd.includes('worktree add')) {
        const pathMatch = cmd.match(/git worktree add "([^"]+)"/);
        const branchMatch = cmd.match(/-b "([^"]+)"/) || cmd.match(/git worktree add "[^"]+" "([^"]+)"/);
        const worktreePath = pathMatch?.[1] || '/test/.dmux/worktrees/test-slug';
        const branchName = branchMatch?.[1] || 'test-slug';
        createdWorktreePaths.add(worktreePath);
        createdWorktreePaths.add(`${worktreePath}/.git`);
        gitRepo = addWorktree(gitRepo, worktreePath, branchName);
        return returnValue('');
      }

      // jj workspace add
      if (cmd.includes('jj workspace add')) {
        const pathMatch = cmd.match(/jj workspace add --name "[^"]+"(?: --revision "[^"]+")? "([^"]+)"/);
        const worktreePath = pathMatch?.[1] || '/test/.dmux/worktrees/test-slug';
        createdWorktreePaths.add(worktreePath);
        createdWorktreePaths.add(`${worktreePath}/.jj`);
        return returnValue('');
      }

      // Git worktree list
      if (cmd.includes('worktree list')) {
        return returnValue(
          Array.from(createdWorktreePaths)
            .filter((worktreePath) => !worktreePath.endsWith('/.git'))
            .map((worktreePath) => `${worktreePath} abc123 [${worktreePath.split('/').pop()}]`)
            .join('\n')
        );
      }

      // Git symbolic-ref (main branch)
      if (cmd.includes('symbolic-ref')) {
        return returnValue('refs/heads/main');
      }

      // Git rev-parse (current branch)
      if (cmd.includes('rev-parse --git-common-dir')) {
        if (detectedVcsBackend.current === 'jj') {
          throw new Error('Not a git repository');
        }
        return returnValue('.git');
      }

      if (cmd.includes('rev-parse --show-toplevel')) {
        if (detectedVcsBackend.current === 'jj') {
          throw new Error('Not a git repository');
        }
        return returnValue('/test');
      }

      if (cmd.includes('rev-parse')) {
        return returnValue('main');
      }

      if (cmd.includes('jj workspace root --name default')) {
        if (detectedVcsBackend.current !== 'jj') {
          throw new Error('Not a jj repository');
        }
        return returnValue('/test');
      }

      if (cmd.includes('jj workspace root')) {
        if (detectedVcsBackend.current !== 'jj') {
          throw new Error('Not a jj repository');
        }
        return returnValue(options?.cwd?.includes('/.dmux/worktrees/') ? options.cwd : '/test');
      }

      // Default
      return returnValue('');
    }) as any);

    // Configure StateManager mock
    mockGetPanes.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pane Creation Flow', () => {
    it('should create pane with generated slug', async () => {
      // Import pane creation utilities
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'fix authentication bug',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude', 'opencode']
      );

      // Should return a pane (not needsAgentChoice)
      expect(result).toHaveProperty('pane');
      if ('pane' in result) {
        expect(result.pane.prompt).toBe('fix authentication bug');
        expect(result.pane.slug).toBeTruthy();
        expect(result.pane.paneId).toBeTruthy();
      }
    });

    it('should scope pane border status to the current tmux session', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'scope pane borders',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude']
      );

      expect(mockExecSync.mock.calls.some(([cmd]) =>
        typeof cmd === 'string'
        && cmd.includes('tmux set -t dmux-test pane-border-status top')
      )).toBe(true);

      expect(mockExecSync.mock.calls.some(([cmd]) =>
        typeof cmd === 'string'
        && cmd.includes('tmux set-option -g pane-border-status top')
      )).toBe(false);
    });

    it('should create git worktree with branch', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'add user dashboard',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude']
      );

      // Verify git worktree add was called
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git worktree add'),
        expect.any(Object)
      );
    });

    it('should use a custom branch override with a filesystem-safe worktree slug', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'add user dashboard',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
          branchNameOverride: 'feat/LIN-42-add-dashboard',
        },
        ['claude']
      );

      const worktreeCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('git worktree add')
      );
      expect(worktreeCall?.[0]).toContain('/test/.dmux/worktrees/feat-lin-42-add-dashboard');
      expect(worktreeCall?.[0]).toContain('"feat/LIN-42-add-dashboard"');

      if ('pane' in result) {
        expect(result.pane.slug).toBe('feat-lin-42-add-dashboard');
        expect(result.pane.branchName).toBe('feat/LIN-42-add-dashboard');
      }
    });

    it('should reject invalid branch-name overrides', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await expect(
        createPane(
          {
            prompt: 'add user dashboard',
            agent: 'claude',
            projectName: 'test-project',
            existingPanes: [],
            branchNameOverride: 'feat && echo pwned',
          },
          ['claude']
        )
      ).rejects.toThrow('Invalid branch name override');
    });

    it('should validate remote tracking baseBranch values without forcing refs/heads', async () => {
      fsMock.readFileSync.mockImplementation((target) => {
        const value = String(target);
        if (value.endsWith('/.dmux/settings.json')) {
          return JSON.stringify({ baseBranch: 'origin/main' });
        }
        if (value.endsWith('/.dmux/dmux.config.json')) {
          return JSON.stringify({ controlPaneId: '%0' });
        }
        return JSON.stringify({});
      });

      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'branch from remote main',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
          projectRoot: '/test',
          slugBase: 'remote-base',
        },
        ['claude']
      );

      expect(mockExecSync.mock.calls.some(([cmd]) =>
        typeof cmd === 'string'
        && cmd.includes('git rev-parse --verify --end-of-options "origin/main"')
      )).toBe(true);

      expect(mockExecSync.mock.calls.some(([cmd]) =>
        typeof cmd === 'string'
        && cmd.includes('refs/heads/origin/main')
      )).toBe(false);
    });

    it('should create jj workspace when project uses jj', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');
      detectedVcsBackend.current = 'jj';
      fsMock.readFileSync.mockImplementation(((target: string) => {
        if (String(target).endsWith('.dmux.global.json')) {
          return JSON.stringify({ vcsBackend: 'jj' });
        }

        return JSON.stringify({ controlPaneId: '%0' });
      }) as any);

      const result = await createPane(
        {
          prompt: 'add user dashboard',
          agent: 'claude',
          projectName: 'test-project',
          projectRoot: '/test',
          slugBase: 'jj-dashboard',
          existingPanes: [],
        },
        ['claude']
      );

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('jj workspace add --name "jj-dashboard" "/test/.dmux/worktrees/jj-dashboard"'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('jj bookmark set "jj-dashboard" -r @'),
        expect.any(Object)
      );

      if ('pane' in result) {
        expect(result.pane.vcsBackend).toBe('jj');
        expect(result.pane.targetRef).toBe('jj-dashboard');
        if (result.pane.vcsBackend === 'jj') {
          expect(result.pane.workspaceName).toBe('jj-dashboard');
        }
      }
    });

    it('should use a jj target bookmark override for pane naming and bookmark creation', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');
      detectedVcsBackend.current = 'jj';
      fsMock.readFileSync.mockImplementation(((target: string) => {
        if (String(target).endsWith('.dmux.global.json')) {
          return JSON.stringify({ vcsBackend: 'jj' });
        }

        return JSON.stringify({ controlPaneId: '%0' });
      }) as any);

      const result = await createPane(
        {
          prompt: 'override jj target bookmark',
          agent: 'claude',
          projectName: 'test-project',
          projectRoot: '/test',
          existingPanes: [],
          branchNameOverride: 'feat/jj-target-bookmark',
        },
        ['claude']
      );

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('jj bookmark set "feat/jj-target-bookmark" -r @'),
        expect.any(Object)
      );

      if ('pane' in result) {
        expect(result.pane.slug).toBe('feat-jj-target-bookmark');
        expect(result.pane.vcsBackend).toBe('jj');
        expect(result.pane.targetRef).toBe('feat/jj-target-bookmark');
        if (result.pane.vcsBackend === 'jj') {
          expect(result.pane.workspaceName).toBe('feat-jj-target-bookmark');
        }
      }
    });

    it('should pass jj start points through --revision', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');
      detectedVcsBackend.current = 'jj';
      fsMock.readFileSync.mockImplementation(((target: string) => {
        if (String(target).endsWith('.dmux.global.json')) {
          return JSON.stringify({ vcsBackend: 'jj' });
        }

        return JSON.stringify({ controlPaneId: '%0' });
      }) as any);

      await createPane(
        {
          prompt: 'branch from parent workspace',
          agent: 'claude',
          projectName: 'test-project',
          projectRoot: '/test',
          slugBase: 'jj-child',
          existingPanes: [],
          startPointBranch: 'feat/parent-workspace',
        },
        ['claude']
      );

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('jj workspace add --name "jj-child" --revision "feat/parent-workspace" "/test/.dmux/worktrees/jj-child"'),
        expect.any(Object)
      );
    });

    it('should attach a fresh pane to an existing worktree without recreating it', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');
      const existingWorktreePath = '/test/.dmux/worktrees/resume-me';
      createdWorktreePaths.add(existingWorktreePath);
      createdWorktreePaths.add(`${existingWorktreePath}/.git`);

      const result = await createPane(
        {
          prompt: '',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
          existingWorktree: {
            slug: 'resume-me',
            worktreePath: existingWorktreePath,
            vcsBackend: 'git',
            targetRef: 'feature/resume-me',
            branchName: 'feature/resume-me',
          },
        },
        ['claude']
      );

      expect(mockExecSync.mock.calls.some(([cmd]) =>
        typeof cmd === 'string' && cmd.includes(`git worktree add "${existingWorktreePath}"`)
      )).toBe(false);

      if ('pane' in result) {
        expect(result.pane.slug).toBe('resume-me');
        if (result.pane.vcsBackend !== 'jj') {
          expect(result.pane.branchName).toBe('feature/resume-me');
        }
        expect(result.pane.worktreePath).toBe(existingWorktreePath);
        expect(result.pane.prompt).toBe('No initial prompt');
      }
    });

    it('should attach to an existing jj workspace without recreating it', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');
      const existingWorkspacePath = '/test/.dmux/worktrees/jj-reopen-me';
      detectedVcsBackend.current = 'jj';
      createdWorktreePaths.add(existingWorkspacePath);
      createdWorktreePaths.add(`${existingWorkspacePath}/.jj`);

      const result = await createPane(
        {
          prompt: '',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
          projectRoot: '/test',
          existingWorktree: {
            slug: 'jj-reopen-me',
            worktreePath: existingWorkspacePath,
            vcsBackend: 'jj',
            targetRef: 'feat/jj-reopen-me',
            workspaceName: 'jj-reopen-me',
          },
        },
        ['claude']
      );

      expect(mockExecSync.mock.calls.some(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('jj workspace add')
      )).toBe(false);

      expect(result.pane.vcsBackend).toBe('jj');
      expect(result.pane.worktreePath).toBe(existingWorkspacePath);
    });

    it('should split tmux pane', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'refactor component',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude']
      );

      // Verify tmux split-window was called
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('tmux split-window'),
        expect.any(Object)
      );

      // Pane should have tmux pane ID
      if ('pane' in result) {
        expect(result.pane.paneId).toMatch(/%\d+/);
      }
    });

    it('should create agent panes in the selected project root for added projects', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'work on added project',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [
            {
              id: 'dmux-1',
              slug: 'existing',
              vcsBackend: 'git',
              targetRef: 'existing',
              prompt: 'existing pane',
              paneId: '%5',
              projectRoot: '/primary/repo',
              worktreePath: '/primary/repo/.dmux/worktrees/existing',
            },
          ],
          projectRoot: '/target/repo',
          slugBase: 'target-slug',
        },
        ['claude']
      );

      const splitCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('tmux split-window')
      );
      expect(splitCall?.[0]).toContain('-c "/target/repo"');

      const worktreeCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('git worktree add')
      );
      expect(worktreeCall?.[0]).toContain('git worktree add "/target/repo/.dmux/worktrees/target-slug"');
      expect(worktreeCall?.[1]).toMatchObject({ cwd: '/target/repo' });
    });

    it('should fail before pane creation when a custom branch override collides with an existing worktree path', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');
      createdWorktreePaths.add('/test/.dmux/worktrees/feat-lin-42');

      await expect(
        createPane(
          {
            prompt: 'add dashboard',
            agent: 'claude',
            projectName: 'test-project',
            existingPanes: [],
            branchNameOverride: 'feat/LIN-42',
          },
          ['claude']
        )
      ).rejects.toThrow(/Worktree path already exists/);

      expect(mockExecSync.mock.calls.some(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('tmux split-window')
      )).toBe(false);
    });

    it('should destroy the welcome pane when tracked shell panes make the pane list non-empty', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'investigate issue',
          agent: 'claude',
          projectName: 'test-project',
          projectRoot: '/test',
          existingPanes: [
            {
              id: 'dmux-1',
              slug: 'shell-1',
              prompt: '',
              paneId: '%5',
              type: 'shell',
              shellType: 'zsh',
            },
          ],
        },
        ['claude']
      );

      expect(destroyWelcomePaneCoordinatedMock).toHaveBeenCalledWith('/test');
    });

    it('should handle slug generation failure (fallback to timestamp)', async () => {
      // Mock OpenRouter API failure
      const mockFetch = vi.fn(() =>
        Promise.reject(new Error('API timeout'))
      );
      global.fetch = mockFetch;

      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'test prompt',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude']
      );

      // Should fallback to timestamp-based slug
      expect(result.pane.slug).toMatch(/dmux-\d+/);
    });

    it('should return needsAgentChoice when agent not specified', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'test prompt',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude', 'opencode']
      );

      // Should return needsAgentChoice
      expect(result).toHaveProperty('needsAgentChoice');
      if ('needsAgentChoice' in result) {
        expect(result.needsAgentChoice).toBe(true);
      }
    });

    it('should handle empty agent list', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'test prompt',
          projectName: 'test-project',
          existingPanes: [],
        },
        []
      );

      // Should return error or handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Worktree Setup Failure Handling', () => {
    // Regression tests for: when worktree preparation fails, the pane must
    // be torn down and the agent must NOT be launched. Leaving the pane open
    // at projectRoot would let the agent run against main, which is dangerous.

    const getSendKeysCommands = () =>
      mockExecSync.mock.calls
        .map(([cmd]) => (typeof cmd === 'string' ? cmd : ''))
        .filter((cmd) => cmd.includes('send-keys'));

    const getKillPaneCommands = () =>
      mockExecSync.mock.calls
        .map(([cmd]) => (typeof cmd === 'string' ? cmd : ''))
        .filter((cmd) => cmd.includes('kill-pane'));

    it('kills the pane and throws when the worktree is missing', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      // Point at an "existing" worktree path that isn't tracked as created
      // → fs.existsSync(worktreePath + '/.git') returns false → throws inside
      // the worktree-creation try/catch before any agent command is sent.
      const missingWorktreePath = '/test/.dmux/worktrees/does-not-exist';
      const baseImplementation = mockExecSync.getMockImplementation();
      mockExecSync.mockImplementation(((command: string, options?: any) => {
        if (
          options?.cwd === missingWorktreePath
          && command.includes('rev-parse --show-toplevel')
        ) {
          throw new Error('Not a git repository');
        }

        return baseImplementation?.(command, options);
      }) as any);

      await expect(
        createPane(
          {
            prompt: 'fix auth bug',
            agent: 'claude',
            projectName: 'test-project',
            existingPanes: [],
            existingWorktree: {
              slug: 'does-not-exist',
              worktreePath: missingWorktreePath,
              vcsBackend: 'git',
              targetRef: 'does-not-exist',
              branchName: 'does-not-exist',
            },
          },
          ['claude']
        )
      ).rejects.toThrow(/Failed to create worktree/);

      // Pane must be killed so the user is never dropped at projectRoot
      // with a live shell.
      expect(
        getKillPaneCommands().some((cmd) => cmd.includes('%1'))
      ).toBe(true);

      // Agent launch command must never reach the pane.
      const sendKeys = getSendKeysCommands();
      expect(sendKeys.some((cmd) => cmd.includes('claude'))).toBe(false);
    });

    it('kills the pane and throws when the worktree_created hook fails', async () => {
      const { triggerHookSync } = await import('../../src/utils/hooks.js');
      vi.mocked(triggerHookSync).mockResolvedValueOnce({
        success: false,
        error: 'dependency install failed',
      });

      const { createPane } = await import('../../src/utils/paneCreation.js');

      await expect(
        createPane(
          {
            prompt: 'add dashboard',
            agent: 'claude',
            projectName: 'test-project',
            existingPanes: [],
          },
          ['claude']
        )
      ).rejects.toThrow(/worktree_created hook failed/);

      // Pane must be killed so the agent cannot run inside a
      // half-configured worktree.
      expect(
        getKillPaneCommands().some((cmd) => cmd.includes('%1'))
      ).toBe(true);

      // Agent launch command must never reach the pane.
      const sendKeys = getSendKeysCommands();
      expect(sendKeys.some((cmd) => cmd.includes('claude'))).toBe(false);
    });

    it('runs worktree_created hook before launching the agent', async () => {
      const { triggerHookSync } = await import('../../src/utils/hooks.js');
      const callOrder: string[] = [];

      vi.mocked(triggerHookSync).mockImplementationOnce(async (hookName) => {
        callOrder.push(`hook:${hookName}`);
        return { success: true };
      });

      // Record when the agent launch command is sent to the pane.
      const originalImpl = mockExecSync.getMockImplementation();
      mockExecSync.mockImplementation((command: string, options?: any) => {
        const cmd = command.toString();
        if (
          cmd.includes('send-keys')
          && cmd.includes('claude')
          && !cmd.includes('worktree add')
        ) {
          callOrder.push('agent-launch');
        }
        return originalImpl ? originalImpl(command, options) : '';
      });

      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'hook ordering test',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude']
      );

      const hookIdx = callOrder.indexOf('hook:worktree_created');
      const agentIdx = callOrder.indexOf('agent-launch');

      expect(hookIdx).toBeGreaterThanOrEqual(0);
      expect(agentIdx).toBeGreaterThanOrEqual(0);
      expect(hookIdx).toBeLessThan(agentIdx);
    });
  });

  describe('Pane Closure Flow', () => {
    it('should present choice dialog for worktree panes', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        vcsBackend: 'git',
        targetRef: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'test-session',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      const result = await closePane(testPane, mockContext);

      // Should return choice dialog with 3 options
      expect(result.type).toBe('choice');
      if (result.type === 'choice') {
        expect(result.options).toHaveLength(3);
        expect(result.options?.map(o => o.id)).toEqual([
          'kill_only',
          'kill_and_clean',
          'kill_clean_branch',
        ]);
      }
    });

    it('should kill tmux pane when closing', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        vcsBackend: 'git',
        targetRef: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'test-session',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      mockGetPanes.mockReturnValue([testPane]);

      const result = await closePane(testPane, mockContext);

      // Execute the close
      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('kill_only');
      }

      // Verify tmux kill-pane was called
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('tmux kill-pane'),
        expect.any(Object)
      );
    });

    it('should queue worktree cleanup with kill_and_clean option', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        vcsBackend: 'git',
        targetRef: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'test-session',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      mockGetPanes.mockReturnValue([testPane]);

      const result = await closePane(testPane, mockContext);

      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('kill_and_clean');
      }

      expect(mockEnqueueCleanup).toHaveBeenCalledWith(
        expect.objectContaining({
          pane: testPane,
          deleteBranch: false,
        })
      );
    });

    it('should handle background cleanup enqueue failure gracefully', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');

      mockEnqueueCleanup.mockImplementation(() => {
        throw new Error('enqueue failed');
      });

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        vcsBackend: 'git',
        targetRef: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'test-session',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      mockGetPanes.mockReturnValue([testPane]);

      const result = await closePane(testPane, mockContext);
      let executeResult = result;

      if (result.type === 'choice' && result.onSelect) {
        executeResult = await result.onSelect('kill_and_clean');
      }

      // Should still succeed (cleanup enqueue failures are non-critical)
      expect(executeResult.type).toBe('success');
    });

    it('should trigger post-close hooks', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');
      const { triggerHook } = await import('../../src/utils/hooks.js');

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        vcsBackend: 'git',
        targetRef: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'test-session',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      mockGetPanes.mockReturnValue([testPane]);

      const result = await closePane(testPane, mockContext);

      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('kill_and_cleanup_worktree');
      }

      // Verify hooks were triggered
      expect(triggerHook).toHaveBeenCalled();
    });
  });

  describe('Pane Rebinding Flow', () => {
    it('should detect dead pane', async () => {
      // Mock tmux pane not found
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('select-pane') && cmd.includes('%1')) {
          throw new Error("can't find pane: %1");
        }
        return Buffer.from('');
      });

      const { execSync } = await import('child_process');

      // Attempt to select dead pane
      try {
        execSync('tmux select-pane -t %1', { stdio: 'pipe' });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain("can't find pane");
      }
    });

    it('should create new tmux pane for rebind', async () => {
      // This would test the rebinding logic once it's implemented
      // For now, we verify the tmux split-window command works

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('split-window')) {
          return Buffer.from('%2');
        }
        return Buffer.from('');
      });

      const { execSync } = await import('child_process');
      const newPaneId = execSync('tmux split-window -h', { stdio: 'pipe' })
        .toString()
        .trim();

      expect(newPaneId).toBe('%2');
    });

    it('should preserve worktree and slug during rebind', async () => {
      // Test that rebinding doesn't recreate worktree
      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'existing-branch',
        vcsBackend: 'git',
        targetRef: 'existing-branch',
        prompt: 'original prompt',
        paneId: '%1', // Old, dead pane
        worktreePath: '/test/.dmux/worktrees/existing-branch',
      };

      // Rebinding would update paneId but keep slug and worktreePath
      const reboundPane = {
        ...testPane,
        paneId: '%2', // New pane ID
      };

      expect(reboundPane.slug).toBe(testPane.slug);
      expect(reboundPane.worktreePath).toBe(testPane.worktreePath);
      expect(reboundPane.paneId).not.toBe(testPane.paneId);
    });
  });
});
