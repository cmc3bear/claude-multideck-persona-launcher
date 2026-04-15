# =====================================================
#  MultiDeck Framework Initialization (Windows)
#
#  This script:
#  1. Asks user for DISPATCH_USER_ROOT
#  2. Creates directory structure
#  3. Sets up Python venv and installs kokoro deps
#  4. Creates empty state files from templates
#  5. Prompts for first persona customization
#  6. Prints next steps
# =====================================================

$ErrorActionPreference = "Stop"

Write-Host "=== MultiDeck Framework Initialization ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Ask for DISPATCH_USER_ROOT
$defaultRoot = Join-Path $env:USERPROFILE "dispatch"
$userRoot = Read-Host "DISPATCH_USER_ROOT (default: $defaultRoot)"
if (-not $userRoot) { $userRoot = $defaultRoot }

$userRoot = (Resolve-Path $userRoot -ErrorAction SilentlyContinue) -or (New-Item -ItemType Directory -Path $userRoot -Force).FullName
Write-Host "Using: $userRoot" -ForegroundColor Green

# Step 2: Create directory structure
Write-Host "Creating directories..." -ForegroundColor Cyan
$dirs = @("state", "personas", "personas/archived", "briefings", "tts-output")
foreach ($dir in $dirs) {
    $path = Join-Path $userRoot $dir
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    Write-Host "  Created: $path" -ForegroundColor Gray
}

# Step 3: Create empty state files from templates
Write-Host "Creating state file templates..." -ForegroundColor Cyan
$templates = @{
    "actions.json"         = @{ personal = @(); goals = @(); family = @(); claude_projects = @{} }
    "calendar.json"        = @{ source = "template"; agenda = @(); cron_jobs = @(); free_blocks = @(); suggestions = @() }
    "dispatch-log.json"    = @{ entries = @() }
    "project-summary.json" = @{ source = "template"; projects = @() }
    "inbox-flags.json"     = @{ flagged = @() }
    "followups.json"       = @{ tracked = @() }
    "escalations.json"     = @{ pending = @() }
    "morning-pipeline.json" = @{ date = $null; stages = @{}; meta = @{ version = "0.1.0" } }
    "pulse-log.json"       = @{ entries = @() }
    "state-meta.json"      = @{ last_updated = @{}; data_sources = @{}; version = "0.1.0" }
    "weather.json"         = @{ provider = "none"; current = $null }
    "job-board.json"       = @{ meta = @{ version = 1; next_job_id = 1 }; jobs = @() }
}

foreach ($filename in $templates.Keys) {
    $path = Join-Path $userRoot "state" $filename
    $content = $templates[$filename] | ConvertTo-Json -Depth 10
    Set-Content -Path $path -Value $content
    Write-Host "  Created: $filename" -ForegroundColor Gray
}

# Step 4: Set up Python venv and install deps
Write-Host "Setting up Python environment..." -ForegroundColor Cyan
$venvPath = Join-Path (Split-Path -Parent $PSScriptRoot) "hooks" "kokoro-venv"
$pythonPath = Join-Path $venvPath "Scripts" "python.exe"

if (Test-Path $venvPath) {
    Write-Host "Venv already exists at $venvPath" -ForegroundColor Gray
} else {
    Write-Host "Creating venv at $venvPath..." -ForegroundColor Gray
    python -m venv $venvPath
    Write-Host "Installing dependencies..." -ForegroundColor Gray
    & $pythonPath -m pip install --quiet -r (Join-Path (Split-Path -Parent $PSScriptRoot) "hooks" "requirements.txt")
    Write-Host "Dependencies installed" -ForegroundColor Green
}

# Step 5: Create personas.json with default dispatch persona
Write-Host "Creating personas registry..." -ForegroundColor Cyan
$personasPath = Join-Path $userRoot "personas" "personas.json"
$personas = @{
    meta = @{ version = "0.1.0"; framework = "MultiDeck" }
    personas = @{
        dispatch = @{
            callsign = "Dispatch"
            description = "Central coordination and workflow orchestration"
            color_hex = "#00FFCC"
            tab_color = "#00CCFF"
            voice_key = "dispatch"
            scope = "coordination, job board, briefing generation"
            cwd = $userRoot
            agent_file = "personas/dispatch.md"
        }
    }
}
$personas | ConvertTo-Json -Depth 10 | Set-Content -Path $personasPath
Write-Host "Created personas.json with default 'dispatch' persona" -ForegroundColor Green

# Step 6: Prompt for customization
Write-Host ""
Write-Host "=== Persona Customization ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now customize the 'dispatch' persona or add new ones."
Write-Host "Use the dispatch-agent.py script in the scripts/ directory:"
Write-Host ""
Write-Host "  python scripts/dispatch-agent.py add       - Add a new persona"
Write-Host "  python scripts/dispatch-agent.py list      - List all personas"
Write-Host "  python scripts/dispatch-agent.py remove    - Remove a persona"
Write-Host ""

# Step 7: Print next steps
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Set environment variable for easy access:"
Write-Host "   [System.Environment]::SetEnvironmentVariable('DISPATCH_USER_ROOT', '$userRoot', 'User')"
Write-Host ""
Write-Host "2. Launch the dispatch persona:"
Write-Host "   powershell -ExecutionPolicy Bypass -File scripts\launch-persona.ps1 dispatch"
Write-Host ""
Write-Host "3. Start the dashboard server (from framework root):"
Write-Host "   node dashboard/server.cjs"
Write-Host "   Then visit: http://localhost:3045"
Write-Host ""
Write-Host "4. View the morning briefing:"
Write-Host "   node scripts/generate-briefing.cjs"
Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
