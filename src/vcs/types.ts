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
	 * This is currently set to `false` for `jj`, and `true` for `git` vcs.
	 */
  supportsMerge: boolean;
}
