@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\package-win-runnable.ps1" -LaunchAfterVerification
if errorlevel 1 (
  echo.
  echo Packaging failed. Review the error output above.
  pause
  exit /b 1
)

echo.
echo Packaging and clean-launch verification succeeded.
pause
