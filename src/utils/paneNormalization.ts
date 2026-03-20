import type { DmuxConfig, DmuxPane } from '../types.js';

export function normalizePane(pane: DmuxPane): DmuxPane {
  if (pane.vcsBackend === 'jj') {
    return {
      ...pane,
      targetRef: pane.targetRef || pane.slug,
      workspaceName: pane.workspaceName || pane.slug,
    };
  }

  return {
    ...pane,
    vcsBackend: 'git',
    targetRef: pane.targetRef || pane.branchName || pane.slug,
  };
}

export function normalizePanes(panes: DmuxPane[] | undefined | null): DmuxPane[] {
  if (!Array.isArray(panes)) {
    return [];
  }

  return panes.map((pane) => normalizePane(pane));
}

export function normalizeDmuxConfig(config: DmuxConfig): DmuxConfig {
  return {
    ...config,
    panes: normalizePanes(config.panes),
  };
}
