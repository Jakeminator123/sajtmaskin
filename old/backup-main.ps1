# =============================================================================
# SAJTMASKIN - Git Backup & Force Push Script
# =============================================================================
# Detta skript:
# 1. Dödar npm/node/next processer kopplade till repo (förhindrar fillåsning)
# 2. Kontrollerar att inga hemligheter läcker (.env, API-nycklar)
# 3. Committar alla ändringar (respekterar .gitignore)
# 4. Skapar timestampad backup av ORIGIN/main på GitHub
# 5. Force pushar lokal main till GitHub
# 6. Hanterar max 4 backups (raderar äldsta om 5:e kommer)
# =============================================================================

$ErrorActionPreference = "Stop"

$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) {
    $scriptRoot = (Get-Location).Path
}
Set-Location -Path $scriptRoot
$repoRoot = (Resolve-Path ".").Path

Write-Host "`n=== SAJTMASKIN Git Backup & Force Push ===" -ForegroundColor Cyan
Write-Host "Datum: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host "Repo: $repoRoot" -ForegroundColor Gray
Write-Host ""

# =============================================================================
# 1. Döda npm/node/next processer (förhindrar fillåsning)
# =============================================================================
Write-Host "[1/6] Stoppar npm/node/next processer (repo-scope)..." -ForegroundColor Yellow

$processNames = @("node", "npm", "next")
$killedCount = 0
$targetProcesses = @()

try {
    $escapedRepoRoot = [regex]::Escape($repoRoot)
    $targetProcesses = Get-CimInstance Win32_Process | Where-Object {
        $name = $_.Name
        $base = $name -replace '\.exe$', ''
        $cmd = $_.CommandLine
        $cmd -and ($processNames -contains $base) -and ($cmd -match $escapedRepoRoot)
    }
} catch {
    Write-Host "  ⚠ Kunde inte läsa CommandLine (CIM). Hoppar över process-stop." -ForegroundColor Yellow
    $targetProcesses = @()
}

foreach ($proc in $targetProcesses) {
    try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        $killedCount++
        Write-Host "  ✓ Stoppade $($proc.Name) (PID: $($proc.ProcessId))" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠ Kunde inte stoppa $($proc.Name) (PID: $($proc.ProcessId))" -ForegroundColor Yellow
    }
}

if ($killedCount -eq 0) {
    Write-Host "  ✓ Inga repo-processer att stoppa" -ForegroundColor Green
} else {
    Write-Host "  Väntar 2 sekunder på att processer avslutas..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

# =============================================================================
# 2. Kontrollera att inga hemligheter läcker
# =============================================================================
Write-Host "`n[2/6] Kontrollerar säkerhet..." -ForegroundColor Yellow

# Kontrollera att vi är i ett Git-repo
if (-not (Test-Path ".git")) {
    Write-Host "  ✗ Fel: Inte i ett Git-repository!" -ForegroundColor Red
    exit 1
}

# Kolla att .gitignore finns och innehåller viktiga mönster
$gitignorePath = ".gitignore"
if (Test-Path $gitignorePath) {
    $gitignoreContent = Get-Content $gitignorePath -Raw
    $requiredPatterns = @(".env", ".env.local", ".env*.local", "*.pem", "*.key")
    $missingPatterns = @()

    foreach ($pattern in $requiredPatterns) {
        if ($gitignoreContent -notmatch [regex]::Escape($pattern)) {
            $missingPatterns += $pattern
        }
    }

    if ($missingPatterns.Count -gt 0) {
        Write-Host "  ⚠ Varning: Följande mönster saknas i .gitignore:" -ForegroundColor Yellow
        foreach ($p in $missingPatterns) {
            Write-Host "    - $p" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✓ .gitignore innehåller säkerhetsmönster" -ForegroundColor Green
    }
} else {
    Write-Host "  ✗ Fel: .gitignore saknas!" -ForegroundColor Red
    exit 1
}

# Kontrollera ändrade filer för potentiella hemligheter
$dangerousFiles = @(".env", ".env.local", ".env.production", "credentials.json", "*.pem", "*.key")
$foundDangerous = @()

# Kolla alla ändrade filer (staged + unstaged)
$allChangedFiles = git status --porcelain | ForEach-Object { $_.Substring(3) }

foreach ($file in $allChangedFiles) {
    foreach ($dangerous in $dangerousFiles) {
        if ($file -like $dangerous) {
            $foundDangerous += $file
        }
    }
}

if ($foundDangerous.Count -gt 0) {
    Write-Host "  ✗ STOPP! Potentiellt känsliga filer upptäckta:" -ForegroundColor Red
    foreach ($f in $foundDangerous) {
        Write-Host "    - $f" -ForegroundColor Red
    }
    Write-Host "  Avbryter för säkerhets skull. Ta bort filerna från staging eller lägg till i .gitignore." -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Inga känsliga filer upptäckta" -ForegroundColor Green

$mergeConflicts = git diff --name-only --diff-filter=U
if ($mergeConflicts) {
    Write-Host "  ✗ STOPP! Merge-konflikter hittades:" -ForegroundColor Red
    $mergeConflicts | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
    exit 1
}

$originalBranch = git rev-parse --abbrev-ref HEAD
if (-not $originalBranch -or $originalBranch -eq "HEAD") {
    Write-Host "  ✗ Fel: Kunde inte avgöra aktuell gren." -ForegroundColor Red
    exit 1
}

# =============================================================================
# 3. Committa alla ändringar
# =============================================================================
Write-Host "`n[3/6] Committar ändringar..." -ForegroundColor Yellow

$status = git status --porcelain
if ($status) {
    Write-Host "  Hittade ändringar att committa..." -ForegroundColor Gray

    # Lägg till alla ändringar (respekterar .gitignore)
    git add -A
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Fel vid git add!" -ForegroundColor Red
        exit 1
    }

    # Skapa commit-meddelande med timestamp
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMessage = "Backup: $timestamp - Auto-commit before force push"

    git commit -m $commitMessage
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Fel vid git commit!" -ForegroundColor Red
        exit 1
    }

    Write-Host "  ✓ Ändringar committade" -ForegroundColor Green
} else {
    Write-Host "  ✓ Inga ändringar att committa (working tree clean)" -ForegroundColor Green
}

if ($originalBranch -ne "main") {
    Write-Host "  Synkar main från $originalBranch (fast-forward only)..." -ForegroundColor Gray
    $mainExists = git show-ref --verify refs/heads/main 2>$null
    if (-not $mainExists) {
        $originMainExists = git show-ref --verify refs/remotes/origin/main 2>$null
        if (-not $originMainExists) {
            Write-Host "  ✗ Fel: origin/main saknas, kan inte skapa main." -ForegroundColor Red
            exit 1
        }
        git checkout -b main origin/main
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ✗ Fel vid skapande av main från origin/main!" -ForegroundColor Red
            exit 1
        }
    } else {
        git checkout main
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ✗ Fel vid checkout av main!" -ForegroundColor Red
            exit 1
        }
    }

    git merge --ff-only $originalBranch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Fel: main kunde inte fast-forwardas från $originalBranch." -ForegroundColor Red
        exit 1
    }
}

# =============================================================================
# 4. Skapa timestampad backup av ORIGIN/main
# =============================================================================
Write-Host "`n[4/6] Skapar backup av GitHub main..." -ForegroundColor Yellow

# Kontrollera att origin finns
$originUrl = git remote get-url origin 2>$null
if (-not $originUrl) {
    Write-Host "  ✗ Fel: origin remote saknas!" -ForegroundColor Red
    exit 1
}

# Hämta senaste från origin
Write-Host "  Hämtar senaste från origin..." -ForegroundColor Gray
git fetch origin
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Varning: Kunde inte hämta från origin" -ForegroundColor Yellow
}

# Kontrollera att origin/main finns
$originMainExists = git show-ref --verify refs/remotes/origin/main 2>$null
if (-not $originMainExists) {
    Write-Host "  ⚠ origin/main finns inte ännu - hoppar över backup" -ForegroundColor Yellow
} else {
    # Skapa timestamp för backup-gren
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupBranch = "backup/main-$timestamp"

    # Skapa backup-gren från ORIGIN/main (inte lokal!)
    Write-Host "  Skapar backup-gren från origin/main: $backupBranch" -ForegroundColor Gray
    git branch $backupBranch origin/main 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ⚠ Kunde inte skapa lokal backup-gren" -ForegroundColor Yellow
    } else {
        # Pusha backup till origin
        Write-Host "  Pushar backup till GitHub..." -ForegroundColor Gray
        git push origin $backupBranch 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Backup skapad: $backupBranch" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Kunde inte pusha backup-gren" -ForegroundColor Yellow
        }

        # Ta bort lokal backup-gren (behövs bara på origin)
        git branch -D $backupBranch 2>$null | Out-Null
    }
}

# =============================================================================
# 5. Force push lokal main till GitHub
# =============================================================================
Write-Host "`n[5/6] Force pushar lokal main till GitHub..." -ForegroundColor Yellow

# Säkerställ att vi är på main
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") {
    Write-Host "  ✗ Fel: main är inte aktiv. Avbryter för säkerhets skull." -ForegroundColor Red
    exit 1
}

# Force push (with lease)
Write-Host "  Kör: git push origin main --force-with-lease" -ForegroundColor Gray
git push origin main --force-with-lease
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Fel vid force push!" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Force push lyckades!" -ForegroundColor Green

# =============================================================================
# 6. Hantera max 4 backups (radera äldsta om 5:e kommer)
# =============================================================================
Write-Host "`n[6/6] Hanterar backup-grenar (max 4)..." -ForegroundColor Yellow

# Hämta alla backup-grenar från origin
git fetch origin --prune 2>$null
$allBranches = git branch -r --list "origin/backup/main-*" 2>$null
$backupBranches = @()

if ($allBranches) {
    $backupBranches = $allBranches | ForEach-Object { $_.Trim() -replace '^origin/', '' } | Sort-Object
}

$backupCount = $backupBranches.Count
Write-Host "  Antal backup-grenar: $backupCount" -ForegroundColor Gray

if ($backupCount -gt 4) {
    $toDelete = $backupBranches[0..($backupCount - 5)]
    Write-Host "  Raderar $($toDelete.Count) äldsta backup(s)..." -ForegroundColor Gray

    foreach ($branchToDelete in $toDelete) {
        Write-Host "    Raderar: $branchToDelete" -ForegroundColor Gray
        git push origin --delete $branchToDelete 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    ✓ Raderad" -ForegroundColor Green
        } else {
            Write-Host "    ⚠ Kunde inte radera" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  ✓ $backupCount backup-grenar (max 4 tillåtna)" -ForegroundColor Green
}

# =============================================================================
# Sammanfattning
# =============================================================================
Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "                         KLART!                                 " -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Aktuell gren:  $(git rev-parse --abbrev-ref HEAD)" -ForegroundColor White
Write-Host "  Senaste commit: $(git log -1 --format='%h - %s')" -ForegroundColor White
Write-Host "  GitHub main:   Uppdaterad med lokal version" -ForegroundColor Green
Write-Host ""

# Visa backup-grenar
$finalBackups = git branch -r --list "origin/backup/main-*" 2>$null
if ($finalBackups) {
    Write-Host "  Backup-grenar på GitHub:" -ForegroundColor Gray
    $finalBackups | ForEach-Object {
        $name = $_.Trim() -replace '^origin/', ''
        Write-Host "    - $name" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
