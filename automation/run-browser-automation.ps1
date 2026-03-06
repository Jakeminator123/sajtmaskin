[CmdletBinding()]
param(
    [int]$Iteration = 1,
    [string]$RootPath = ".",
    [string]$ConfigPath = "config.browser.txt",
    [string]$RepoPath = ".",
    [string]$RepoName = "",
    [string]$PromptFile = "",
    [ValidateSet("playwright", "cursor-manual")]
    [string]$Runtime = "playwright"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-NodeAvailable {
    $nodeVersion = & node -v 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeVersion)) {
        throw "Node.js is required to run browser automation."
    }
}

function Assert-PlaywrightAvailable {
    & node -e "require.resolve('playwright')" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Missing npm package 'playwright'. Install it with: npm install --save-dev playwright"
    }
}

Assert-NodeAvailable
if ($Runtime -eq "playwright") {
    Assert-PlaywrightAvailable
}

$scriptPath = Join-Path $PSScriptRoot "run-browser-automation.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Browser automation script not found: $scriptPath"
}

$args = @(
    $scriptPath
    "--root", $RootPath
    "--iteration", $Iteration
    "--config", $ConfigPath
    "--repo-path", $RepoPath
    "--runtime", $Runtime
)

if (-not [string]::IsNullOrWhiteSpace($RepoName)) {
    $args += @("--repo-name", $RepoName)
}

if (-not [string]::IsNullOrWhiteSpace($PromptFile)) {
    $args += @("--prompt-file", $PromptFile)
}

& node @args
if ($LASTEXITCODE -ne 0) {
    throw "Browser automation failed."
}
