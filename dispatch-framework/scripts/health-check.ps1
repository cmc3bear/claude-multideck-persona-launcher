param(
    [int]$Port = 3046
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Write-Check {
    param(
        [string]$Name,
        [ValidateSet("PASS", "WARN", "FAIL")]
        [string]$Status,
        [string]$Detail = ""
    )
    $color = switch ($Status) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }
    Write-Host ("[{0}] {1}" -f $Status, $Name) -ForegroundColor $color
    if ($Detail) {
        Write-Host ("      {0}" -f $Detail) -ForegroundColor DarkGray
    }
    if ($Status -eq "FAIL") { $failures.Add($Name) | Out-Null }
    if ($Status -eq "WARN") { $warnings.Add($Name) | Out-Null }
}

function Test-CommandAvailable {
    param([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

Push-Location $root
try {
    Write-Host "MultiDeck health check" -ForegroundColor Cyan
    Write-Host ("Root: {0}" -f $root) -ForegroundColor DarkGray
    Write-Host ""

    if (Test-CommandAvailable node) {
        $output = & node --check dashboard/server.cjs 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Check "dashboard/server.cjs syntax" "PASS" "node --check exited 0"
        } else {
            Write-Check "dashboard/server.cjs syntax" "FAIL" ($output -join "`n")
        }
    } else {
        Write-Check "node available" "FAIL" "node is not on PATH"
    }

    try {
        $registryPath = Join-Path $root "personas/personas.json"
        $registry = Get-Content -Raw $registryPath | ConvertFrom-Json
        $missing = @()
        $personaProps = @($registry.personas.PSObject.Properties)
        foreach ($prop in $personaProps) {
            $agentFile = [string]$prop.Value.agent_file
            if (-not $agentFile) {
                $missing += "$($prop.Name): missing agent_file"
                continue
            }
            $agentPath = Join-Path $root $agentFile
            if (-not (Test-Path $agentPath)) {
                $missing += "$($prop.Name): $agentFile"
            }
        }
        if ($missing.Count -eq 0) {
            Write-Check "persona registry and agent files" "PASS" ("{0} personas validated" -f $personaProps.Count)
        } else {
            Write-Check "persona registry and agent files" "FAIL" ($missing -join "; ")
        }
    } catch {
        Write-Check "persona registry and agent files" "FAIL" $_.Exception.Message
    }

    try {
        $personaLint = & powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/persona-lint.ps1" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $warnLine = ($personaLint | Select-String -Pattern "warning\\(s\\)" | Select-Object -Last 1).Line
            Write-Check "persona lint" "PASS" ($warnLine -replace "^\[PASS\]\s*", "")
        } else {
            Write-Check "persona lint" "FAIL" ($personaLint -join "`n")
        }
    } catch {
        Write-Check "persona lint" "FAIL" $_.Exception.Message
    }

    if (Test-CommandAvailable codex) {
        $codexOut = & codex --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            $codexOut = & codex --help 2>&1
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Check "codex CLI available" "PASS" (($codexOut | Select-Object -First 1) -join "")
        } else {
            Write-Check "codex CLI available" "FAIL" ($codexOut -join "`n")
        }
    } else {
        Write-Check "codex CLI available" "FAIL" "codex is not on PATH"
    }

    try {
        $launcher = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/launcher" -TimeoutSec 5
        $content = [string]$launcher.Content
        if ($content.Contains('data-mode="codex"') -and $content.Contains('data-runtime="codex"') -and $content.Contains('dangerous-mode')) {
            Write-Check "launcher Codex mode served on port $Port" "PASS" "Codex mode and dangerous toggle found"
        } else {
            Write-Check "launcher Codex mode served on port $Port" "FAIL" "Expected Codex mode and dangerous-mode markers were not all present"
        }
    } catch {
        Write-Check "launcher reachable on port $Port" "WARN" $_.Exception.Message
    }

    try {
        $transport = Invoke-RestMethod -Uri "http://localhost:$Port/launcher/transports" -TimeoutSec 5
        $available = @($transport.available) -join ","
        if ($available) {
            Write-Check "launcher transport endpoint" "PASS" ("default={0}; available={1}; reason={2}" -f $transport.default, $available, $transport.availability_reason)
        } else {
            Write-Check "launcher transport endpoint" "FAIL" "No available transports reported"
        }
    } catch {
        Write-Check "launcher transport endpoint" "WARN" $_.Exception.Message
    }

    try {
        $script = Get-Content -Raw "scripts/launch-persona.ps1"
        [void][scriptblock]::Create($script)
        Write-Check "scripts/launch-persona.ps1 syntax" "PASS" "PowerShell parser accepted script"
    } catch {
        Write-Check "scripts/launch-persona.ps1 syntax" "FAIL" $_.Exception.Message
    }

    if (Test-CommandAvailable bash) {
        $bashOut = & bash -n scripts/launch-persona.sh 2>&1
        $bashCode1 = $LASTEXITCODE
        $bashOut2 = & bash -n scripts/launch-persona-tmux.sh 2>&1
        $bashCode2 = $LASTEXITCODE
        if ($bashCode1 -eq 0 -and $bashCode2 -eq 0) {
            Write-Check "shell launcher syntax" "PASS" "bash -n passed for launch-persona.sh and launch-persona-tmux.sh"
        } else {
            Write-Check "shell launcher syntax" "FAIL" (($bashOut + $bashOut2) -join "`n")
        }
    } else {
        Write-Check "bash available for shell syntax checks" "WARN" "bash is not on PATH"
    }

    if (Test-CommandAvailable wsl.exe) {
        $rootWin = ([string]$root).Replace("\", "/")
        $rootWsl = (& wsl.exe -d Ubuntu -- wslpath -a "$rootWin" 2>$null).Trim()
        $wslOut = & wsl.exe -d Ubuntu -- bash -lc "cd '$rootWsl' && chmod +x ./scripts/wsl-codex-probe.sh && ./scripts/wsl-codex-probe.sh" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $detail = ($wslOut -join "; ").Trim()
            if ($detail -match "codex_status=windows-cmd-fallback") {
                Write-Check "WSL tmux Codex transport prerequisites" "PASS" ("Windows codex.cmd fallback active; {0}" -f $detail)
            } else {
                Write-Check "WSL tmux Codex transport prerequisites" "PASS" $detail
            }
        } else {
            Write-Check "WSL tmux Codex transport prerequisites" "WARN" ($wslOut -join "`n")
        }
    } else {
        Write-Check "WSL tmux Codex transport prerequisites" "WARN" "wsl.exe is not on PATH"
    }

    Write-Host ""
    Write-Host ("Summary: {0} failure(s), {1} warning(s)" -f $failures.Count, $warnings.Count) -ForegroundColor Cyan
    if ($failures.Count -gt 0) {
        exit 1
    }
    exit 0
} finally {
    Pop-Location
}
