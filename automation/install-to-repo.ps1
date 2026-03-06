[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$TargetRepoPath,
    [switch]$Force,
    [switch]$InstallPlaywright
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AbsolutePath {
    param([string]$PathValue)
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $PathValue))
}

function Ensure-Directory {
    param([string]$DirectoryPath)
    if (-not (Test-Path -LiteralPath $DirectoryPath)) {
        New-Item -ItemType Directory -Path $DirectoryPath -Force | Out-Null
    }
}

function Copy-FileTree {
    param(
        [string]$SourceDir,
        [string]$TargetDir,
        [bool]$AllowOverwrite
    )

    if (-not (Test-Path -LiteralPath $SourceDir)) {
        throw "Source folder missing: $SourceDir"
    }

    Ensure-Directory -DirectoryPath $TargetDir

    $sourceRootNormalized = [System.IO.Path]::GetFullPath($SourceDir).TrimEnd('\', '/')
    $sourceFiles = Get-ChildItem -LiteralPath $SourceDir -Recurse -File
    foreach ($file in $sourceFiles) {
        $relativePath = $file.FullName.Substring($sourceRootNormalized.Length).TrimStart('\', '/')
        $targetFilePath = Join-Path $TargetDir $relativePath
        $targetParent = Split-Path -Parent $targetFilePath
        Ensure-Directory -DirectoryPath $targetParent

        if ((Test-Path -LiteralPath $targetFilePath) -and -not $AllowOverwrite) {
            throw "Target file exists (use -Force to overwrite): $targetFilePath"
        }

        Copy-Item -LiteralPath $file.FullName -Destination $targetFilePath -Force
    }
}

function Copy-OneFile {
    param(
        [string]$SourceFile,
        [string]$TargetFile,
        [bool]$AllowOverwrite
    )

    if (-not (Test-Path -LiteralPath $SourceFile)) {
        throw "Source file missing: $SourceFile"
    }

    $targetParent = Split-Path -Parent $TargetFile
    Ensure-Directory -DirectoryPath $targetParent

    if ((Test-Path -LiteralPath $TargetFile) -and -not $AllowOverwrite) {
        throw "Target file exists (use -Force to overwrite): $TargetFile"
    }

    Copy-Item -LiteralPath $SourceFile -Destination $TargetFile -Force
}

function Set-OrAddConfigKey {
    param(
        [string]$Content,
        [string]$Key,
        [string]$Value
    )

    $escapedKey = [Regex]::Escape($Key)
    $pattern = "(?m)^$escapedKey=.*$"
    if ($Content -match $pattern) {
        return ([Regex]::Replace($Content, $pattern, "$Key=$Value"))
    }

    if (-not [string]::IsNullOrWhiteSpace($Content) -and -not $Content.EndsWith("`n")) {
        $Content += "`r`n"
    }

    return $Content + "$Key=$Value`r`n"
}

$toolkitRoot = Resolve-AbsolutePath -PathValue (Join-Path $PSScriptRoot "..")
$targetRoot = Resolve-AbsolutePath -PathValue $TargetRepoPath
$targetRepoName = Split-Path -Leaf $targetRoot

if (-not (Test-Path -LiteralPath $targetRoot)) {
    throw "Target repo path not found: $targetRoot"
}

if (-not (Test-Path -LiteralPath (Join-Path $targetRoot ".git"))) {
    throw "Target path does not look like a git repo (.git missing): $targetRoot"
}

$copyPlan = @(
    @{
        Type = "Directory"
        Source = Join-Path $toolkitRoot "automation"
        Target = Join-Path $targetRoot "automation"
    },
    @{
        Type = "Directory"
        Source = Join-Path $toolkitRoot ".cursor\agents"
        Target = Join-Path $targetRoot ".cursor\agents"
    },
    @{
        Type = "Directory"
        Source = Join-Path $toolkitRoot ".cursor\rules"
        Target = Join-Path $targetRoot ".cursor\rules"
    },
    @{
        Type = "File"
        Source = Join-Path $toolkitRoot "config.txt"
        Target = Join-Path $targetRoot "config.txt"
    },
    @{
        Type = "File"
        Source = Join-Path $toolkitRoot "config.example.txt"
        Target = Join-Path $targetRoot "config.example.txt"
    },
    @{
        Type = "File"
        Source = Join-Path $toolkitRoot "config.browser.txt"
        Target = Join-Path $targetRoot "config.browser.txt"
    },
    @{
        Type = "File"
        Source = Join-Path $toolkitRoot "INSTALLERA.py"
        Target = Join-Path $targetRoot "INSTALLERA.py"
    },
    @{
        Type = "File"
        Source = Join-Path $toolkitRoot "INSTALERA.py"
        Target = Join-Path $targetRoot "INSTALERA.py"
    }
)

foreach ($item in $copyPlan) {
    if ($item.Type -eq "Directory") {
        if ($PSCmdlet.ShouldProcess($item.Target, "Copy directory from $($item.Source)")) {
            Copy-FileTree -SourceDir $item.Source -TargetDir $item.Target -AllowOverwrite:$Force.IsPresent
        }
        continue
    }

    if ($PSCmdlet.ShouldProcess($item.Target, "Copy file from $($item.Source)")) {
        Copy-OneFile -SourceFile $item.Source -TargetFile $item.Target -AllowOverwrite:$Force.IsPresent
    }
}

# Make config.browser target repo-aware.
$targetBrowserConfigPath = Join-Path $targetRoot "config.browser.txt"
if (Test-Path -LiteralPath $targetBrowserConfigPath) {
    $content = Get-Content -LiteralPath $targetBrowserConfigPath -Raw -Encoding UTF8
    $content = Set-OrAddConfigKey -Content $content -Key "REPOSITORY_QUERY" -Value $targetRepoName
    $content = Set-OrAddConfigKey -Content $content -Key "REPOSITORY_REPO_NAME" -Value $targetRepoName
    $content = Set-OrAddConfigKey -Content $content -Key "ALLOW_ANY_REPOSITORY_OWNER" -Value "true"
    Set-Content -LiteralPath $targetBrowserConfigPath -Value $content -Encoding UTF8
}

if ($InstallPlaywright.IsPresent) {
    if ($PSCmdlet.ShouldProcess($targetRoot, "Install playwright dependency in target repo")) {
        Push-Location $targetRoot
        try {
            & npm install --save-dev playwright
            if ($LASTEXITCODE -ne 0) {
                throw "npm install --save-dev playwright failed."
            }
        }
        finally {
            Pop-Location
        }
    }
}

Write-Host ""
if ($WhatIfPreference) {
    Write-Host "Dry-run completed for target: $targetRoot"
}
else {
    Write-Host "Installed automation kit to: $targetRoot"
}
Write-Host "Repository name detected: $targetRepoName"
Write-Host ""
Write-Host "Next steps in target repo:"
Write-Host "1) cd `"$targetRoot`""
Write-Host "2) python .\INSTALLERA.py"
Write-Host "   (In dashboard: set target repo path, enable full pipeline if you want browser + agent build automatically.)"
if (-not $InstallPlaywright.IsPresent) {
    Write-Host "3) (Optional, only for playwright runtime) npm install --save-dev playwright"
    Write-Host "4) python .\automation\kit_dashboard.py"
    Write-Host "5) powershell -NoProfile -File .\automation\run-browser-automation.ps1 -Iteration 1 -RepoPath `".`" -RepoName `"$targetRepoName`" -Runtime `"cursor-manual`""
}
else {
    Write-Host "3) python .\automation\kit_dashboard.py"
    Write-Host "4) powershell -NoProfile -File .\automation\run-browser-automation.ps1 -Iteration 1 -RepoPath `".`" -RepoName `"$targetRepoName`""
}
