# Publishing releases

The repository publishes one cross-platform package through GitHub Actions and npm trusted
publishing. Windows, Linux x64, and macOS universal Helpers are built and visually smoke-tested on
their native GitHub-hosted runners. A Linux assembly job combines all three artifacts, checks their
final npm archive paths and executable modes, and smoke-tests the Linux Helper from the extracted
`.tgz`. A macOS runner then verifies both Mach-O architectures, the ad-hoc signature, AppKit
rendering, and stdin lifecycle from that exact final archive before OIDC publishing. No npm
password or long-lived publish token is stored in GitHub, Windows, or WSL.

## One-time npm setup

The package owner must complete this once on npmjs.com after `.github/workflows/publish.yml` exists
on GitHub:

1. Open the `dsh-dafeiyu` package on npmjs.com and go to **Settings**.
2. Find **Trusted Publisher** and select **GitHub Actions**.
3. Enter these exact values:
   - Organization or user: `QCYTSN`
   - Repository: `dsh-dafeiyu`
   - Workflow filename: `publish.yml`
   - Environment: leave empty
   - Allowed action: `npm publish`
4. Save the trusted publisher.
5. After the first successful automated release, set Publishing access to
   **Require two-factor authentication and disallow tokens**.

The workflow filename is case-sensitive. Enter only `publish.yml`, not the full
`.github/workflows/publish.yml` path.

Official npm documentation: <https://docs.npmjs.com/trusted-publishers/>

## Prepare a release

Before publishing:

1. Update the version in `package.json`. npm versions are immutable and cannot be reused.
2. Add the release notes to `CHANGELOG.md`.
3. Update the current version in `README.md` and `README_EN.md`.
4. Commit the changes on `main` and leave the worktree clean.

## Recommended release command

Use the repository release helper instead of separate `git push` and `git push <tag>` commands.
It verifies the release state and atomically pushes `main` together with the version tag, so either
both refs arrive on GitHub or neither does.

On Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/push-release.ps1
```

From WSL:

```bash
bash scripts/push-release.sh
```

The WSL entry point deliberately invokes Windows Git. This shares the Windows Git Credential
Manager login and Windows network path, avoiding both ephemeral WSL credentials and the GnuTLS
connection failures seen with WSL Linux Git. Neither command needs an npm login.

To validate without pushing, append `-DryRun`.

## Publish by pushing a version tag

The helper creates the annotated `v<package version>` tag and triggers the existing workflow. The
equivalent low-level operation is an atomic push of `main` and that tag. Do not move or reuse a
release tag.

Prerelease versions automatically use the npm `alpha` tag. Stable versions use `latest`. The
workflow rejects a Git tag that does not exactly match the version in `package.json`.

The **Run workflow** button remains useful for maintainers diagnosing CI, but it is not the normal
release path and it does not replace the repository's Git tag/history checks.

`dsh plugin --profile web add dsh-dafeiyu` (without `@alpha`) installs whatever npm's `latest`
dist-tag points to. npm trusted publishing provides short-lived OIDC credentials only for package
publishing; npm does not support using that OIDC exchange for `npm dist-tag`. If the package owner
intentionally wants an alpha to become the default install, promote it separately from an
authenticated owner session:

```bash
npm dist-tag add dsh-dafeiyu@0.1.0-alpha.15 latest
```

Do not place a long-lived npm token in WSL merely to perform this promotion.

## Failure and retry behavior

- A test or Helper build failure (Windows, Linux x64, or macOS) stops the release before npm publishing.
- If npm already contains an identical archive, a retry skips npm and repairs or creates the GitHub
  Release.
- If npm contains the same version with different archive contents, the workflow stops. Increase the
  version instead of overwriting a published package.
- Publishing from a fork fails because npm trusts only this repository and workflow.
