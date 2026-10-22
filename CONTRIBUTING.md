# Contributing

Thanks for helping. Tala is a small hobby project, so keep changes focused.

1. Fork, branch from `main`, `npm ci`.
2. Read [CLAUDE.md](CLAUDE.md): it documents the architecture and the traps (notably, only `src/library/` writes note data, and migrations must stay additive).
3. Before opening a PR, run:
   ```bash
   npm run typecheck && npm test && npm run build
   ```
   For UI or flow changes also run `npm run test:e2e` against `npm run preview`.
4. Add a `CHANGELOG.md` line under the unreleased section for user-visible changes.
5. No new dependencies without a reason in the PR description.

By contributing you agree your work is released under the [MIT license](LICENSE).
Report security problems privately, see [SECURITY.md](SECURITY.md).
