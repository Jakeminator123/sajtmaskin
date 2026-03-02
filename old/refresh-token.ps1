# =============================================================================
# REFRESH-TOKEN.PS1
# Automatically refreshes VERCEL_OIDC_TOKEN if expired or about to expire
# =============================================================================
# Usage: .\scripts\refresh-token.ps1
# Called automatically by npm run dev via pre-dev script
# =============================================================================

param(
    [int]$MinutesBeforeExpiry = 60  # Refresh if less than 60 min remaining
)

$ErrorActionPreference = "Continue"
$TokenStatusFile = ".token-status.json"

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] " -NoNewline -ForegroundColor DarkGray
    Write-Host $Message -ForegroundColor $Color
}

function Get-JwtExpiry {
    param([string]$Token)
    try {
        $parts = $Token.Split(".")
        if ($parts.Count -lt 2) { return $null }

        $payload = $parts[1]
        # Add padding for base64
        $mod = $payload.Length % 4
        if ($mod -gt 0) { $payload += "=" * (4 - $mod) }
        $payload = $payload.Replace("-", "+").Replace("_", "/")

        $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($payload))
        $json = $decoded | ConvertFrom-Json
        return $json.exp
    } catch {
        return $null
    }
}

function Update-TokenStatus {
    param(
        [string]$Action,
        [nullable[long]]$Expiry,
        [string]$Status
    )
    $statusObj = @{
        lastCheck = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        lastAction = $Action
        tokenExpiry = if ($Expiry) { [DateTimeOffset]::FromUnixTimeSeconds($Expiry).DateTime.ToString("yyyy-MM-dd HH:mm:ss") } else { "unknown" }
        status = $Status
    }
    $statusObj | ConvertTo-Json | Out-File $TokenStatusFile -Encoding UTF8
}

# =============================================================================
# MAIN
# =============================================================================

Write-Log "Checking OIDC token status..." "Cyan"

$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Log "No .env.local found - skipping token check" "Yellow"
    exit 0
}

# Extract current token
$envContent = Get-Content $envFile -Raw
$tokenMatch = [regex]::Match($envContent, 'VERCEL_OIDC_TOKEN="?([^"\r\n]+)"?')

if (-not $tokenMatch.Success) {
    Write-Log "No VERCEL_OIDC_TOKEN found in .env.local" "Yellow"
    Write-Log "Run 'vercel env pull' to get one" "Yellow"
    Update-TokenStatus -Action "skip" -Expiry $null -Status "no_token"
    exit 0
}

$currentToken = $tokenMatch.Groups[1].Value
$expiry = Get-JwtExpiry -Token $currentToken

if (-not $expiry) {
    Write-Log "Could not decode token expiry" "Yellow"
    Update-TokenStatus -Action "skip" -Expiry $null -Status "decode_error"
    exit 0
}

$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$remaining = $expiry - $now
$remainingMinutes = [Math]::Floor($remaining / 60)

$expiryDate = [DateTimeOffset]::FromUnixTimeSeconds($expiry).DateTime.ToString("yyyy-MM-dd HH:mm:ss")
Write-Log "Token expires: $expiryDate UTC ($remainingMinutes minutes remaining)"

if ($remaining -le 0) {
    Write-Log "Token EXPIRED - refreshing now..." "Red"
} elseif ($remainingMinutes -lt $MinutesBeforeExpiry) {
    Write-Log "Token expires soon - refreshing..." "Yellow"
} else {
    Write-Log "Token is valid - no refresh needed" "Green"
    Update-TokenStatus -Action "valid" -Expiry $expiry -Status "ok"
    exit 0
}

# =============================================================================
# REFRESH TOKEN
# =============================================================================

Write-Log "Pulling fresh environment from Vercel..." "Cyan"

# Pull to temp file
$tempFile = ".env.vercel-temp"
$result = vercel env pull $tempFile --yes 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Log "Failed to pull env from Vercel: $result" "Red"
    Write-Log "Try running 'vercel link' first" "Yellow"
    Update-TokenStatus -Action "refresh_failed" -Expiry $expiry -Status "vercel_error"
    exit 1
}

# Extract new token
if (-not (Test-Path $tempFile)) {
    Write-Log "Temp file not created" "Red"
    exit 1
}

$newEnvContent = Get-Content $tempFile -Raw
$newTokenMatch = [regex]::Match($newEnvContent, 'VERCEL_OIDC_TOKEN="?([^"\r\n]+)"?')

if (-not $newTokenMatch.Success) {
    Write-Log "No OIDC token in pulled env" "Red"
    Remove-Item $tempFile -ErrorAction SilentlyContinue
    exit 1
}

$newToken = $newTokenMatch.Groups[1].Value
$newExpiry = Get-JwtExpiry -Token $newToken

# Update only the OIDC token in .env.local (preserve other vars)
$updatedContent = $envContent -replace 'VERCEL_OIDC_TOKEN="?[^"\r\n]+"?', "VERCEL_OIDC_TOKEN=`"$newToken`""
$updatedContent | Out-File $envFile -Encoding UTF8 -NoNewline

# Cleanup
Remove-Item $tempFile -ErrorAction SilentlyContinue

$newExpiryDate = [DateTimeOffset]::FromUnixTimeSeconds($newExpiry).DateTime.ToString("yyyy-MM-dd HH:mm:ss")
$newRemainingMinutes = [Math]::Floor(($newExpiry - $now) / 60)

Write-Log "Token refreshed successfully!" "Green"
Write-Log "New expiry: $newExpiryDate UTC ($newRemainingMinutes minutes)" "Green"

Update-TokenStatus -Action "refreshed" -Expiry $newExpiry -Status "ok"
