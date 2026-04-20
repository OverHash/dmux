import type { DmuxSettings, WorkspaceVcsState } from '../types.js';

export type SupportedVcsBackend = 'git' | 'jj';

export type VcsBackendSetting = 'auto' | SupportedVcsBackend;

export interface VcsDetectionResult {
  backend: SupportedVcsBackend;
  projectRoot: string;
}

export interface VcsCapabilities {
  /**
   * Whether the VCS selected supports merging in dmux.
   *
   * This is currently `false` for `jj` and `true` for `git`.
   */
  supportsMerge: boolean;
}

export interface CreateWorkspaceInput {
  projectRoot: string;
  worktreePath: string;
  slug: string;
  /** Backend-managed ref name for this workspace (branch or bookmark). */
  targetRef: string;
  /**
   * Backend-specific workspace name when the VCS distinguishes it from the ref.
   * Git ignores this; jj uses it for named workspaces.
   */
  workspaceName?: string;
  /**
   * Optional parent ref/revision to branch from.
   * Implementations should validate this according to backend rules.
   */
  startPointRef?: string;
  settings: DmuxSettings;
}

export interface CreateWorkspaceResult {
  vcsState: WorkspaceVcsState;
  /** Directory the pane shell should `cd` into after creation succeeds. */
  cwd: string;
}

export interface ResolveWorkspaceStateInput {
  worktreePath: string;
  slug: string;
  /**
   * Previously persisted VCS state, if any.
   * Implementations may prefer this to preserve dmux-managed naming semantics.
   */
  storedState?: WorkspaceVcsState;
}

export interface VcsBackend {
  id: SupportedVcsBackend;
  displayName: string;
  capabilities: VcsCapabilities;
  isRepository(workingDir: string): boolean;
  resolveProjectRoot(workingDir: string): string;
  getCurrentWorkspaceRoot(workingDir: string): string;
  /**
   * Create a brand-new workspace/worktree for this backend and return the
   * normalized VCS state dmux should store for it.
   */
  createWorkspace(input: CreateWorkspaceInput): CreateWorkspaceResult;
  /**
   * Resolve the VCS state for an already-existing workspace/worktree.
   * This is used when dmux reopens or reattaches to a workspace.
   */
  resolveWorkspaceState(input: ResolveWorkspaceStateInput): WorkspaceVcsState;
}
