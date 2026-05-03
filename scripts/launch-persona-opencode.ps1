# =====================================================
#  MultiDeck Persona Launcher - OpenCode runtime
#  Sibling of launch-persona.ps1. Spawns a persona inside a new Windows Terminal
#  tab running OpenCode (local) instead of Claude Code.
#
#  Differences vs launch-persona.ps1:
#    - Runtime is OpenCode (`opencode --agent <key>`), not Claude Code
#    - Model is the local Ollama-served qwen3-coder:30b-32k by default
#    - No Kokoro voice setup (CLAUDE_CODE_SSE_PORT has no OpenCode equivalent)
#    - No /color injector (OpenCode's TUI handles colors natively)
#    - No tmux transport branch yet - wt only for v1
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File launch-persona-opencode.ps1 dispatch
#    powershell -ExecutionPolicy Bypass -File launch-persona-opencode.ps1 engineer "quick sanity check"
#    powershell -ExecutionPolicy Bypass -File launch-persona-opencode.ps1 -Model "ollama/qwen3-coder:30b-32k" dispatch
#
#  Override via env: $env:DISPATCH_OPENCODE_MODEL = "ollama/qwen3-coder:30b-32k"
# =====================================================

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$PersonaKey,

    [Parameter(Position = 1)]
    [string]$InitialPrompt = "",

    [string]$Model = "",

    [string]$CallsignSuffix = ""
)

$ErrorActionPreference = "Stop"

# Resolve model: explicit -Model beats env var beats default
if (-not $Model) {
    $Model = if ($env:DISPATCH_OPENCODE_MODEL) { $env:DISPATCH_OPENCODE_MODEL } else { "ollama/qwen3-coder:30b-32k" }
}

# Read personas.json from configurable path or default. Multi-arg Join-Path
# is PS 7+ only; spell it out so PS 5.1 (which is what `powershell.exe` resolves
# to on Windows) accepts it.
$personasPath = $env:DISPATCH_PERSONAS_JSON
if (-not $personasPath) {
    $personasPath = Join-Path (Join-Path $PSScriptRoot "..") "personas\personas.json"
}

if (-not (Test-Path $personasPath)) {
    Write-Error "Persona registry not found at $personasPath"
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
if ($CallsignSuffix) {
    $callsign = "$callsign-$CallsignSuffix"
}
$tabColor = $p.tab_color
$cwd = $p.cwd

# Resolve env-var substitution in cwd. The personas.json entries use
# ${DISPATCH_USER_ROOT} (workspace root) and ${DISPATCH_ROOT} (framework root).
# If env vars are unset, fall back to sensible defaults derived from the
# script's own location so deploys don't silently land in the dashboard cwd.
$repoRootDefault = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceRootDefault = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$resolvedDispatchRoot = if ($env:DISPATCH_ROOT) { $env:DISPATCH_ROOT } else { $repoRootDefault }
$resolvedUserRoot = if ($env:DISPATCH_USER_ROOT) { $env:DISPATCH_USER_ROOT } else { $workspaceRootDefault }

if ($cwd) {
    $cwd = $cwd -replace '\$\{DISPATCH_USER_ROOT\}', $resolvedUserRoot
    $cwd = $cwd -replace '\$\{DISPATCH_ROOT\}', $resolvedDispatchRoot
}

if (-not $cwd -or -not (Test-Path $cwd)) {
    Write-Warning "CWD does not exist or is unset (raw='$($p.cwd)' resolved='$cwd') - falling back to $resolvedDispatchRoot"
    $cwd = $resolvedDispatchRoot
}

# Init prompt for OpenCode. The persona's full instructions live in its
# OpenCode agent file (~/.config/opencode/agents/<key>.md), pre-loaded by
# --agent. The init prompt just orients the agent.
$basePrompt = @"
You are operating as the $callsign persona under the MultiDeck framework.
OQE 2.0 discipline applies to every job: Objective, Qualitative, Evidence.
Read AGENTS.md or CLAUDE.md in the working directory if present.
Stand ready for user instructions.
"@

if ($InitialPrompt) {
    $basePrompt += "`n`nUser's initial request: $InitialPrompt"
}

# OpenCode reads --prompt as the first user message. We base64-encode the
# prompt to pass cleanly through wt's command-line parser (which treats `;`
# as a separator).
$promptBytes = [System.Text.Encoding]::UTF8.GetBytes($basePrompt)
$promptB64 = [Convert]::ToBase64String($promptBytes)

# Diagnostics: write everything to a per-persona launch log under %TEMP%.
# When the wt tab dies fast, the operator can read the log to see why.
$logPath = Join-Path $env:TEMP "multideck-opencode-launch-$key.log"
function LogLine($msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss.fff')] $msg"
    Add-Content -LiteralPath $logPath -Value $line
}
"" | Set-Content -LiteralPath $logPath  # truncate
LogLine "=== launch start ==="
LogLine "persona=$key callsign=$callsign cwd=$cwd model=$Model"

# Build the inner script that wt executes inside the new tab.
# Backtick-dollar (`$) escapes a variable so it evaluates at INNER runtime
# rather than at outer template-build time. Plain $callsign / $key / $Model /
# $promptB64 ARE baked in at build time - that's intentional. The whole body
# is wrapped in try/catch + Read-Host so a launch failure leaves the window
# open with the error and stack visible.
$innerScript = @"
`$ErrorActionPreference = 'Continue'
`$logPath = '$($logPath -replace "'", "''")'
function Log(`$m) { Add-Content -LiteralPath `$logPath -Value "[`$(Get-Date -Format 'HH:mm:ss.fff')] inner: `$m" }
Log "tab opened, decoding prompt"
try {
    `$decoded = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$promptB64'))
    Log "prompt decoded (`$(`$decoded.Length) chars)"
    `$Host.UI.RawUI.WindowTitle = "$callsign"
    Write-Host "Launching $callsign via OpenCode (model: $Model)" -ForegroundColor Cyan
    Write-Host ""
    Log "invoking opencode --agent $key"
    # Top-level TUI invocation. Permission gating comes from the agents
    # permissions block in ~/.config/opencode/agents/$key.md.
    & opencode --agent "$key" --model "$Model" --prompt "`$decoded"
    `$rc = `$LASTEXITCODE
    Log "opencode exited rc=`$rc"
    Write-Host ""
    Write-Host "[ opencode exited rc=`$rc ]" -ForegroundColor DarkGray
} catch {
    `$err = `$_
    Log "EXCEPTION: `$(`$err.Exception.Message)"
    Log "STACK: `$(`$err.ScriptStackTrace)"
    Write-Host ""
    Write-Host "Launch failed: `$(`$err.Exception.Message)" -ForegroundColor Red
    Write-Host `$err.ScriptStackTrace -ForegroundColor DarkRed
}
Write-Host ""
Write-Host "log: `$logPath" -ForegroundColor DarkGray
Write-Host "[ press ENTER to close ]" -ForegroundColor DarkGray
Read-Host | Out-Null
"@

# Persist the rendered inner script as a temp .ps1 file. wt will run it
# directly (-File) so any parse error surfaces immediately AND the file
# remains on disk for post-mortem inspection.
$innerScriptPath = Join-Path $env:TEMP "multideck-opencode-launch-$key.ps1"
Set-Content -LiteralPath $innerScriptPath -Value $innerScript -Encoding UTF8
LogLine "inner script written to $innerScriptPath ($(($innerScript -split "`n").Count) lines)"

$wtArgs = @(
    "-w", "new",
    "new-tab",
    "--title", $callsign,
    "--tabColor", $tabColor,
    "-d", $cwd,
    "powershell",
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $innerScriptPath
)
LogLine "wt args: $($wtArgs -join ' ')"

try {
    $proc = Start-Process wt -ArgumentList $wtArgs -PassThru -ErrorAction Stop
    LogLine "Start-Process wt succeeded (PID=$($proc.Id))"
} catch {
    LogLine "Start-Process wt FAILED: $($_.Exception.Message)"
    Write-Error "Failed to start wt: $($_.Exception.Message)"
    exit 1
}

Write-Host "Launched $callsign in new Windows Terminal tab (OpenCode runtime)" -ForegroundColor Green
Write-Host "  CWD: $cwd" -ForegroundColor Gray
Write-Host "  Tab color: $tabColor" -ForegroundColor Gray
Write-Host "  Model: $Model" -ForegroundColor Gray
Write-Host "  Agent: $key" -ForegroundColor Gray
Write-Host "  Inner script: $innerScriptPath" -ForegroundColor DarkGray
Write-Host "  Launch log: $logPath" -ForegroundColor DarkGray
