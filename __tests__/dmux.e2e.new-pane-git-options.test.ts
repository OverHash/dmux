import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  filterStartPointRefCandidates,
  normalizeGitRefCandidates,
  parseStartPointRefList,
  START_POINT_ERROR_MESSAGE,
  type StartPointRefCandidate,
} from '../src/components/popups/newPaneGitOptions.js';

function hasCmd(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function detectPopupRunner(): string | null {
  if (hasCmd('pnpm')) {
    return 'pnpm exec tsx "src/components/popups/newPanePopup.tsx"';
  }

  if (hasCmd('tsx')) {
    return 'tsx "src/components/popups/newPanePopup.tsx"';
  }

  const distPath = path.join(process.cwd(), 'dist', 'components', 'popups', 'newPanePopup.js');
  if (fs.existsSync(distPath)) {
    return `node "${distPath}"`;
  }

  return null;
}

function getGitRefCandidatesByRecentCommit(): StartPointRefCandidate[] {
  const localRaw = execSync(
    "git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads",
    { encoding: 'utf-8', stdio: 'pipe' }
  );
  const remoteRaw = execSync(
    "git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes",
    { encoding: 'utf-8', stdio: 'pipe' }
  );

  return normalizeGitRefCandidates(parseStartPointRefList(localRaw), parseStartPointRefList(remoteRaw));
}

async function poll<T>(
  fn: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 15000,
  intervalMs = 200
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (predicate(value)) return value;
    await sleep(intervalMs);
  }
  throw new Error('Timed out waiting for condition');
}

function capturePane(server: string, session: string): string {
  return execSync(`tmux -L ${server} capture-pane -p -t ${session}:0.0`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  });
}

async function waitForPaneText(
  server: string,
  session: string,
  expectedText: string,
  timeoutMs = 15000
): Promise<void> {
  let lastPaneText = '';
  try {
    await poll(
      () => {
        const paneText = capturePane(server, session);
        lastPaneText = paneText;
        return paneText;
      },
      (paneText) => paneText.includes(expectedText),
      timeoutMs,
      150
    );
  } catch {
    throw new Error(
      `Timed out waiting for pane text: "${expectedText}"\nLast pane:\n${lastPaneText}`
    );
  }
}

async function readPopupResult(resultFile: string): Promise<any | null> {
  try {
    const raw = await fsp.readFile(resultFile, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const runE2E = process.env.DMUX_E2E === '1';
const popupRunner = detectPopupRunner();
const canRun = runE2E && hasCmd('tmux') && !!popupRunner;
const startPointRefs = canRun ? getGitRefCandidatesByRecentCommit() : [];

describe.sequential('dmux e2e: new pane git options popup', () => {
  it.runIf(canRun)('writes prompt + start-point + branch override payload', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-ok';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');
    const existingStartPoint = startPointRefs[0];

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'e2e prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${existingStartPoint.value}'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });

      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-git-options'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      const payload = await poll(
        () => readPopupResult(resultFile),
        (value) => !!value
      );

      expect(payload.success).toBe(true);
      expect(payload.data.prompt).toBe('e2e prompt');
      expect(payload.data.baseBranch).toBe(existingStartPoint.value);
      expect(payload.data.branchName).toBe('feat/e2e-git-options');
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(canRun)('accepts highlighted start-point ref on Enter after typing partial text', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-enter-fill';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');
    const topRef = startPointRefs[0];
    const partial = topRef.label.slice(0, Math.min(3, topRef.label.length));
    const expectedRef = filterStartPointRefCandidates(startPointRefs, partial)[0] || topRef;

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'enter fill prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${partial}'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Branch/worktree name override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-enter-fill'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      const payload = await poll(
        () => readPopupResult(resultFile),
        (value) => !!value
      );

      expect(payload.success).toBe(true);
      expect(payload.data.baseBranch).toBe(expectedRef.value);
      expect(payload.data.branchName).toBe('feat/e2e-enter-fill');
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(canRun && startPointRefs.length > 1)('uses up/down arrows to change highlighted start-point ref before Enter', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-arrows';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');
    const expectedSelected = startPointRefs[1];

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'arrow selection prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Down`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Up`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Down`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Branch/worktree name override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-arrow-select'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      const payload = await poll(
        () => readPopupResult(resultFile),
        (value) => !!value
      );

      expect(payload.success).toBe(true);
      expect(payload.data.baseBranch).toBe(expectedSelected.value);
      expect(payload.data.branchName).toBe('feat/e2e-arrow-select');
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(canRun)('cycles prompt/base/branch with Tab and Shift+Tab', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-cycle';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');
    const existingStartPoint = startPointRefs[0];

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'cycle prompt'`, { stdio: 'pipe' });
      await waitForPaneText(server, session, 'cycle prompt');

      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });
      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${existingStartPoint.value}'`, { stdio: 'pipe' });

      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });
      await waitForPaneText(server, session, '▶ Branch/worktree name override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-cycle'`, { stdio: 'pipe' });

      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });
      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 ' updated'`, { stdio: 'pipe' });

      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });
      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 BTab`, { stdio: 'pipe' });
      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');

      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });
      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });
      await waitForPaneText(server, session, '▶ Branch/worktree name override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      const payload = await poll(
        () => readPopupResult(resultFile),
        (value) => !!value
      );

      expect(payload.success).toBe(true);
      expect(payload.data.prompt).toContain('updated');
      expect(payload.data.baseBranch).toBe(existingStartPoint.value);
      expect(payload.data.branchName).toBe('feat/e2e-cycle');
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(canRun)('does not auto-accept highlighted start-point ref when tabbing fields', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-tab-noaccept';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');
    const existingStartPoint = startPointRefs[0];
    const partialStartPoint = existingStartPoint.label.slice(0, Math.min(3, existingStartPoint.label.length));

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'tab no accept prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${partialStartPoint}'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Branch/worktree name override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-tab-noaccept'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await sleep(700);
      expect(fs.existsSync(resultFile)).toBe(false);
      await waitForPaneText(server, session, 'Base branch must match an existing local or remote ref');
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(canRun)('blocks submission for invalid start-point overrides', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-invalid';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'invalid prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'branch-that-should-not-exist-12345'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });
      await waitForPaneText(server, session, '▶ Branch/worktree name override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-invalid-base'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await sleep(700);
      expect(fs.existsSync(resultFile)).toBe(false);
      await waitForPaneText(server, session, 'Base branch must match an existing local or remote ref');
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(canRun)('treats Delete key as forward-delete in base branch input', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-delete-forward';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');
    const existingStartPoint = startPointRefs[0];

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'delete forward prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${existingStartPoint.value}x'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Left`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 -l "$(printf '\\033[3~')"`, { stdio: 'pipe' });

      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });
      await waitForPaneText(server, session, '▶ Branch/worktree name override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-delete-forward'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      const payload = await poll(
        () => readPopupResult(resultFile),
        (value) => !!value
      );

      expect(payload.success).toBe(true);
      expect(payload.data.baseBranch).toBe(existingStartPoint.value);
      expect(payload.data.branchName).toBe('feat/e2e-delete-forward');
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(canRun)('uses Backspace as left-delete in base branch input', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-backspace-left';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');
    const existingStartPoint = startPointRefs[0];

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'backspace left prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, '▶ Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${existingStartPoint.value}x'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Left`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 -l "$(printf '\\177')"`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await sleep(700);
      expect(fs.existsSync(resultFile)).toBe(false);
      await waitForPaneText(server, session, 'Base branch must match an existing local or remote ref');
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(!canRun)('skipped: tmux or popup runner unavailable', () => {
    // Intentionally empty
  });
});
