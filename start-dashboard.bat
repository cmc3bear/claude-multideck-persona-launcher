@echo off
REM MultiDeck Dashboard launcher — sets env vars and starts the server.
REM Edit these paths to match your workspace layout.

set DISPATCH_PROJECTS_DIR=D:\Dev\01-ACTIVE
set DISPATCH_WORKSPACE_ROOT=D:\Dev
set DISPATCH_PORT=3045

echo Starting MultiDeck Dashboard on port %DISPATCH_PORT%...
echo Projects dir: %DISPATCH_PROJECTS_DIR%
echo Workspace root: %DISPATCH_WORKSPACE_ROOT%
echo.

node dashboard\server.cjs
