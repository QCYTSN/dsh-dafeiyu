[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$Remote = "origin"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path (Join-Path $scriptDirectory "..")).Path

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $script:GitExecutable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Get-GitText {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $result = & $script:GitExecutable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }

    return ($result -join "`n").Trim()
}

Push-Location $repositoryRoot
try {
    $script:GitExecutable = (Get-Command git -ErrorAction Stop).Source
    Write-Host "Using Windows Git: $script:GitExecutable"

    $branch = Get-GitText -Arguments @("symbolic-ref", "--short", "HEAD")
    if ($branch -ne "main") {
        throw "Releases must be pushed from main; current branch is '$branch'."
    }

    $worktree = Get-GitText -Arguments @("status", "--porcelain")
    if ($worktree) {
        throw "The worktree is not clean. Commit or stash all changes before publishing."
    }

    $package = Get-Content (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json
    $version = [string]$package.version
    if (-not $version) {
        throw "package.json does not contain a version."
    }

    $releaseTag = "v$version"
    $headCommit = Get-GitText -Arguments @("rev-parse", "HEAD")

    Write-Host "Fetching $Remote/main and release tags..."
    Invoke-Git -Arguments @(
        "fetch",
        $Remote,
        "refs/heads/main:refs/remotes/${Remote}/main",
        "--tags"
    )

    & $script:GitExecutable merge-base --is-ancestor "$Remote/main" "HEAD"
    if ($LASTEXITCODE -ne 0) {
        throw "Local main is behind or has diverged from $Remote/main. Synchronize it before publishing."
    }

    & $script:GitExecutable show-ref --verify --quiet "refs/tags/$releaseTag"
    $tagExists = $LASTEXITCODE -eq 0

    if ($tagExists) {
        $tagCommit = Get-GitText -Arguments @("rev-list", "-n", "1", $releaseTag)
        if ($tagCommit -ne $headCommit) {
            throw "Tag $releaseTag already points to another commit. Bump the package version; never move a release tag."
        }
    }
    elseif ($DryRun) {
        Write-Host "Dry run: would create annotated tag $releaseTag at $headCommit."
    }
    else {
        Invoke-Git -Arguments @("tag", "-a", $releaseTag, "-m", "Release $version")
        Write-Host "Created annotated tag $releaseTag."
    }

    if ($DryRun -and -not $tagExists) {
        Invoke-Git -Arguments @("push", "--dry-run", $Remote, "HEAD:refs/heads/main")
        Write-Host "Dry-run validation passed. A real run will atomically push main and $releaseTag."
    }
    else {
        $pushArguments = @("push", "--atomic")
        if ($DryRun) {
            $pushArguments += "--dry-run"
        }
        $pushArguments += @(
            $Remote,
            "HEAD:refs/heads/main",
            "refs/tags/${releaseTag}:refs/tags/${releaseTag}"
        )
        Invoke-Git -Arguments $pushArguments

        if ($DryRun) {
            Write-Host "Dry-run validation passed for main and $releaseTag."
        }
        else {
            Write-Host "Pushed main and $releaseTag atomically. GitHub Actions will build and publish npm."
        }
    }

    Write-Host "Actions: https://github.com/QCYTSN/dsh-dafeiyu/actions/workflows/publish.yml"
}
finally {
    Pop-Location
}
