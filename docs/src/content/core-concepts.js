export const meta = { title: 'Core Concepts' };

export function render() {
  return `
    <h1>Core Concepts</h1>
    <p class="lead">dmux is built around three core concepts: projects, panes, and isolated workspaces. Understanding how they interact will help you get the most out of parallel development.</p>

    <h2>Projects</h2>
    <p>A <strong>project</strong> in dmux corresponds to a source-control workspace root. Today dmux supports Git repositories and jj workspaces. When you run <code>dmux</code> inside a supported project, it creates a stable, project-scoped tmux session named like <code>dmux-your-project-a1b2c3d4</code>.</p>
    <ul>
      <li>Each project gets its own isolated tmux session</li>
      <li>Session state is stored in <code>.dmux/dmux.config.json</code></li>
      <li>Multiple projects can be attached to one session via <a href="#/multi-project">multi-project</a> support</li>
    </ul>

    <h2>Panes</h2>
    <p>A <strong>pane</strong> is a tmux pane running an AI agent or shell surface in an isolated environment. Each pane has:</p>
    <ul>
      <li>A unique ID (e.g. <code>dmux-1</code>, <code>dmux-2</code>)</li>
      <li>A slug derived from your prompt (e.g. <code>fix-auth</code>)</li>
      <li>Its own isolated workspace and managed ref</li>
      <li>An agent, terminal, or file browser running against that workspace</li>
    </ul>

    <h3>Pane Lifecycle</h3>
    <ol>
      <li><strong>Create</strong> — press <kbd>n</kbd>, enter a prompt, select an agent</li>
      <li><strong>Work</strong> — the agent runs in its isolated workspace</li>
      <li><strong>Inspect</strong> — optionally open a file browser, attach another agent, or add a terminal to the same workspace</li>
      <li><strong>Monitor</strong> — dmux tracks agent status (working, analyzing, waiting, idle)</li>
      <li><strong>Merge</strong> — bring changes back to main with auto-commit</li>
      <li><strong>Cleanup</strong> — the workspace and its managed ref are removed when you choose the destructive close options</li>
    </ol>

    <h3>Pane Status Detection</h3>
    <p>dmux monitors each pane to detect the agent's state:</p>
    <table>
      <thead>
        <tr><th>Status</th><th>Meaning</th></tr>
      </thead>
      <tbody>
        <tr><td><code>working</code></td><td>Agent is actively working</td></tr>
        <tr><td><code>analyzing</code></td><td>dmux is analyzing recent terminal output</td></tr>
        <tr><td><code>waiting</code></td><td>Agent is blocked on a question or option dialog</td></tr>
        <tr><td><code>idle</code></td><td>No active work is currently detected</td></tr>
      </tbody>
    </table>

    <h3>Attention and Notifications</h3>
    <p>When a pane settles into a state that needs you, dmux marks it with an attention indicator in the sidebar and pane border. On macOS, dmux can also send a native notification for panes that are not currently focused.</p>
    <ul>
      <li>The selected pane will not notify you while it is fully focused</li>
      <li>Attention sounds are configurable from <a href="#/configuration">settings</a></li>
      <li>On non-macOS platforms, dmux still works normally without the native helper</li>
    </ul>

    <h3>Pane Visibility</h3>
    <p>dmux lets you temporarily remove panes from the active window without stopping them.</p>
    <ul>
      <li><kbd>h</kbd> hides or restores the selected pane</li>
      <li><kbd>H</kbd> hides every other pane, then shows them again on the next toggle</li>
      <li><kbd>P</kbd> shows only the active project's panes in a multi-project session, then restores all panes</li>
      <li>Hidden panes keep running and are marked <code>(hidden)</code> in the sidebar</li>
    </ul>

    <h3>Built-In File Browser</h3>
    <p>Press <kbd>f</kbd> or use <strong>Browse Files</strong> from a pane menu to open a read-only browser rooted at that pane's workspace.</p>
    <ul>
      <li>Search files and directories inline</li>
      <li>Sort by name, modified time, or git status</li>
      <li>Preview either file contents or git diff output without leaving dmux</li>
      <li>Browser panes stay associated with the same project group as their source workspace</li>
    </ul>

    <h2>Workspace Backends</h2>
    <p>Each pane operates in a separate working copy of your project. dmux currently supports:</p>
    <ul>
      <li><strong>Git</strong> &mdash; each pane gets a <a href="https://git-scm.com/docs/git-worktree" target="_blank" rel="noopener">git worktree</a> with its own branch</li>
      <li><strong>jj</strong> &mdash; each pane gets a <code>jj workspace</code> with its own managed ref</li>
      <li><strong>Auto</strong> &mdash; dmux defaults to Git when both are available, unless you set a global preference for jj</li>
    </ul>
    <p>In both backends, the result is the same from the pane's point of view:</p>
    <ul>
      <li>Multiple agents can work simultaneously without conflicts</li>
      <li>Each agent has a clean, independent copy of the codebase</li>
      <li>No need to stash or commit before switching contexts</li>
      <li>The workspace metadata is lightweight, so these copies are practical to create and destroy frequently</li>
    </ul>

    <div class="file-tree">your-project/              # Main repository
├── .git/                  # Shared git directory
├── src/
└── .dmux/worktrees/
    ├── fix-auth/          # Worktree: branch "fix-auth"
    │   ├── .git           # Points to main .git
    │   └── src/           # Independent working copy
    └── add-tests/         # Worktree: branch "add-tests"
        ├── .git
        └── src/</div>

    <h2>The Merge Flow</h2>
    <p>When you merge a pane (press <kbd>m</kbd> to open the menu, then select merge), dmux currently performs a Git-only two-phase merge:</p>
    <ol>
      <li><strong>Auto-commit</strong> — any uncommitted changes in the worktree are committed with an AI-generated message</li>
      <li><strong>Merge main → worktree</strong> — the latest changes from main are merged into the worktree branch (to resolve conflicts in the worktree, not on main)</li>
      <li><strong>Merge worktree → main</strong> — the worktree branch is merged back into main</li>
      <li><strong>Cleanup</strong> — the Git worktree and branch are removed</li>
    </ol>

    <div class="callout callout-info">
      <div class="callout-title">Note</div>
      Git panes support dmux's built-in merge flow. jj panes can be created, reopened, and cleaned up by dmux, but you should integrate them manually in jj for now.
    </div>

    <h2>The Sidebar</h2>
    <p>The dmux TUI shows a sidebar with all active panes. Each pane displays:</p>
    <ul>
      <li>The pane slug (plus backend-specific ref information when relevant)</li>
      <li>A status and attention indicator</li>
      <li>A hidden marker when a pane has been detached from the active window</li>
      <li>The original prompt</li>
    </ul>
    <p>You can optionally use a sidebar layout mode (press <kbd>L</kbd>) where the dmux sidebar occupies a fixed 40-column pane on the left, with agent panes arranged in a grid to the right.</p>

    <h2>Next Steps</h2>
    <ul>
      <li><a href="#/keyboard-shortcuts">Keyboard Shortcuts</a> — all TUI controls</li>
      <li><a href="#/merging">Merging</a> — detailed merge workflow</li>
      <li><a href="#/multi-project">Multi-Project</a> — working with multiple repos</li>
    </ul>
  `;
}
