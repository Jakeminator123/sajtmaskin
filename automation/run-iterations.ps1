[CmdletBinding()]
param(
    [string]$EnvPath = "config.txt",
    [string]$ConfigPath,
    [string]$DeepResearchPath,
    [string]$WatchDirectory,
    [string]$DeepResearchPattern,
    [string]$PurposePath,
    [string]$RoadmapPath,
    [Alias("Iterations")][int]$MaxIterations,
    [switch]$Watch,
    [switch]$SkipQualityGates,
    [switch]$SkipRelease,
    [switch]$AllowDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:WorkspaceRoot = Split-Path -Parent $PSScriptRoot

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "s"
    Write-Host "[$timestamp] [$Level] $Message"
}

function Resolve-WorkspacePath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $script:WorkspaceRoot $Path))
}

function Get-RelativeWorkspacePath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    $root = [System.IO.Path]::GetFullPath($script:WorkspaceRoot)
    $target = [System.IO.Path]::GetFullPath($Path)

    if ($target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $target.Substring($root.Length).TrimStart("\", "/")
        if ([string]::IsNullOrWhiteSpace($relative)) {
            return "."
        }

        return $relative.Replace("/", "\")
    }

    return $target
}

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Test-CommandAvailable {
    param([string]$CommandName)

    return $null -ne (Get-Command -Name $CommandName -ErrorAction SilentlyContinue)
}

function Read-JsonFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "JSON file not found: $Path"
    }

    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Read-DotEnvFile {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    $lines = Get-Content -LiteralPath $Path
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            continue
        }

        if ($trimmed.StartsWith("#")) {
            continue
        }

        $equalsIndex = $trimmed.IndexOf("=")
        if ($equalsIndex -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $equalsIndex).Trim()
        $value = $trimmed.Substring($equalsIndex + 1).Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $values[$key] = $value
    }

    return $values
}

function Get-DotEnvValue {
    param(
        [hashtable]$Values,
        [string]$Key,
        [string]$Default = ""
    )

    if ($Values.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace([string]$Values[$Key])) {
        return [string]$Values[$Key]
    }

    return $Default
}

function Get-DotEnvBool {
    param(
        [hashtable]$Values,
        [string]$Key,
        [bool]$Default
    )

    if (-not $Values.ContainsKey($Key)) {
        return $Default
    }

    $raw = ([string]$Values[$Key]).Trim().ToLowerInvariant()
    switch ($raw) {
        "1" { return $true }
        "true" { return $true }
        "yes" { return $true }
        "on" { return $true }
        "0" { return $false }
        "false" { return $false }
        "no" { return $false }
        "off" { return $false }
        default { return $Default }
    }
}

function Get-DotEnvInt {
    param(
        [hashtable]$Values,
        [string]$Key,
        [int]$Default
    )

    if (-not $Values.ContainsKey($Key)) {
        return $Default
    }

    $parsed = 0
    if ([int]::TryParse([string]$Values[$Key], [ref]$parsed)) {
        return $parsed
    }

    return $Default
}

function New-ConfigFromDotEnv {
    param([hashtable]$EnvValues)

    return [pscustomobject][ordered]@{
        automationEnabled = Get-DotEnvBool -Values $EnvValues -Key "AUTOMATION_ENABLED" -Default $true
        maxIterations = Get-DotEnvInt -Values $EnvValues -Key "MAX_ITERATIONS" -Default 3
        packetCount = [pscustomobject][ordered]@{
            min = Get-DotEnvInt -Values $EnvValues -Key "PACKET_MIN" -Default 2
            max = Get-DotEnvInt -Values $EnvValues -Key "PACKET_MAX" -Default 10
            target = Get-DotEnvInt -Values $EnvValues -Key "PACKET_TARGET" -Default 5
        }
        packetRetryLimit = Get-DotEnvInt -Values $EnvValues -Key "PACKET_RETRY_LIMIT" -Default 1
        paths = [pscustomobject][ordered]@{
            watchDirectory = Get-DotEnvValue -Values $EnvValues -Key "INBOX_DIR" -Default "automation/inbox"
            deepResearchPattern = Get-DotEnvValue -Values $EnvValues -Key "DEEP_RESEARCH_PATTERN" -Default "deep-research-report*.md"
            purpose = Get-DotEnvValue -Values $EnvValues -Key "PURPOSE_PATH" -Default "purpose.md"
            roadmap = Get-DotEnvValue -Values $EnvValues -Key "ROADMAP_PATH" -Default "roadmap.md"
            templates = "automation/templates"
            packets = "automation/packets"
            reports = "automation/reports"
            state = "automation/state/run-state.json"
            finalSummary = "automation/reports/final-summary.md"
            finalSummaryJson = "automation/reports/final-summary.json"
        }
        watch = [pscustomobject][ordered]@{
            enabled = Get-DotEnvBool -Values $EnvValues -Key "WATCH_ENABLED" -Default $true
            pollSeconds = Get-DotEnvInt -Values $EnvValues -Key "WATCH_POLL_SECONDS" -Default 5
            fileSettleSeconds = Get-DotEnvInt -Values $EnvValues -Key "FILE_SETTLE_SECONDS" -Default 2
            processAllPending = Get-DotEnvBool -Values $EnvValues -Key "PROCESS_ALL_PENDING" -Default $true
        }
        cursor = [pscustomobject][ordered]@{
            command = Get-DotEnvValue -Values $EnvValues -Key "CURSOR_COMMAND" -Default "agent"
            planFlags = @("-p", "--force", "--mode", "plan", "--output-format", "text")
            agentFlags = @("-p", "--force", "--mode", "agent", "--output-format", "text")
        }
        qualityGates = [pscustomobject][ordered]@{
            lint = [pscustomobject][ordered]@{
                enabled = Get-DotEnvBool -Values $EnvValues -Key "LINT_ENABLED" -Default $true
                command = Get-DotEnvValue -Values $EnvValues -Key "LINT_COMMAND" -Default ""
            }
            build = [pscustomobject][ordered]@{
                enabled = Get-DotEnvBool -Values $EnvValues -Key "BUILD_ENABLED" -Default $true
                command = Get-DotEnvValue -Values $EnvValues -Key "BUILD_COMMAND" -Default ""
            }
            test = [pscustomobject][ordered]@{
                enabled = Get-DotEnvBool -Values $EnvValues -Key "TEST_ENABLED" -Default $false
                command = Get-DotEnvValue -Values $EnvValues -Key "TEST_COMMAND" -Default ""
            }
            simpleFixPasses = Get-DotEnvInt -Values $EnvValues -Key "SIMPLE_FIX_PASSES" -Default 1
            stopOnFailure = Get-DotEnvBool -Values $EnvValues -Key "STOP_ON_FAILURE" -Default $true
        }
        git = [pscustomobject][ordered]@{
            commitMessageTemplate = Get-DotEnvValue -Values $EnvValues -Key "GIT_COMMIT_MESSAGE_TEMPLATE" -Default "Run automated website improvement iteration {iteration}"
            numberedBranchStart = Get-DotEnvInt -Values $EnvValues -Key "GIT_NUMBERED_BRANCH_START" -Default 1
            pushRemote = Get-DotEnvValue -Values $EnvValues -Key "GIT_PUSH_REMOTE" -Default "origin"
        }
        release = [pscustomobject][ordered]@{
            publishAfterBatch = Get-DotEnvBool -Values $EnvValues -Key "PUBLISH_AFTER_BATCH" -Default $true
        }
    }
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Data
    )

    $directory = Split-Path -Parent $Path
    if ($directory) {
        Ensure-Directory -Path $directory
    }

    $json = $Data | ConvertTo-Json -Depth 100
    Set-Content -LiteralPath $Path -Value $json -Encoding utf8
}

function Add-StateEvent {
    param(
        [hashtable]$State,
        [string]$Type,
        [string]$Message,
        [hashtable]$Details = @{}
    )

    $State.updatedAt = (Get-Date).ToString("o")
    $State.events += [ordered]@{
        timestamp = (Get-Date).ToString("o")
        type = $Type
        message = $Message
        details = $Details
    }
}

function Save-State {
    param(
        [hashtable]$State,
        [string]$StatePath
    )

    $State.updatedAt = (Get-Date).ToString("o")
    Write-JsonFile -Path $StatePath -Data $State
}

function Expand-Template {
    param(
        [string]$TemplatePath,
        [hashtable]$Replacements
    )

    $content = Get-Content -LiteralPath $TemplatePath -Raw
    foreach ($key in $Replacements.Keys) {
        $token = "{{{0}}}" -f $key
        $content = $content.Replace($token, [string]$Replacements[$key])
    }

    return $content
}

function Assert-FileExists {
    param(
        [string]$Path,
        [string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Description not found: $Path"
    }
}

function Get-ExistingOptionalPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    $resolved = Resolve-WorkspacePath -Path $Path
    if (Test-Path -LiteralPath $resolved) {
        return $resolved
    }

    return $null
}

function Get-IterationNumberFromReportName {
    param([string]$FileName)

    if ([string]::IsNullOrWhiteSpace($FileName)) {
        return $null
    }

    if ($FileName -match "\((\d+)\)") {
        return [int]$Matches[1]
    }

    if ($FileName -match "(\d+)") {
        return [int]$Matches[1]
    }

    return $null
}

function Get-PendingDeepResearchFiles {
    param(
        [string]$Directory,
        [string]$Pattern,
        [string[]]$ProcessedInputs = @()
    )

    Assert-FileExists -Path $Directory -Description "Watch directory"

    $processed = @{}
    foreach ($item in $ProcessedInputs) {
        $processed[[string]$item] = $true
    }

    $files = Get-ChildItem -LiteralPath $Directory -Filter $Pattern -File | Sort-Object LastWriteTime, Name
    $pending = @()

    foreach ($file in $files) {
        $fullPath = [System.IO.Path]::GetFullPath($file.FullName)
        $relativePath = Get-RelativeWorkspacePath -Path $fullPath

        if ($processed.ContainsKey($relativePath)) {
            continue
        }

        $pending += [ordered]@{
            name = [string]$file.Name
            fullPath = $fullPath
            relativePath = $relativePath
            requestedIteration = Get-IterationNumberFromReportName -FileName $file.Name
            lastWriteTimeUtc = $file.LastWriteTimeUtc.ToString("o")
        }
    }

    return $pending | Sort-Object `
        @{ Expression = { if ($_.requestedIteration) { [int]$_.requestedIteration } else { [int]::MaxValue } } }, `
        @{ Expression = { $_.name } }
}

function Wait-ForFileToSettle {
    param(
        [string]$Path,
        [int]$SettleSeconds
    )

    if ($SettleSeconds -le 0) {
        return
    }

    while ($true) {
        $item = Get-Item -LiteralPath $Path
        $age = (Get-Date) - $item.LastWriteTime
        if ($age.TotalSeconds -ge $SettleSeconds) {
            return
        }

        Start-Sleep -Seconds 1
    }
}

function Initialize-SteeringLog {
    param(
        [string]$TemplatePath,
        [string]$TargetPath,
        [int]$Iteration,
        [string]$SourceReportName,
        [string]$SourceReportPath
    )

    $content = Expand-Template -TemplatePath $TemplatePath -Replacements @{
        ITERATION = $Iteration
        SOURCE_REPORT_NAME = $SourceReportName
        SOURCE_REPORT_PATH = $SourceReportPath
    }

    Set-Content -LiteralPath $TargetPath -Value $content -Encoding utf8
}

function Resolve-IterationNumber {
    param(
        [hashtable]$State,
        [int]$RequestedIteration
    )

    $used = @()
    foreach ($iteration in $State.iterations) {
        $used += [int]$iteration.number
    }

    if ($RequestedIteration -gt 0 -and -not ($used -contains $RequestedIteration)) {
        return $RequestedIteration
    }

    $candidate = 1
    while ($used -contains $candidate) {
        $candidate++
    }

    return $candidate
}

function Can-ProcessAnotherIteration {
    param([hashtable]$State)

    return [int]$State.iterationsCompleted -lt [int]$State.iterationsPlanned
}

function Get-IterationLabel {
    param([int]$Iteration)

    return ("iteration-{0:d2}" -f $Iteration)
}

function Get-CursorArgs {
    param(
        [pscustomobject]$Config,
        [ValidateSet("plan", "agent")][string]$Mode,
        [string]$Prompt
    )

    $flagSource = if ($Mode -eq "plan") {
        $Config.cursor.planFlags
    }
    else {
        $Config.cursor.agentFlags
    }

    $args = @()
    foreach ($flag in $flagSource) {
        $args += [string]$flag
    }

    $args += $Prompt
    return $args
}

function Invoke-CursorAgent {
    param(
        [pscustomobject]$Config,
        [ValidateSet("plan", "agent")][string]$Mode,
        [string]$Prompt,
        [string]$TranscriptPath
    )

    $commandName = [string]$Config.cursor.command
    if (-not (Test-CommandAvailable -CommandName $commandName)) {
        throw "Cursor CLI command '$commandName' is not available on PATH."
    }

    $args = Get-CursorArgs -Config $Config -Mode $Mode -Prompt $Prompt
    Write-Log "Running Cursor CLI in $Mode mode."

    Push-Location $script:WorkspaceRoot
    try {
        $output = & $commandName @args 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    $outputText = ($output | Out-String).Trim()
    if ($TranscriptPath) {
        Set-Content -LiteralPath $TranscriptPath -Value $outputText -Encoding utf8
    }

    if ($exitCode -ne 0) {
        throw "Cursor CLI failed with exit code $exitCode. Transcript: $TranscriptPath"
    }

    return $outputText
}

function Test-GitRepository {
    if (-not (Test-CommandAvailable -CommandName "git")) {
        return $false
    }

    Push-Location $script:WorkspaceRoot
    try {
        & git rev-parse --is-inside-work-tree 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    }
    finally {
        Pop-Location
    }
}

function Assert-CleanWorkingTree {
    param([switch]$AllowDirty)

    if ($AllowDirty) {
        return
    }

    if (-not (Test-GitRepository)) {
        return
    }

    Push-Location $script:WorkspaceRoot
    try {
        $status = & git status --porcelain
    }
    finally {
        Pop-Location
    }

    if ($status) {
        throw "Git working tree is not clean. Re-run with -AllowDirty if you want to include existing changes."
    }
}

function New-RunState {
    param(
        [pscustomobject]$Config,
        [int]$IterationCount,
        [string]$WatchDirectory,
        [string]$DeepResearchPattern,
        [string]$DeepResearch,
        [string]$Purpose,
        [string]$Roadmap,
        [string]$FinalSummaryPath
    )

    return [ordered]@{
        runId = [guid]::NewGuid().Guid
        automationEnabled = $true
        status = "running"
        startedAt = (Get-Date).ToString("o")
        updatedAt = (Get-Date).ToString("o")
        iterationsPlanned = $IterationCount
        iterationsCompleted = 0
        currentIteration = 0
        watch = [ordered]@{
            directory = Get-RelativeWorkspacePath -Path $WatchDirectory
            pattern = $DeepResearchPattern
            processedInputs = @()
        }
        inputs = [ordered]@{
            deepResearchPath = if ($DeepResearch) { Get-RelativeWorkspacePath -Path $DeepResearch } else { $null }
            purposePath = Get-RelativeWorkspacePath -Path $Purpose
            roadmapPath = if ($Roadmap) { Get-RelativeWorkspacePath -Path $Roadmap } else { $null }
        }
        backlog = [ordered]@{
            latestBacklogPath = $null
            latestBacklogJsonPath = $null
        }
        iterations = @()
        release = [ordered]@{
            status = "pending"
            branchName = $null
            commitHash = $null
            remote = [string]$Config.git.pushRemote
            summaryPath = Get-RelativeWorkspacePath -Path $FinalSummaryPath
        }
        events = @()
    }
}

function New-IterationFolders {
    param(
        [pscustomobject]$Config,
        [int]$Iteration
    )

    $label = Get-IterationLabel -Iteration $Iteration
    $packetDir = Resolve-WorkspacePath -Path (Join-Path $Config.paths.packets $label)
    $reportDir = Resolve-WorkspacePath -Path (Join-Path $Config.paths.reports $label)
    $qualityDir = Join-Path $reportDir "quality"

    Ensure-Directory -Path $packetDir
    Ensure-Directory -Path $reportDir
    Ensure-Directory -Path $qualityDir

    return [ordered]@{
        label = $label
        packetDir = $packetDir
        reportDir = $reportDir
        qualityDir = $qualityDir
        steeringLogPath = Join-Path $reportDir "steering-log.md"
        packetIndexPath = Join-Path $packetDir "packet-index.json"
        backlogPath = Join-Path $reportDir "backlog.md"
        backlogJsonPath = Join-Path $reportDir "backlog.json"
        plannerTranscriptPath = Join-Path $reportDir "planner-output.txt"
    }
}

function New-IterationStateEntry {
    param(
        [int]$Iteration,
        [pscustomobject]$PacketIndex,
        [string]$PacketIndexPath,
        [string]$PlannerTranscriptPath,
        [string]$SteeringLogPath,
        [string]$SourceReportPath,
        [string]$SourceReportName
    )

    $packets = @()
    foreach ($packet in $PacketIndex.packets) {
        $packets += [ordered]@{
            id = [string]$packet.id
            title = [string]$packet.title
            path = [string]$packet.path
            reportPath = [string]$packet.reportPath
            verificationPath = [string]$packet.verificationPath
            status = "pending"
            attempts = 0
            validationPassed = $false
            summary = $null
            issues = @()
        }
    }

    return [ordered]@{
        number = $Iteration
        label = Get-IterationLabel -Iteration $Iteration
        status = "planned"
        sourceReportPath = Get-RelativeWorkspacePath -Path $SourceReportPath
        sourceReportName = $SourceReportName
        plannerTranscriptPath = Get-RelativeWorkspacePath -Path $PlannerTranscriptPath
        steeringLogPath = Get-RelativeWorkspacePath -Path $SteeringLogPath
        packetIndexPath = Get-RelativeWorkspacePath -Path $PacketIndexPath
        backlogPath = [string]$PacketIndex.backlogPath
        backlogJsonPath = [string]$PacketIndex.backlogJsonPath
        packetCount = [int]$PacketIndex.packetCount
        packets = $packets
        qualityGates = @()
    }
}

function Get-PacketState {
    param(
        [hashtable]$IterationState,
        [string]$PacketId
    )

    foreach ($packet in $IterationState.packets) {
        if ($packet.id -eq $PacketId) {
            return $packet
        }
    }

    throw "Packet state not found for id '$PacketId'."
}

function Assert-PacketIndex {
    param(
        [pscustomobject]$Config,
        [pscustomobject]$PacketIndex,
        [string]$PacketIndexPath
    )

    if (-not $PacketIndex.packets) {
        throw "Packet index did not contain any packets: $PacketIndexPath"
    }

    $count = [int]$PacketIndex.packetCount
    $min = [int]$Config.packetCount.min
    $max = [int]$Config.packetCount.max

    if ($count -lt $min -or $count -gt $max) {
        throw "Packet count $count is outside the allowed range $min-$max."
    }

    if ($PacketIndex.packets.Count -ne $count) {
        throw "Packet index packetCount does not match the packet array length."
    }
}

function Invoke-ConfiguredCommand {
    param(
        [string]$Command,
        [string]$LogPath
    )

    $exitCode = 0
    $combinedOutput = ""

    Push-Location $script:WorkspaceRoot
    try {
        $global:LASTEXITCODE = 0
        $scriptBlock = [scriptblock]::Create($Command)
        try {
            $output = & $scriptBlock 2>&1
            $exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
            $combinedOutput = ($output | Out-String)
        }
        catch {
            $exitCode = 1
            $combinedOutput = ($_.Exception.Message + [Environment]::NewLine + ($_.ScriptStackTrace | Out-String)).Trim()
        }
    }
    finally {
        Pop-Location
    }

    Set-Content -LiteralPath $LogPath -Value $combinedOutput -Encoding utf8

    return [ordered]@{
        exitCode = $exitCode
        output = $combinedOutput
        succeeded = ($exitCode -eq 0)
    }
}

function Invoke-QualityGates {
    param(
        [pscustomobject]$Config,
        [hashtable]$State,
        [hashtable]$IterationState,
        [int]$Iteration,
        [string]$StatePath,
        [string]$QualityDir,
        [switch]$SkipQualityGates
    )

    $gateNames = @("lint", "build", "test")

    foreach ($gateName in $gateNames) {
        $gateConfig = $Config.qualityGates.$gateName
        $gateResult = [ordered]@{
            name = $gateName
            status = "skipped"
            command = [string]$gateConfig.command
            logPath = Get-RelativeWorkspacePath -Path (Join-Path $QualityDir "$gateName.log")
            attempts = 0
            fixedByAgent = $false
        }

        if ($SkipQualityGates) {
            $gateResult.status = "skipped"
            $gateResult.reason = "Skipped by command-line switch."
            $IterationState.qualityGates += $gateResult
            continue
        }

        if (-not [bool]$gateConfig.enabled) {
            $gateResult.reason = "Gate disabled in config."
            $IterationState.qualityGates += $gateResult
            continue
        }

        if ([string]::IsNullOrWhiteSpace([string]$gateConfig.command)) {
            $gateResult.reason = "No command configured."
            $IterationState.qualityGates += $gateResult
            continue
        }

        $logPath = Resolve-WorkspacePath -Path $gateResult.logPath
        $command = [string]$gateConfig.command
        $fixAttempts = [int]$Config.qualityGates.simpleFixPasses

        for ($attempt = 1; $attempt -le ($fixAttempts + 1); $attempt++) {
            $gateResult.attempts = $attempt
            $runResult = Invoke-ConfiguredCommand -Command $command -LogPath $logPath

            if ($runResult.succeeded) {
                $gateResult.status = "passed"
                break
            }

            if ($attempt -le $fixAttempts) {
                $gateResult.fixedByAgent = $true
                $fixTranscript = Join-Path $QualityDir ("{0}-fix-attempt-{1}.txt" -f $gateName, $attempt)
                $fixPrompt = @"
Use the release-manager subagent to fix only straightforward issues causing a failed quality gate.

Context:
- Iteration: $Iteration
- Failed gate: $gateName
- Command: $command
- Failure log: $(Get-RelativeWorkspacePath -Path $logPath)
- Run state: $(Get-RelativeWorkspacePath -Path $StatePath)

Instructions:
1. Read the failure log first.
2. Fix only obvious, low-risk issues directly related to this failure.
3. Avoid broad refactors or unrelated cleanup.
4. Re-run nothing yourself unless necessary for the fix; the parent workflow will run the gate again.
5. Update any relevant reports if your fix changes packet outcomes.
"@

                Invoke-CursorAgent -Config $Config -Mode "agent" -Prompt $fixPrompt -TranscriptPath $fixTranscript | Out-Null
                continue
            }

            $gateResult.status = "failed"
        }

        $IterationState.qualityGates += $gateResult

        if ($gateResult.status -eq "failed" -and [bool]$Config.qualityGates.stopOnFailure) {
            throw "Quality gate '$gateName' failed. See $($gateResult.logPath)."
        }
    }
}

function Run-PlanningIteration {
    param(
        [pscustomobject]$Config,
        [hashtable]$State,
        [int]$Iteration,
        [string]$StatePath,
        [string]$DeepResearch,
        [string]$Purpose,
        [string]$Roadmap,
        [string]$SourceReportName
    )

    $folders = New-IterationFolders -Config $Config -Iteration $Iteration
    $templatePath = Resolve-WorkspacePath -Path (Join-Path $Config.paths.templates "master-brief.md")
    $workItemTemplatePath = Resolve-WorkspacePath -Path (Join-Path $Config.paths.templates "work-item.md")
    $steeringTemplatePath = Resolve-WorkspacePath -Path (Join-Path $Config.paths.templates "steering-log.md")

    Initialize-SteeringLog `
        -TemplatePath $steeringTemplatePath `
        -TargetPath $folders.steeringLogPath `
        -Iteration $Iteration `
        -SourceReportName $SourceReportName `
        -SourceReportPath (Get-RelativeWorkspacePath -Path $DeepResearch)

    $replacements = [ordered]@{
        DEEP_RESEARCH_PATH = Get-RelativeWorkspacePath -Path $DeepResearch
        PURPOSE_PATH = if ($Purpose) { Get-RelativeWorkspacePath -Path $Purpose } else { "No purpose brief was supplied for this run." }
        ROADMAP_PATH = if ($Roadmap) { Get-RelativeWorkspacePath -Path $Roadmap } else { "No roadmap file was supplied for this run." }
        STATE_PATH = Get-RelativeWorkspacePath -Path $StatePath
        WORK_ITEM_TEMPLATE_PATH = Get-RelativeWorkspacePath -Path $workItemTemplatePath
        STEERING_LOG_PATH = Get-RelativeWorkspacePath -Path $folders.steeringLogPath
        SOURCE_REPORT_NAME = $SourceReportName
        ITERATION_NUMBER = $Iteration
        PACKET_TARGET = [int]$Config.packetCount.target
        PACKET_MIN = [int]$Config.packetCount.min
        PACKET_MAX = [int]$Config.packetCount.max
        ITERATION_PACKET_DIR = Get-RelativeWorkspacePath -Path $folders.packetDir
        ITERATION_REPORT_DIR = Get-RelativeWorkspacePath -Path $folders.reportDir
        BACKLOG_PATH = Get-RelativeWorkspacePath -Path $folders.backlogPath
        BACKLOG_JSON_PATH = Get-RelativeWorkspacePath -Path $folders.backlogJsonPath
        PACKET_INDEX_PATH = Get-RelativeWorkspacePath -Path $folders.packetIndexPath
    }

    $prompt = Expand-Template -TemplatePath $templatePath -Replacements $replacements
    Invoke-CursorAgent -Config $Config -Mode "plan" -Prompt $prompt -TranscriptPath $folders.plannerTranscriptPath | Out-Null

    Assert-FileExists -Path $folders.backlogPath -Description "Backlog markdown"
    Assert-FileExists -Path $folders.backlogJsonPath -Description "Backlog JSON"
    Assert-FileExists -Path $folders.packetIndexPath -Description "Packet index JSON"

    $packetIndex = Read-JsonFile -Path $folders.packetIndexPath
    Assert-PacketIndex -Config $Config -PacketIndex $packetIndex -PacketIndexPath $folders.packetIndexPath

    return [ordered]@{
        folders = $folders
        packetIndex = $packetIndex
    }
}

function Invoke-PacketExecution {
    param(
        [pscustomobject]$Config,
        [hashtable]$State,
        [hashtable]$IterationState,
        [int]$Iteration,
        [string]$StatePath,
        [pscustomobject]$Packet,
        [int]$RetryLimit
    )

    $packetState = Get-PacketState -IterationState $IterationState -PacketId ([string]$Packet.id)
    $packetPath = Resolve-WorkspacePath -Path ([string]$Packet.path)
    $reportPath = Resolve-WorkspacePath -Path ([string]$Packet.reportPath)
    $verificationPath = Resolve-WorkspacePath -Path ([string]$Packet.verificationPath)
    $steeringLogPath = Resolve-WorkspacePath -Path ([string]$IterationState.steeringLogPath)

    for ($attempt = 1; $attempt -le ($RetryLimit + 1); $attempt++) {
        $packetState.attempts = $attempt
        $packetState.status = "running"

        $implementerTranscript = Join-Path (Split-Path -Parent $reportPath) ("{0}-attempt-{1}.txt" -f ([string]$Packet.id).ToLowerInvariant(), $attempt)
        $implementerPrompt = @"
Use the implementer subagent to execute exactly one work packet.

Packet file: $(Get-RelativeWorkspacePath -Path $packetPath)
Run state: $(Get-RelativeWorkspacePath -Path $StatePath)
Steering log: $(Get-RelativeWorkspacePath -Path $steeringLogPath)

Requirements:
1. Read the packet file first.
2. Implement only the scope described there.
3. Update or create the implementation report at $(Get-RelativeWorkspacePath -Path $reportPath).
4. Use the required report sections exactly as defined in the packet template.
5. Append a short progress note to the steering log after your work.
6. If the packet is blocked, say so clearly in the report instead of guessing.
7. Leave the repository in a verifier-friendly state.
"@

        Invoke-CursorAgent -Config $Config -Mode "agent" -Prompt $implementerPrompt -TranscriptPath $implementerTranscript | Out-Null
        Assert-FileExists -Path $reportPath -Description "Implementation report"

        $verifierTranscript = Join-Path (Split-Path -Parent $reportPath) ("{0}-verification-attempt-{1}.txt" -f ([string]$Packet.id).ToLowerInvariant(), $attempt)
        $verifierPrompt = @"
Use the verifier subagent to validate one completed packet.

Packet file: $(Get-RelativeWorkspacePath -Path $packetPath)
Implementation report: $(Get-RelativeWorkspacePath -Path $reportPath)
Verification JSON output: $(Get-RelativeWorkspacePath -Path $verificationPath)
Run state: $(Get-RelativeWorkspacePath -Path $StatePath)
Steering log: $(Get-RelativeWorkspacePath -Path $steeringLogPath)

Tasks:
1. Read the packet brief, implementation report, and directly relevant code.
2. Append a Validation section to the report if it does not already contain one, or update the existing Validation section if it is stale.
3. Write a machine-readable verdict to $(Get-RelativeWorkspacePath -Path $verificationPath) with this exact shape:
   {
     ""packetId"": ""P01"",
     ""status"": ""passed"" | ""partial"" | ""blocked"" | ""failed"",
     ""validationPassed"": true,
     ""summary"": ""Short factual summary"",
     ""issues"": [""issue one""],
     ""followUpActions"": [""next step""]
   }
4. Append a short review note to the steering log with pass/fail and next action.
5. Be skeptical and evidence-driven.
"@

        Invoke-CursorAgent -Config $Config -Mode "agent" -Prompt $verifierPrompt -TranscriptPath $verifierTranscript | Out-Null
        Assert-FileExists -Path $verificationPath -Description "Verification JSON"

        $verdict = Read-JsonFile -Path $verificationPath
        $packetState.status = [string]$verdict.status
        $packetState.validationPassed = [bool]$verdict.validationPassed
        $packetState.summary = [string]$verdict.summary
        $packetState.issues = @()

        if ($verdict.issues) {
            foreach ($issue in $verdict.issues) {
                $packetState.issues += [string]$issue
            }
        }

        if ($packetState.validationPassed) {
            return
        }

        if ($attempt -le $RetryLimit) {
            $retryTranscript = Join-Path (Split-Path -Parent $reportPath) ("{0}-retry-guidance-{1}.txt" -f ([string]$Packet.id).ToLowerInvariant(), $attempt)
            $retryPrompt = @"
Use the implementer subagent to address a failed verification for one packet.

Packet file: $(Get-RelativeWorkspacePath -Path $packetPath)
Implementation report: $(Get-RelativeWorkspacePath -Path $reportPath)
Verification JSON: $(Get-RelativeWorkspacePath -Path $verificationPath)
Steering log: $(Get-RelativeWorkspacePath -Path $steeringLogPath)

Focus only on the verifier's reported issues:
$((($packetState.issues | ForEach-Object { "- $_" }) -join [Environment]::NewLine))

Instructions:
1. Fix only the issues raised by verification.
2. Keep the packet scope narrow.
3. Update the same implementation report with what changed.
4. Append a short retry note to the steering log.
"@

            Invoke-CursorAgent -Config $Config -Mode "agent" -Prompt $retryPrompt -TranscriptPath $retryTranscript | Out-Null
            continue
        }

        throw "Packet $($Packet.id) did not pass verification after $($RetryLimit + 1) attempts."
    }
}

function Process-DeepResearchReport {
    param(
        [pscustomobject]$Config,
        [hashtable]$State,
        [string]$StatePath,
        [hashtable]$Report,
        [string]$Purpose,
        [string]$Roadmap,
        [switch]$SkipQualityGates
    )

    $requestedIteration = if ($Report.requestedIteration) { [int]$Report.requestedIteration } else { 0 }
    $iterationNumber = Resolve-IterationNumber -State $State -RequestedIteration $requestedIteration

    if ($iterationNumber -gt [int]$State.iterationsPlanned) {
        Write-Log "Skipping $($Report.name) because it resolves to iteration $iterationNumber beyond max $($State.iterationsPlanned)." "WARN"
        return $false
    }

    Wait-ForFileToSettle -Path $Report.fullPath -SettleSeconds ([int]$Config.watch.fileSettleSeconds)

    Write-Log "Starting iteration $iterationNumber from $($Report.name)."
    $State.currentIteration = $iterationNumber

    Add-StateEvent -State $State -Type "iteration-started" -Message "Planning iteration $iterationNumber from $($Report.name)." -Details @{
        iteration = $iterationNumber
        sourceReport = $Report.relativePath
    }

    $planResult = Run-PlanningIteration `
        -Config $Config `
        -State $State `
        -Iteration $iterationNumber `
        -StatePath $StatePath `
        -DeepResearch $Report.fullPath `
        -Purpose $Purpose `
        -Roadmap $Roadmap `
        -SourceReportName $Report.name

    $iterationState = New-IterationStateEntry `
        -Iteration $iterationNumber `
        -PacketIndex $planResult.packetIndex `
        -PacketIndexPath $planResult.folders.packetIndexPath `
        -PlannerTranscriptPath $planResult.folders.plannerTranscriptPath `
        -SteeringLogPath $planResult.folders.steeringLogPath `
        -SourceReportPath $Report.fullPath `
        -SourceReportName $Report.name

    $iterationState.status = "running"
    $state.iterations += $iterationState
    $state.backlog.latestBacklogPath = [string]$iterationState.backlogPath
    $state.backlog.latestBacklogJsonPath = [string]$iterationState.backlogJsonPath
    Save-State -State $state -StatePath $StatePath

    foreach ($packet in $planResult.packetIndex.packets) {
        Write-Log "Executing packet $($packet.id) for iteration $iterationNumber."
        Add-StateEvent -State $state -Type "packet-started" -Message "Executing packet $($packet.id)." -Details @{
            iteration = $iterationNumber
            packetId = [string]$packet.id
            sourceReport = $Report.relativePath
        }

        Invoke-PacketExecution `
            -Config $Config `
            -State $State `
            -IterationState $iterationState `
            -Iteration $iterationNumber `
            -StatePath $StatePath `
            -Packet $packet `
            -RetryLimit ([int]$Config.packetRetryLimit)

        Add-StateEvent -State $State -Type "packet-completed" -Message "Packet $($packet.id) passed verification." -Details @{
            iteration = $iterationNumber
            packetId = [string]$packet.id
            sourceReport = $Report.relativePath
        }

        Save-State -State $State -StatePath $StatePath
    }

    Invoke-QualityGates `
        -Config $Config `
        -State $State `
        -IterationState $iterationState `
        -Iteration $iterationNumber `
        -StatePath $StatePath `
        -QualityDir $planResult.folders.qualityDir `
        -SkipQualityGates:$SkipQualityGates

    $iterationState.status = "completed"
    $State.iterationsCompleted = [int]$State.iterationsCompleted + 1
    $State.watch.processedInputs += [string]$Report.relativePath

    Add-StateEvent -State $State -Type "iteration-completed" -Message "Iteration $iterationNumber completed from $($Report.name)." -Details @{
        iteration = $iterationNumber
        sourceReport = $Report.relativePath
    }

    Save-State -State $State -StatePath $StatePath
    return $true
}

function Get-NextNumericBranchName {
    param(
        [string]$Remote,
        [int]$Start
    )

    $candidate = $Start

    Push-Location $script:WorkspaceRoot
    try {
        while ($true) {
            $name = [string]$candidate
            $localExists = & git branch --list $name
            $remoteExists = & git ls-remote --heads $Remote $name 2>$null

            if (-not $localExists -and -not $remoteExists) {
                return $name
            }

            $candidate++
        }
    }
    finally {
        Pop-Location
    }
}

function Write-FinalSummary {
    param(
        [hashtable]$State,
        [string]$SummaryPath,
        [string]$SummaryJsonPath
    )

    $lines = @()
    $lines += "# Automation Summary"
    $lines += ""
    $lines += ('- Run ID: `{0}`' -f $State.runId)
    $lines += ('- Status: `{0}`' -f $State.status)
    $lines += ('- Branch: `{0}`' -f $State.release.branchName)
    $lines += ('- Commit: `{0}`' -f $State.release.commitHash)
    $lines += ('- Remote: `{0}`' -f $State.release.remote)
    $lines += ""
    $lines += "## Iterations"
    $lines += ""

    foreach ($iteration in $State.iterations) {
        $lines += "### $($iteration.label)"
        $lines += ""
        $lines += ('- Status: `{0}`' -f $iteration.status)
        $lines += ('- Packet count: `{0}`' -f $iteration.packetCount)
        $lines += ('- Source report: `{0}`' -f $iteration.sourceReportName)
        $lines += ('- Steering log: `{0}`' -f $iteration.steeringLogPath)

        foreach ($packet in $iteration.packets) {
            $summary = if ($packet.summary) { $packet.summary } else { "No summary recorded." }
            $lines += ('- {0}: `{1}` - {2}' -f $packet.id, $packet.status, $summary)
        }

        foreach ($gate in $iteration.qualityGates) {
            $lines += ('- Gate {0}: `{1}`' -f $gate.name, $gate.status)
        }

        $lines += ""
    }

    Set-Content -LiteralPath $SummaryPath -Value ($lines -join [Environment]::NewLine) -Encoding utf8
    Write-JsonFile -Path $SummaryJsonPath -Data $State
}

function Publish-Results {
    param(
        [pscustomobject]$Config,
        [hashtable]$State,
        [string]$SummaryPath,
        [string]$SummaryJsonPath
    )

    if (-not (Test-GitRepository)) {
        throw "Release publishing requires a git repository."
    }

    $remote = [string]$Config.git.pushRemote
    $branchName = Get-NextNumericBranchName -Remote $remote -Start ([int]$Config.git.numberedBranchStart)
    $commitMessage = ([string]$Config.git.commitMessageTemplate).Replace("{iteration}", [string]$State.currentIteration)

    Push-Location $script:WorkspaceRoot
    try {
        & git checkout -b $branchName | Out-Null
        & git add .

        $status = & git status --porcelain
        if (-not $status) {
            $State.release.status = "no-changes"
            $State.release.branchName = $branchName
            $State.release.commitHash = $null
            Write-FinalSummary -State $State -SummaryPath $SummaryPath -SummaryJsonPath $SummaryJsonPath
            return
        }

        & git commit -m $commitMessage | Out-Null
        $commitHash = (& git rev-parse HEAD | Out-String).Trim()
        & git push -u $remote $branchName | Out-Null

        $State.release.status = "published"
        $State.release.branchName = $branchName
        $State.release.commitHash = $commitHash
    }
    finally {
        Pop-Location
    }

    Write-FinalSummary -State $State -SummaryPath $SummaryPath -SummaryJsonPath $SummaryJsonPath
}

$config = $null

if (-not [string]::IsNullOrWhiteSpace($ConfigPath)) {
    $resolvedConfigPath = Resolve-WorkspacePath -Path $ConfigPath
    Assert-FileExists -Path $resolvedConfigPath -Description "Config"
    $config = Read-JsonFile -Path $resolvedConfigPath
}
else {
    $resolvedEnvPath = Resolve-WorkspacePath -Path $EnvPath
    $envValues = Read-DotEnvFile -Path $resolvedEnvPath
    $config = New-ConfigFromDotEnv -EnvValues $envValues
}

if (-not [bool]$config.automationEnabled) {
    Write-Log "Automation is disabled in the automation settings." "WARN"
    return
}

$resolvedWatchDirectory = if ($WatchDirectory) {
    Resolve-WorkspacePath -Path $WatchDirectory
}
else {
    Resolve-WorkspacePath -Path ([string]$config.paths.watchDirectory)
}

$resolvedDeepResearchPattern = if ($DeepResearchPattern) {
    $DeepResearchPattern
}
else {
    [string]$config.paths.deepResearchPattern
}

$resolvedDeepResearchPath = if ($DeepResearchPath) {
    Resolve-WorkspacePath -Path $DeepResearchPath
}
else {
    $null
}

if ($resolvedDeepResearchPath) {
    Assert-FileExists -Path $resolvedDeepResearchPath -Description "Deep Research brief"
}

$resolvedPurposePath = if ($PurposePath) {
    Get-ExistingOptionalPath -Path $PurposePath
}
else {
    Get-ExistingOptionalPath -Path ([string]$config.paths.purpose)
}

$resolvedRoadmapPath = if ($RoadmapPath) {
    Get-ExistingOptionalPath -Path $RoadmapPath
}
else {
    Get-ExistingOptionalPath -Path ([string]$config.paths.roadmap)
}

$statePath = Resolve-WorkspacePath -Path ([string]$config.paths.state)
$finalSummaryPath = Resolve-WorkspacePath -Path ([string]$config.paths.finalSummary)
$finalSummaryJsonPath = Resolve-WorkspacePath -Path ([string]$config.paths.finalSummaryJson)

Ensure-Directory -Path (Resolve-WorkspacePath -Path ([string]$config.paths.templates))
Ensure-Directory -Path (Resolve-WorkspacePath -Path ([string]$config.paths.packets))
Ensure-Directory -Path (Resolve-WorkspacePath -Path ([string]$config.paths.reports))
Ensure-Directory -Path $resolvedWatchDirectory
Ensure-Directory -Path (Split-Path -Parent $statePath)

if (-not $MaxIterations -or $MaxIterations -le 0) {
    if ($null -ne $config.maxIterations) {
        $MaxIterations = [int]$config.maxIterations
    }
    else {
        $MaxIterations = [int]$config.iterations
    }
}

Assert-CleanWorkingTree -AllowDirty:$AllowDirty

$state = New-RunState `
    -Config $config `
    -IterationCount $MaxIterations `
    -WatchDirectory $resolvedWatchDirectory `
    -DeepResearchPattern $resolvedDeepResearchPattern `
    -DeepResearch $resolvedDeepResearchPath `
    -Purpose $resolvedPurposePath `
    -Roadmap $resolvedRoadmapPath `
    -FinalSummaryPath $finalSummaryPath

Add-StateEvent -State $state -Type "run-started" -Message "Automation run initialized."
Save-State -State $state -StatePath $statePath

try {
    $explicitReportConsumed = $false

    while (Can-ProcessAnotherIteration -State $state) {
        $pendingReports = @()

        if ($resolvedDeepResearchPath -and -not $explicitReportConsumed) {
            $explicitReportConsumed = $true
            $pendingReports = @(
                [ordered]@{
                    name = [System.IO.Path]::GetFileName($resolvedDeepResearchPath)
                    fullPath = $resolvedDeepResearchPath
                    relativePath = Get-RelativeWorkspacePath -Path $resolvedDeepResearchPath
                    requestedIteration = Get-IterationNumberFromReportName -FileName ([System.IO.Path]::GetFileName($resolvedDeepResearchPath))
                    lastWriteTimeUtc = (Get-Item -LiteralPath $resolvedDeepResearchPath).LastWriteTimeUtc.ToString("o")
                }
            )
        }
        else {
            $pendingReports = @(Get-PendingDeepResearchFiles `
                -Directory $resolvedWatchDirectory `
                -Pattern $resolvedDeepResearchPattern `
                -ProcessedInputs $state.watch.processedInputs)
        }

        if ($pendingReports.Count -eq 0) {
            if ($Watch -and [bool]$config.watch.enabled -and (Can-ProcessAnotherIteration -State $state)) {
                Write-Log "No matching deep research reports found yet. Waiting for new files in $($state.watch.directory)." "INFO"
                Start-Sleep -Seconds ([int]$config.watch.pollSeconds)
                continue
            }

            break
        }

        foreach ($report in $pendingReports) {
            if (-not (Can-ProcessAnotherIteration -State $state)) {
                break
            }

            Process-DeepResearchReport `
                -Config $config `
                -State $state `
                -StatePath $statePath `
                -Report $report `
                -Purpose $resolvedPurposePath `
                -Roadmap $resolvedRoadmapPath `
                -SkipQualityGates:$SkipQualityGates | Out-Null

            if (-not $Watch -and -not [bool]$config.watch.processAllPending) {
                break
            }
        }

        if (-not $Watch) {
            break
        }
    }

    if ($state.iterationsCompleted -eq 0) {
        $state.status = "waiting-for-input"
        Add-StateEvent -State $state -Type "no-input" -Message "No matching deep research report was processed."
    }
    elseif (-not $SkipRelease -and [bool]$config.release.publishAfterBatch) {
        Write-Log "Publishing results."
        Publish-Results -Config $config -State $state -SummaryPath $finalSummaryPath -SummaryJsonPath $finalSummaryJsonPath
    }
    else {
        $state.release.status = "skipped"
    }

    if ($state.iterationsCompleted -gt 0) {
        $state.status = "completed"
        Add-StateEvent -State $state -Type "run-completed" -Message "Automation run completed successfully."
    }

    Save-State -State $state -StatePath $statePath
    Write-FinalSummary -State $state -SummaryPath $finalSummaryPath -SummaryJsonPath $finalSummaryJsonPath
}
catch {
    $state.status = "failed"
    Add-StateEvent -State $state -Type "run-failed" -Message $_.Exception.Message
    Save-State -State $state -StatePath $statePath
    Write-FinalSummary -State $state -SummaryPath $finalSummaryPath -SummaryJsonPath $finalSummaryJsonPath
    throw
}
