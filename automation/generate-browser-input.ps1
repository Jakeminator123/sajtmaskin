[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [int]$Iteration,
    [string]$TemplatePath = "automation/templates/browser-input.md",
    [string]$OutputDir = "automation/runtime",
    [string]$SourceReportPath = "",
    [string]$PurposePath = "purpose.md",
    [string]$RoadmapPath = "roadmap.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-IterationReportPath {
    param(
        [string]$RepoRoot,
        [int]$IterationNumber
    )

    $inboxDir = Join-Path $RepoRoot "automation/inbox"
    if ($IterationNumber -eq 1) {
        return Join-Path $inboxDir "deep-research-report.md"
    }

    return Join-Path $inboxDir ("deep-research-report ({0}).md" -f $IterationNumber)
}

function Resolve-AbsolutePath {
    param(
        [string]$RepoRoot,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }

    if ([System.IO.Path]::IsPathRooted($Value)) {
        return $Value
    }

    return Join-Path $RepoRoot $Value
}

$repoRoot = Get-RepoRoot
$templateAbs = Resolve-AbsolutePath -RepoRoot $repoRoot -Value $TemplatePath
$outputDirAbs = Resolve-AbsolutePath -RepoRoot $repoRoot -Value $OutputDir
$purposeAbs = Resolve-AbsolutePath -RepoRoot $repoRoot -Value $PurposePath
$roadmapAbs = Resolve-AbsolutePath -RepoRoot $repoRoot -Value $RoadmapPath

if (-not (Test-Path -LiteralPath $templateAbs)) {
    throw "Template file not found: $templateAbs"
}

if ([string]::IsNullOrWhiteSpace($SourceReportPath)) {
    $SourceReportPath = Get-IterationReportPath -RepoRoot $repoRoot -IterationNumber $Iteration
}

$reportAbs = Resolve-AbsolutePath -RepoRoot $repoRoot -Value $SourceReportPath
if (-not (Test-Path -LiteralPath $reportAbs)) {
    throw "Source report not found: $reportAbs"
}

$template = Get-Content -LiteralPath $templateAbs -Raw -Encoding UTF8
$reportRelative = Resolve-Path -LiteralPath $reportAbs -Relative
$purposeRelative = if (Test-Path -LiteralPath $purposeAbs) { Resolve-Path -LiteralPath $purposeAbs -Relative } else { $PurposePath }
$roadmapRelative = if (Test-Path -LiteralPath $roadmapAbs) { Resolve-Path -LiteralPath $roadmapAbs -Relative } else { $RoadmapPath }

$rendered = $template
$rendered = $rendered.Replace("{{ITERATION}}", [string]$Iteration)
$rendered = $rendered.Replace("{{SOURCE_REPORT}}", $reportRelative)
$rendered = $rendered.Replace("{{PURPOSE_FILE}}", $purposeRelative)
$rendered = $rendered.Replace("{{ROADMAP_FILE}}", $roadmapRelative)

if (-not (Test-Path -LiteralPath $outputDirAbs)) {
    New-Item -ItemType Directory -Path $outputDirAbs -Force | Out-Null
}

$outputPath = Join-Path $outputDirAbs ("browser-input-{0}.md" -f $Iteration.ToString("00"))
Set-Content -LiteralPath $outputPath -Value $rendered -Encoding UTF8

Write-Host ("Generated browser input: {0}" -f $outputPath)
