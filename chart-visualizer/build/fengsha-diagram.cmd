@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0FengshaDiagram.exe" "%~dp0resources\app.asar\dist-cli\fengsha-diagram.cjs" %*
exit /b %ERRORLEVEL%

