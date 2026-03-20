import { spawn } from 'child_process';
import { rm } from 'fs/promises';
import type { DmuxPane } from '../types.js';
import { triggerHook } from '../utils/hooks.js';
import { getPaneBranchName } from '../utils/git.js';
import { getTargetRef } from '../vcs/references.js';
import { LogService } from './LogService.js';

interface WorktreeCleanupJob {
  pane: DmuxPane;
  paneProjectRoot: string;
  mainRepoPath: string;
  deleteBranch: boolean;
}

type PaneWithWorktree = DmuxPane & { worktreePath: string };
type GitCleanupPane = PaneWithWorktree & { vcsBackend?: 'git' };
type JjCleanupPane = PaneWithWorktree & {
  vcsBackend: 'jj';
  targetRef: string;
  workspaceName: string;
};

interface GitCleanupJob extends Omit<WorktreeCleanupJob, 'pane'> {
  pane: GitCleanupPane;
}

interface JjCleanupJob extends Omit<WorktreeCleanupJob, 'pane'> {
  pane: JjCleanupPane;
}

interface CommandResult {
  success: boolean;
  error?: string;
}

/**
 * Queues worktree deletions in the background so large filesystem cleanup
 * never blocks the main dmux event loop.
 */
export class WorktreeCleanupService {
  private static instance: WorktreeCleanupService;
  private cleanupQueue: Promise<void> = Promise.resolve();
  private logger = LogService.getInstance();

  static getInstance(): WorktreeCleanupService {
    if (!WorktreeCleanupService.instance) {
      WorktreeCleanupService.instance = new WorktreeCleanupService();
    }
    return WorktreeCleanupService.instance;
  }

  enqueueCleanup(job: WorktreeCleanupJob): Promise<void> {
    if (!job.pane.worktreePath) {
      return Promise.resolve();
    }

    const cleanupPromise = this.cleanupQueue
      .then(() => this.runCleanup(job))
      .catch((error) => {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Background worktree cleanup failed for ${job.pane.slug}: ${errorObj.message}`,
          'paneActions',
          job.pane.id,
          errorObj
        );
      });

    this.cleanupQueue = cleanupPromise;
    return cleanupPromise;
  }

  private async runCleanup(job: WorktreeCleanupJob): Promise<void> {
    const { pane, paneProjectRoot, mainRepoPath, deleteBranch } = job;
    if (!pane.worktreePath) {
      return;
    }

    this.logger.debug(
      `Starting background worktree cleanup for ${pane.slug}`,
      'paneActions',
      pane.id
    );

    switch (pane.vcsBackend) {
      case 'jj':
        await this.runJjCleanup(this.asJjCleanupJob(job));
        break;
      case 'git':
      case undefined:
        await this.runGitCleanup(this.asGitCleanupJob(job));
        break;
    }

    this.logger.debug(
      `Finished background worktree cleanup for ${pane.slug}`,
      'paneActions',
      pane.id
    );
  }

  private asGitCleanupJob(job: WorktreeCleanupJob): GitCleanupJob {
    if (!job.pane.worktreePath || job.pane.vcsBackend === 'jj') {
      throw new Error(`Expected a git cleanup job for ${job.pane.slug}`);
    }

    return {
      ...job,
      pane: job.pane as GitCleanupPane,
    };
  }

  private asJjCleanupJob(job: WorktreeCleanupJob): JjCleanupJob {
    if (!job.pane.worktreePath || job.pane.vcsBackend !== 'jj') {
      throw new Error(`Expected a jj cleanup job for ${job.pane.slug}`);
    }

    return {
      ...job,
      pane: job.pane as JjCleanupPane,
    };
  }

  private async runGitCleanup(job: GitCleanupJob): Promise<void> {
    const { pane, paneProjectRoot, mainRepoPath, deleteBranch } = job;

    const removeResult = await this.runGitCommand(
      ['worktree', 'remove', pane.worktreePath, '--force'],
      mainRepoPath
    );

    if (!removeResult.success) {
      this.logger.warn(
        `Worktree removal reported an error for ${pane.slug}: ${removeResult.error}`,
        'paneActions',
        pane.id
      );
    }

    // The hook should run after deletion is attempted, regardless of outcome.
    await triggerHook('worktree_removed', paneProjectRoot, pane);

    if (deleteBranch) {
      const deleteBranchResult = await this.runGitCommand(
        ['branch', '-D', getPaneBranchName(pane)],
        mainRepoPath
      );

      if (!deleteBranchResult.success) {
        this.logger.warn(
          `Branch deletion reported an error for ${pane.slug}: ${deleteBranchResult.error}`,
          'paneActions',
          pane.id
        );
      }
    }
  }

  private async runJjCleanup(job: JjCleanupJob): Promise<void> {
    const { pane, paneProjectRoot, mainRepoPath, deleteBranch } = job;

    const forgetResult = await this.runJjCommand(
      ['workspace', 'forget', pane.workspaceName],
      mainRepoPath
    );

    if (!forgetResult.success) {
      this.logger.warn(
        `Workspace forget reported an error for ${pane.slug}: ${forgetResult.error}`,
        'paneActions',
        pane.id
      );
    }

    try {
      await rm(pane.worktreePath, { recursive: true, force: true });
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        `Workspace directory removal reported an error for ${pane.slug}: ${errorObj.message}`,
        'paneActions',
        pane.id
      );
    }

    // The hook should run after deletion is attempted, regardless of outcome.
    await triggerHook('worktree_removed', paneProjectRoot, pane);

    if (deleteBranch) {
      const targetRef = getTargetRef(pane);
      if (!targetRef) {
        return;
      }

      const deleteBookmarkResult = await this.runJjCommand(
        ['bookmark', 'delete', targetRef],
        mainRepoPath
      );

      if (!deleteBookmarkResult.success) {
        this.logger.warn(
          `Bookmark deletion reported an error for ${pane.slug}: ${deleteBookmarkResult.error}`,
          'paneActions',
          pane.id
        );
      }
    }
  }

  private runGitCommand(args: string[], cwd: string): Promise<CommandResult> {
    return this.runCommand('git', args, cwd);
  }

  private runJjCommand(args: string[], cwd: string): Promise<CommandResult> {
    return this.runCommand('jj', args, cwd);
  }

  private runCommand(command: 'git' | 'jj', args: string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';

      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error: Error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
          return;
        }

        resolve({
          success: false,
          error:
            stderr.trim() ||
            `${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`,
        });
      });
    });
  }
}
