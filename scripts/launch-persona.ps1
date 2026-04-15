# =====================================================
#  MultiDeck Persona Launcher
#  Opens a new Windows Terminal tab for a persona with:
#    - Correct working directory
#    - Persona-themed tab color
#    - Terminal title set to callsign
#    - Claude Code launched with --dangerously-skip-permissions
#      (project dirs are self-contained and high-velocity;
#      permission prompts would grind workflow to a halt)
#    - Activation prompt that loads persona + sets Kokoro
#      voice via set-voice.py (per-session, never touches
#      the shared voice-config.json)
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File launch-persona.ps1 dispatch
#    powershell -ExecutionPolicy Bypass -File launch-persona.ps1 engineer
#    powershell -ExecutionPolicy Bypass -File launch-persona.ps1 dispatch "quick sanity check"
# =====================================================

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$PersonaKey,

    [Parameter(Position = 1)]
    [string]$InitialPrompt = ""
)

$ErrorActionPreference = "Stop"

# Read personas.json from configurable path or default
$personasPath = $env:DISPATCH_PERSONAS_JSON
if (-not $personasPath) {
    $personasPath = Join-Path $PSScriptRoot ".." "personas" "personas.json"
}

if (-not (Test-Path $personasPath)) {
    Write-Error "Persona registry not found at $personasPath`nSet `$env:DISPATCH_PERSONAS_JSON or ensure personas/personas.json exists"
    exit 1
}

$registry = Get-Content $personasPath -Raw | ConvertFrom-Json
$key = $PersonaKey.ToLower()

if (-not $registry.personas.$key) {
    $available = ($registry.personas.PSObject.Properties.Name) -join ", "
    Write-Error "Unknown persona: $PersonaKey`nAvailable: $available"
    exit 1
}

$p = $registry.personas.$key
$callsign = $p.callsign
$color = $p.tab_color
$cwd = $p.cwd
$voiceKey = $p.voice_key

# Map persona color_hex to a Claude Code /color name (cyan/blue/green/yellow/orange/red/pink/purple)
$colorNameMap = @{
    "dispatch"   = "cyan";
    "architect"  = "orange";
    "engineer"   = "blue";
    "reviewer"   = "red";
    "researcher" = "purple";
}
$claudeColor = $colorNameMap[$key]
if (-not $claudeColor) { $claudeColor = "cyan" }

# Sanity-check the working directory
if (-not (Test-Path $cwd)) {
    Write-Warning "CWD does not exist: $cwd"
    $cwd = (Get-Location).Path
}

# Build the activation prompt. This prompt is what Claude Code will do as its
# first action. It sets the terminal title to the callsign, runs set-voice.py
# to write the per-session voice config, and tells Claude to load the persona.
$basePrompt = @"
Your first actions on startup, in this exact order:

1. Set the terminal title to "$callsign" by printing this ANSI escape:
   Write-Host -NoNewline \`\`e]0;$callsign\`\`a\`\`

2. Use the Bash tool to run exactly this command (forward slashes, single-quoted path, no shell expansion):
   python "$PSScriptRoot/../hooks/set-voice.py" $voiceKey
   This writes the per-session voice config (uses CLAUDE_CODE_SSE_PORT).
   Do NOT write to the shared voice-config.json file.

3. Load the $callsign persona.

4. Orient and stand ready for user instructions.
"@

if ($InitialPrompt) {
    $basePrompt += "`n`nUser's initial request: $InitialPrompt"
}

# Base64-encode the prompt to pass cleanly through wt's command-line parser
$bytes = [System.Text.Encoding]::UTF8.GetBytes($basePrompt)
$b64 = [Convert]::ToBase64String($bytes)

# Build the full inner script and pass it to powershell via -EncodedCommand.
# Why: wt's command-line parser treats `;` as a wt-level command separator. If we
# pass a multi-statement -Command string to powershell through wt, everything after
# the first `;` is interpreted by wt as a separate wt action and dropped, so the
# claude invocation never runs. -EncodedCommand wraps the whole inner script in a
# single base64 token that wt cannot split on.
$innerScript = @"
Write-Host -NoNewline \`\`e]0;$callsign\`\`a\`\`
Write-Host "Launching $callsign persona (dangerous mode)..." -ForegroundColor Cyan
\$decoded = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$b64'))
claude --dangerously-skip-permissions --name "$callsign" \$decoded
"@

# PowerShell's -EncodedCommand requires UTF-16 LE base64
$innerBytes = [System.Text.Encoding]::Unicode.GetBytes($innerScript)
$innerB64 = [Convert]::ToBase64String($innerBytes)

# Launch Windows Terminal with a new tab (-w new)
$wtArgs = @(
    "-w", "new",
    "new-tab",
    "--title", $callsign,
    "--tabColor", $color,
    "-d", $cwd,
    "powershell",
    "-NoExit",
    "-NoProfile",
    "-EncodedCommand", $innerB64
)

Start-Process wt -ArgumentList $wtArgs
Write-Host "Launched $callsign in new Windows Terminal tab" -ForegroundColor Green
Write-Host "  CWD: $cwd" -ForegroundColor Gray
Write-Host "  Color: $color" -ForegroundColor Gray
Write-Host "  Voice: $voiceKey" -ForegroundColor Gray
Write-Host "  Mode: --dangerously-skip-permissions" -ForegroundColor Yellow
Write-Host "  Claude --name: $callsign" -ForegroundColor Gray
Write-Host "  Claude /color: $claudeColor (queued)" -ForegroundColor Gray

# Schedule a hidden background powershell to inject `/color <name>` into the
# new wt window once claude has had time to boot. We focus the window by its
# title (which matches $callsign because of the wt --title flag) before sending
# keys so other foreground app activity does not catch our keystrokes.
# Logs to %TEMP%\multideck-color-inject-<persona>.log so we can debug timing.
$logPath = "${env:TEMP}\multideck-color-inject-$key.log"
$colorInjector = @"
\$ErrorActionPreference = 'Continue'
function Log(\$msg) {
    \$line = "[`$(Get-Date -Format 'HH:mm:ss.fff')] \$msg"
    Add-Content -LiteralPath '$logPath' -Value \$line
}
Log 'injector start'
Start-Sleep -Seconds 9
Log 'after initial 9s sleep'
Add-Type -AssemblyName System.Windows.Forms
\$shell = New-Object -ComObject WScript.Shell
\$activated = \$false
for (\$i = 0; \$i -lt 10; \$i++) {
    if (\$shell.AppActivate('$callsign')) {
        Log "AppActivate('$callsign') succeeded on attempt \$i"
        \$activated = \$true
        break
    }
    Start-Sleep -Milliseconds 400
}
if (-not \$activated) {
    Log "AppActivate failed after 10 tries; trying ProcessName=WindowsTerminal"
    \$wt = Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Where-Object MainWindowTitle -match '$callsign' | Select-Object -First 1
    if (\$wt) {
        Log "found wt PID `$(\$wt.Id) title=`$(\$wt.MainWindowTitle)"
        \$shell.AppActivate(\$wt.Id) | Out-Null
        \$activated = \$true
    } else {
        Log "no wt process matched"
    }
}
Start-Sleep -Milliseconds 400
Log "sending '/color $claudeColor{ENTER}'"
try {
    [System.Windows.Forms.SendKeys]::SendWait('/color $claudeColor{ENTER}')
    Log 'SendKeys returned'
} catch {
    Log "SendKeys threw: `$_"
}
Log 'injector done'
"@
$injectorBytes = [System.Text.Encoding]::Unicode.GetBytes($colorInjector)
$injectorB64 = [Convert]::ToBase64String($injectorBytes)
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    "-NoProfile", "-EncodedCommand", $injectorB64
) | Out-Null
Write-Host "  /color injector log: $logPath" -ForegroundColor DarkGray
