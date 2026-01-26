# =============================================================================
# SAJTMASKIN - Git Backup & Sync Script
# =============================================================================
# Detta skript:
# 1. Dödar alla npm run dev/node.exe processer
# 2. Committar alla ändringar
# 3. Skapar en timestampad backup av main/mainorigin på GitHub
# 4. Hanterar max 4 main-backups (raderar äldsta om 5:e kommer)
# 5. Uppdaterar lokal main till att matcha remote main/origin/main
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n=== SAJTMASKIN Git Backup & Sync ===" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# 1. Döda npm run dev/node.exe processer
# =============================================================================
Write-Host "[1/5] Stoppar npm/node processer..." -ForegroundColor Yellow

$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*npm*run*dev*" -or 
    $_.CommandLine -like "*next*dev*" -or
    $_.Path -like "*node.exe*"
}

if ($nodeProcesses) {
    $count = $nodeProcesses.Count
    Write-Host "  Hittade $count node-process(er) att stoppa..." -ForegroundColor Gray
    foreach ($proc in $nodeProcesses) {
        try {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  ✓ Stoppade process $($proc.Id)" -ForegroundColor Green
        } catch {
            Write-Host "  ⚠ Kunde inte stoppa process $($proc.Id): $_" -ForegroundColor Yellow
        }
    }
    Start-Sleep -Seconds 1
} else {
    Write-Host "  ✓ Inga node-processer att stoppa" -ForegroundColor Green
}

# =============================================================================
# 2. Committa alla ändringar
# =============================================================================
Write-Host "`n[2/5] Kontrollerar Git-status..." -ForegroundColor Yellow

# Kontrollera att vi är i ett Git-repo
if (-not (Test-Path ".git")) {
    Write-Host "  ✗ Fel: Inte i ett Git-repository!" -ForegroundColor Red
    exit 1
}

# Hämta status
$status = git status --porcelain

if ($status) {
    Write-Host "  Hittade ändringar att committa..." -ForegroundColor Gray
    
    # Lägg till alla ändringar
    git add -A
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Fel vid git add!" -ForegroundColor Red
        exit 1
    }
    
    # Skapa commit-meddelande med timestamp
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMessage = "Backup: $timestamp - Auto-commit before main backup"
    
    git commit -m $commitMessage
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Fel vid git commit!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  ✓ Ändringar committade" -ForegroundColor Green
} else {
    Write-Host "  ✓ Inga ändringar att committa" -ForegroundColor Green
}

# =============================================================================
# 3. Skapa timestampad backup av main
# =============================================================================
Write-Host "`n[3/5] Skapar backup av main..." -ForegroundColor Yellow

# Hämta senaste från origin
Write-Host "  Hämtar senaste från origin..." -ForegroundColor Gray
git fetch origin
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Varning: Kunde inte hämta från origin" -ForegroundColor Yellow
}

# Kontrollera att main finns
$mainExists = git show-ref --verify --quiet refs/heads/main 2>$null
$originMainExists = git show-ref --verify --quiet refs/remotes/origin/main 2>$null

if (-not $mainExists -and -not $originMainExists) {
    Write-Host "  ✗ Fel: Ingen main-gren hittades!" -ForegroundColor Red
    exit 1
}

# Skapa timestamp för backup-gren
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupBranch = "backup/main-$timestamp"

# Växla till main lokalt eller skapa från origin/main
if ($mainExists) {
    git checkout main
} elseif ($originMainExists) {
    git checkout -b main origin/main
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Fel vid checkout av main!" -ForegroundColor Red
    exit 1
}

# Skapa backup-gren
Write-Host "  Skapar backup-gren: $backupBranch" -ForegroundColor Gray
git checkout -b $backupBranch
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Fel vid skapande av backup-gren!" -ForegroundColor Red
    exit 1
}

# Pusha backup till origin
Write-Host "  Pushar backup till origin..." -ForegroundColor Gray
git push origin $backupBranch
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Fel vid push av backup-gren!" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Backup skapad: $backupBranch" -ForegroundColor Green

# =============================================================================
# 4. Hantera max 4 backups (raderar äldsta om 5:e kommer)
# =============================================================================
Write-Host "`n[4/5] Hanterar backup-grenar (max 4)..." -ForegroundColor Yellow

# Hämta alla backup-grenar från origin
git fetch origin --prune
$allBranches = git branch -r --list "origin/backup/main-*"
$backupBranches = $allBranches | ForEach-Object { $_.Trim() -replace '^origin/', '' } | Sort-Object

if ($backupBranches.Count -gt 4) {
    $toDelete = $backupBranches[0..($backupBranches.Count - 5)]
    Write-Host "  Hittade $($backupBranches.Count) backup-grenar. Raderar $($toDelete.Count) äldsta..." -ForegroundColor Gray
    
    foreach ($branchToDelete in $toDelete) {
        Write-Host "  Raderar: $branchToDelete" -ForegroundColor Gray
        git push origin --delete $branchToDelete 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    ✓ Raderad: $branchToDelete" -ForegroundColor Green
        } else {
            Write-Host "    ⚠ Kunde inte radera: $branchToDelete" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  ✓ $($backupBranches.Count) backup-grenar (max 4)" -ForegroundColor Green
}

# =============================================================================
# 5. Uppdatera lokal main till att matcha remote
# =============================================================================
Write-Host "`n[5/5] Uppdaterar lokal main..." -ForegroundColor Yellow

# Växla tillbaka till main
git checkout main
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Fel vid checkout av main!" -ForegroundColor Red
    exit 1
}

# Hämta och merga/pull från origin/main
Write-Host "  Hämtar senaste från origin/main..." -ForegroundColor Gray
git fetch origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Varning: Kunde inte hämta från origin/main" -ForegroundColor Yellow
}

# Reset till origin/main för att säkerställa matchning
$originMainSha = git rev-parse origin/main 2>$null
if ($originMainSha) {
    Write-Host "  Uppdaterar lokal main till origin/main..." -ForegroundColor Gray
    git reset --hard origin/main
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Lokal main matchar nu origin/main" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Kunde inte reset:a main" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠ Ingen origin/main hittades, behåller lokal main" -ForegroundColor Yellow
}

# =============================================================================
# Sammanfattning
# =============================================================================
Write-Host "`n=== Klart! ===" -ForegroundColor Cyan
Write-Host "  Backup skapad: $backupBranch" -ForegroundColor Green
Write-Host "  Aktuell gren: $(git rev-parse --abbrev-ref HEAD)" -ForegroundColor Gray
Write-Host "  Commit: $(git rev-parse --short HEAD)" -ForegroundColor Gray
Write-Host ""
