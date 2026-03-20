import { describe, expect, it, vi } from 'vitest';
import { PopupManager, type PopupManagerConfig } from '../src/services/PopupManager.js';
import type { AgentName } from '../src/utils/agentLaunch.js';

function createPopupManager(
  settings: Record<string, unknown> = {},
  availableAgents: AgentName[] = ['claude']
): PopupManager {
  const config: PopupManagerConfig = {
    sidebarWidth: 40,
    projectRoot: '/tmp/project',
    popupsSupported: true,
    isDevMode: false,
    terminalWidth: 120,
    terminalHeight: 40,
    availableAgents,
    settingsManager: {
      getSettings: () => settings,
      getGlobalSettings: () => ({}),
      getProjectSettings: () => ({}),
    },
    projectSettings: {},
    trackProjectActivity: async <T>(work: () => Promise<T> | T) => await work(),
  };

  return new PopupManager(config, () => {}, () => {});
}

describe('PopupManager launchNewPanePopup', () => {
  it('passes git options flag when setting is enabled', async () => {
    const manager = createPopupManager({ promptForGitOptionsOnCreate: true }) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: { prompt: 'test prompt', baseBranch: 'develop', branchName: 'feat/LIN-1' },
    });

    const result = await manager.launchNewPanePopup('/tmp/other-project');

    const [scriptName, popupArgs, popupOptions] = manager.launchPopup.mock.calls[0];
    expect(scriptName).toBe('newPanePopup.js');
    expect(popupArgs).toEqual(['/tmp/other-project', '1', 'git']);
    expect(popupOptions).toEqual(expect.objectContaining({
      title: '  ✨ New Pane — other-project  ',
    }));
    expect(result).toEqual({
      prompt: 'test prompt',
      baseBranch: 'develop',
      branchName: 'feat/LIN-1',
    });
  });

  it('disables git options when caller requests allowGitOptions=false', async () => {
    const manager = createPopupManager({ promptForGitOptionsOnCreate: true }) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: { prompt: 'attach prompt' },
    });

    await manager.launchNewPanePopup('/tmp/project', { allowGitOptions: false });

    const [scriptName, popupArgs] = manager.launchPopup.mock.calls[0];
    expect(scriptName).toBe('newPanePopup.js');
    expect(popupArgs).toEqual(['/tmp/project', '0', 'git']);
  });

  it('passes jj backend mode when project is configured for jj', async () => {
    const manager = createPopupManager({
      promptForGitOptionsOnCreate: true,
      vcsBackend: 'jj',
    }) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: { prompt: 'jj prompt', baseBranch: 'main', branchName: 'feat/jj-target' },
    });

    await manager.launchNewPanePopup('/tmp/project');

    const [scriptName, popupArgs] = manager.launchPopup.mock.calls[0];
    expect(scriptName).toBe('newPanePopup.js');
    expect(popupArgs).toEqual(['/tmp/project', '1', 'jj']);
  });

  it('normalizes legacy string payloads for backward compatibility', async () => {
    const manager = createPopupManager({ promptForGitOptionsOnCreate: false }) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: 'legacy prompt',
    });

    const result = await manager.launchNewPanePopup();

    expect(result).toEqual({ prompt: 'legacy prompt' });
  });

  it('trims empty override fields from popup payload', async () => {
    const manager = createPopupManager({ promptForGitOptionsOnCreate: true }) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: { prompt: 'prompt', baseBranch: '   ', branchName: ' feat/LIN-8 ' },
    });

    const result = await manager.launchNewPanePopup('/tmp/project');

    expect(result).toEqual({
      prompt: 'prompt',
      branchName: 'feat/LIN-8',
    });
  });

  it('returns null for malformed popup payloads', async () => {
    const manager = createPopupManager({ promptForGitOptionsOnCreate: true }) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: { baseBranch: 'develop' },
    });

    const result = await manager.launchNewPanePopup('/tmp/project');

    expect(result).toBeNull();
  });
});
