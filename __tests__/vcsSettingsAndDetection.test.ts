import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('vcsBackend settings validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('accepts valid vcsBackend values', async () => {
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn(() => false),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(() => '{}'),
      };
    });

    const { SettingsManager } = await import('../src/utils/settingsManager.js');
    const manager = new SettingsManager('/tmp/test-project');

    expect(() => manager.updateSetting('vcsBackend', 'auto', 'global')).not.toThrow();
    expect(() => manager.updateSetting('vcsBackend', 'git', 'project')).not.toThrow();
    expect(() => manager.updateSetting('vcsBackend', 'jj', 'global')).not.toThrow();
  });

  it('rejects invalid vcsBackend values', async () => {
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn(() => false),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(() => '{}'),
      };
    });

    const { SettingsManager } = await import('../src/utils/settingsManager.js');
    const manager = new SettingsManager('/tmp/test-project');

    expect(() => manager.updateSetting('vcsBackend', 'svn' as any, 'global')).toThrow('Invalid vcsBackend');
  });

  it('loads persisted vcsBackend values from settings files', async () => {
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn((target: string) => (
          target === '/tmp/test-project/.dmux/settings.json'
          || target === '/tmp/test-project/.dmux.defaults.json'
        )),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn((target: string) => {
          if (target === '/tmp/test-project/.dmux/settings.json') {
            return JSON.stringify({ vcsBackend: 'jj' });
          }
          if (target === '/tmp/test-project/.dmux.defaults.json') {
            return JSON.stringify({ vcsBackend: 'git' });
          }
          return '{}';
        }),
      };
    });

    const { SettingsManager } = await import('../src/utils/settingsManager.js');
    const manager = new SettingsManager('/tmp/test-project');

    expect(manager.getProjectSettings().vcsBackend).toBe('jj');
    expect(manager.getTeamDefaults().vcsBackend).toBe('git');
    expect(manager.getSettings().vcsBackend).toBe('jj');
  });
});

describe('project root VCS detection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('auto-detects jj repositories', async () => {
    const mockExecSync = vi.fn((command: string) => {
      if (command === 'jj workspace root') {
        return '/tmp/repo\n';
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    vi.doMock('child_process', () => ({
      execSync: mockExecSync,
    }));

    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn((target: string) => target === '/tmp/repo'),
        statSync: vi.fn(() => ({ isDirectory: () => true })),
        readFileSync: vi.fn(() => '{}'),
      };
    });

    const { resolveProjectRootFromPath } = await import('../src/utils/projectRoot.js');
    const resolved = resolveProjectRootFromPath('/tmp/repo');

    expect(resolved).toEqual({
      projectRoot: '/tmp/repo',
      projectName: 'repo',
      requestedPath: '/tmp/repo',
      vcsBackend: 'jj',
    });
  });

  it('prefers project-configured git backend in colocated repos', async () => {
    const mockExecSync = vi.fn((command: string) => {
      if (command === 'jj workspace root') {
        return '/tmp/repo\n';
      }
      if (command === 'git rev-parse --path-format=absolute --git-common-dir') {
        return '/tmp/repo/.git\n';
      }
      if (command === 'git rev-parse --show-toplevel') {
        return '/tmp/repo\n';
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    vi.doMock('child_process', () => ({
      execSync: mockExecSync,
    }));

    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn((target: string) => (
          target === '/tmp/repo'
          || target === '/tmp/repo/.dmux/settings.json'
        )),
        statSync: vi.fn(() => ({ isDirectory: () => true })),
        readFileSync: vi.fn((target: string) => (
          target === '/tmp/repo/.dmux/settings.json'
            ? JSON.stringify({ vcsBackend: 'git' })
            : '{}'
        )),
      };
    });

    const { resolveProjectRootFromPath } = await import('../src/utils/projectRoot.js');
    const resolved = resolveProjectRootFromPath('/tmp/repo');

    expect(resolved.vcsBackend).toBe('git');
    expect(resolved.projectRoot).toBe('/tmp/repo');
  });

  it('defaults auto detection to git in colocated repos', async () => {
    const mockExecSync = vi.fn((command: string) => {
      if (command === 'jj workspace root') {
        return '/tmp/repo\n';
      }
      if (command === 'git rev-parse --path-format=absolute --git-common-dir') {
        return '/tmp/repo/.git\n';
      }
      if (command === 'git rev-parse --show-toplevel') {
        return '/tmp/repo\n';
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    vi.doMock('child_process', () => ({
      execSync: mockExecSync,
    }));

    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn((target: string) => target === '/tmp/repo'),
        statSync: vi.fn(() => ({ isDirectory: () => true })),
        readFileSync: vi.fn(() => '{}'),
      };
    });

    const { resolveProjectRootFromPath } = await import('../src/utils/projectRoot.js');
    const resolved = resolveProjectRootFromPath('/tmp/repo');

    expect(resolved.vcsBackend).toBe('git');
  });

  it('honors global autoVcsPreference for colocated repos', async () => {
    const mockExecSync = vi.fn((command: string) => {
      if (command === 'jj workspace root') {
        return '/tmp/repo\n';
      }
      if (command === 'jj workspace root --name default') {
        return '/tmp/repo\n';
      }
      if (command === 'git rev-parse --path-format=absolute --git-common-dir') {
        return '/tmp/repo/.git\n';
      }
      if (command === 'git rev-parse --show-toplevel') {
        return '/tmp/repo\n';
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    vi.doMock('child_process', () => ({
      execSync: mockExecSync,
    }));

    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn((target: string) => (
          target === '/tmp/repo' || target.endsWith('.dmux.global.json')
        )),
        statSync: vi.fn(() => ({ isDirectory: () => true })),
        readFileSync: vi.fn((target: string) => (
          target.endsWith('.dmux.global.json')
            ? JSON.stringify({ autoVcsPreference: 'jj' })
            : '{}'
        )),
      };
    });

    const { resolveProjectRootFromPath } = await import('../src/utils/projectRoot.js');
    const resolved = resolveProjectRootFromPath('/tmp/repo');

    expect(resolved.vcsBackend).toBe('jj');
  });

  it('fails loudly when an explicit global backend is unavailable', async () => {
    const mockExecSync = vi.fn((command: string) => {
      if (command === 'git rev-parse --path-format=absolute --git-common-dir') {
        return '/tmp/repo/.git\n';
      }
      if (command === 'git rev-parse --show-toplevel') {
        return '/tmp/repo\n';
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    vi.doMock('child_process', () => ({
      execSync: mockExecSync,
    }));

    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn((target: string) => (
          target === '/tmp/repo' || target.endsWith('.dmux.global.json')
        )),
        statSync: vi.fn(() => ({ isDirectory: () => true })),
        readFileSync: vi.fn((target: string) => (
          target.endsWith('.dmux.global.json')
            ? JSON.stringify({ vcsBackend: 'jj' })
            : '{}'
        )),
      };
    });

    const { resolveProjectRootFromPath } = await import('../src/utils/projectRoot.js');

    expect(() => resolveProjectRootFromPath('/tmp/repo')).toThrow(/Configured global vcsBackend "jj"/);
  });
});

describe('vcs backend registry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exposes backend capabilities', async () => {
		const { getVcsBackend } = await import('../src/vcs/registry.js');

    expect(getVcsBackend('git').capabilities.supportsMerge).toBe(true);
    expect(getVcsBackend('jj').capabilities.supportsMerge).toBe(false);
  });
});
