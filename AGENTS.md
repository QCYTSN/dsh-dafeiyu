# Repository agent instructions

## Release publishing

- Never run `npm publish` locally. npm releases are built and published by
  `.github/workflows/publish.yml` through npm trusted publishing (OIDC).
- Never force, delete, move, or reuse a published version tag. If a version already exists, bump
  `package.json` and update the release notes.
- Before publishing, work on `main`, commit every intended release file, and leave the worktree
  clean.
- On Windows, publish the commit and version tag with:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/push-release.ps1
  ```

- From WSL, do not use WSL Linux Git for the release push. This development machine has had
  intermittent GnuTLS failures there. Use:

  ```bash
  bash scripts/push-release.sh
  ```

  The wrapper calls Windows Git so Windows and WSL share the same GitHub credential manager and
  network path.
- The release script validates `main`, a clean worktree, package version, tag ownership, and remote
  history, then atomically pushes `main` and `v<package version>`. GitHub Actions handles tests,
  Windows / Linux x64 / macOS Helper packaging, npm publishing, and the GitHub Release.
- Use `-DryRun` with either entry point to validate without pushing.
- npm OIDC trusted publishing cannot run `npm dist-tag`. Promoting a previously published alpha to
  `latest` is a separate package-owner action and must not be faked with a local publish.
