# Publishing releases

The repository publishes the Windows package through GitHub Actions and npm trusted publishing.
Linux x64 Helper binaries can be built locally with `npm run build:helper:linux` and included via
`runtime/bin/`. The Windows Helper is built and visually smoke-tested on a GitHub-hosted Windows runner. The exact
resulting `.tgz` archive is then published from a GitHub-hosted Linux runner using short-lived OIDC
credentials. No npm password or long-lived publish token is stored in GitHub, Windows, or WSL.

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
4. Commit and push the changes to `main`.

## Publish from the GitHub interface

1. Open **Actions → Publish package**.
2. Select **Run workflow** and choose `main`.
3. Use `alpha` for prereleases such as `0.1.0-alpha.12`; use `latest` only for stable versions.
4. Start the workflow.

The workflow builds and tests the Windows Helper, publishes the npm package, moves the selected npm
distribution tag, creates a matching `v<version>` Git tag, and attaches the verified `.tgz` archive
to a GitHub Release.

## Publish by pushing a version tag

After the version commit is on `main`, the same workflow can be triggered from Windows or WSL:

```bash
git tag v0.1.0-alpha.12
git push origin v0.1.0-alpha.12
```

Prerelease versions automatically use the npm `alpha` tag. Stable versions use `latest`. The
workflow rejects a Git tag that does not exactly match the version in `package.json`.

## Failure and retry behavior

- A test or Windows build failure stops the release before npm publishing.
- If npm already contains an identical archive, a retry skips npm and repairs or creates the GitHub
  Release.
- If npm contains the same version with different archive contents, the workflow stops. Increase the
  version instead of overwriting a published package.
- Publishing from a fork fails because npm trusts only this repository and workflow.
