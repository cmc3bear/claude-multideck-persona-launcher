# correction-cron-install.ps1 — register the hourly Internal Affairs interviewer
# with Windows Task Scheduler.
#
# Usage (from elevated PowerShell):
#   .\correction-cron-install.ps1                    # default: claude-code backend, hourly
#   .\correction-cron-install.ps1 -Backend local     # use local Ollama instead
#   .\correction-cron-install.ps1 -IntervalMinutes 30
#   .\correction-cron-install.ps1 -Uninstall         # remove the scheduled task
#
# The task runs as the current user (no service account needed) and starts
# whenever a user session is active. If you sign out, it pauses; on next
# sign-in it resumes on the schedule.

param(
    [ValidateSet("claude-code", "local")]
    [string]$Backend = "claude-code",
    [int]$IntervalMinutes = 60,
    [string]$RegistryPath = "F:\corrections\corrections.jsonl",
    [string]$ScriptPath = (Join-Path $PSScriptRoot "interview-agent.py"),
    [string]$PythonExe = "python",
    [string]$TaskName = "MultiDeck-InternalAffairs-Hourly",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[uninstall] removed scheduled task '$TaskName'"
    } else {
        Write-Host "[uninstall] task '$TaskName' not found, nothing to remove"
    }
    return
}

if (-not (Test-Path $ScriptPath)) {
    throw "interview-agent.py not found at $ScriptPath. Pass -ScriptPath if it lives elsewhere."
}

# Ensure the registry directory exists so the cron doesn't fail on first run
# with a missing parent dir.
$registryDir = Split-Path $RegistryPath -Parent
if (-not (Test-Path $registryDir)) {
    New-Item -ItemType Directory -Path $registryDir -Force | Out-Null
    Write-Host "[setup] created $registryDir"
}

$action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory (Split-Path $ScriptPath -Parent)

# Repeat every $IntervalMinutes for 365 days (PowerShell needs an end bound).
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 365)).Repetition

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -MultipleInstances IgnoreNew

# Pass backend + registry path via environment so the script picks them up.
$envVars = @{
    "INTERVIEWER_BACKEND" = $Backend
    "CORRECTIONS_REGISTRY" = $RegistryPath
}

# Encode env vars into the task's argument string since ScheduledTask doesn't
# directly support per-task env. We prefix the python call with a wrapper batch.
$wrapperPath = Join-Path $registryDir "interview-agent-wrapper.cmd"
# Quote $PythonExe so paths with spaces (e.g. "C:\Program Files\Python311\python.exe")
# survive cmd.exe argv splitting. Quote $ScriptPath and $registryDir for the same reason.
@"
@echo off
set INTERVIEWER_BACKEND=$Backend
set CORRECTIONS_REGISTRY=$RegistryPath
"$PythonExe" "$ScriptPath" >> "$registryDir\interview-agent.log" 2>&1
"@ | Out-File -FilePath $wrapperPath -Encoding ASCII -Force

# Re-bind action to point at the wrapper.
$action = New-ScheduledTaskAction `
    -Execute $wrapperPath `
    -WorkingDirectory (Split-Path $ScriptPath -Parent)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[update] removed existing task before re-registering"
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "MultiDeck Internal Affairs hourly interviewer. Asks open corrections what has actually been fixed since they were logged. Backend=$Backend, interval=${IntervalMinutes}m." | Out-Null

Write-Host "[install] scheduled task '$TaskName' registered"
Write-Host "          backend         = $Backend"
Write-Host "          interval        = $IntervalMinutes minutes"
Write-Host "          registry        = $RegistryPath"
Write-Host "          script          = $ScriptPath"
Write-Host "          wrapper         = $wrapperPath"
Write-Host "          log             = $registryDir\interview-agent.log"
Write-Host ""
Write-Host "First run starts in ~2 minutes. To run on-demand:"
Write-Host "  Start-ScheduledTask -TaskName $TaskName"
Write-Host "To remove:"
Write-Host "  .\correction-cron-install.ps1 -Uninstall"
