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

export interface VcsBackend {
  id: SupportedVcsBackend;
  displayName: string;
  capabilities: VcsCapabilities;
  isRepository(workingDir: string): boolean;
  resolveProjectRoot(workingDir: string): string;
  getCurrentWorkspaceRoot(workingDir: string): string;
}
