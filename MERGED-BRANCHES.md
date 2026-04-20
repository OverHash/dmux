# Integration Branch: integration/2026-04-20

## Merge Checklist

| Status | #   | Branch Name                  | Remote | Commit Hash | Description |
| ------ | --- | ---------------------------- | ------ | ----------- | ----------- |
| ☑      | 1   | git-branch-selector-v2      | origin | 2a16157     | Tracks `origin/git-branch-selector-v2`; merged cleanly |
| ☑      | 2   | feat/jj-support             | origin | d5c1396     | Tracks `origin/jj-support-v2`; conflicts resolved in docs and pane creation |

## Merge Log

- Initial checklist created before any merges.
- Merged `git-branch-selector-v2` at `2a16157` via merge commit `f3afe6f`. No conflicts; `pnpm run typecheck` passed.
- Merged `feat/jj-support` at `d5c1396` via merge commit `02eff1b`. Resolved conflicts in `docs/src/content/configuration.js` and `src/utils/paneCreation.ts` by keeping the new git override flow and the VCS-backend abstraction; `pnpm run typecheck` passed.
- Follow-up integration fix: hardened `src/vcs/gitBackend.ts` to ignore non-absolute `git-common-dir` output before deriving the project root, which restored pane-creation integration tests after the merge conflict resolution.
