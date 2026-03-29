import { describe, expect, it, vi } from 'vitest';
import { PopupManager, type PopupManagerConfig } from '../src/services/PopupManager.js';
import type { AgentName } from '../src/utils/agentLaunch.js';

function createPopupManager(): PopupManager {
  const config: PopupManagerConfig = {
    sidebarWidth: 40,
    projectRoot: '/tmp/session-project',
    popupsSupported: true,
    isDevMode: false,
    terminalWidth: 120,
    terminalHeight: 40,
    availableAgents: ['claude', 'codex'] as AgentName[],
    settingsManager: {
      getSettings: () => ({ vcsBackend: 'jj' }),
      getGlobalSettings: () => ({ showFooterTips: true }),
      getProjectSettings: () => ({ vcsBackend: 'jj' }),
    },
    projectSettings: {},
    trackProjectActivity: async (work) => await work(),
  };

  return new PopupManager(config, () => {}, () => {});
}

describe('PopupManager launchSettingsPopup', () => {
  it('uses the target project settings when a project root is provided', async () => {
    const manager = createPopupManager() as any;
    const targetProjectRoot = '/tmp/other-project';
    const targetSettingsManager = {
      getSettings: () => ({ vcsBackend: 'auto' }),
      getGlobalSettings: () => ({ showFooterTips: false }),
      getProjectSettings: () => ({ vcsBackend: 'auto' }),
    };

    manager.checkPopupSupport = vi.fn(() => true);
    manager.getSettingsManager = vi.fn(() => targetSettingsManager);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: {},
    });

    await manager.launchSettingsPopup(async () => {}, targetProjectRoot);

    expect(manager.getSettingsManager).toHaveBeenCalledWith(targetProjectRoot);
    expect(manager.launchPopup).toHaveBeenCalledWith(
      'settingsPopup.js',
      [],
      expect.any(Object),
      expect.objectContaining({
        projectRoot: targetProjectRoot,
        settings: { vcsBackend: 'auto' },
        globalSettings: { showFooterTips: false },
        projectSettings: { vcsBackend: 'auto' },
      }),
      targetProjectRoot
    );
  });
});
