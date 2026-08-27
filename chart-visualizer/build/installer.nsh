!macro customInstall
  CreateDirectory "$LOCALAPPDATA\Microsoft\WindowsApps"
  FileOpen $0 "$LOCALAPPDATA\Microsoft\WindowsApps\fengsha-diagram.cmd" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'call "$INSTDIR\fengsha-diagram.cmd" %*$\r$\n'
  FileWrite $0 'exit /b %ERRORLEVEL%$\r$\n'
  FileClose $0
!macroend

!macro customUnInstall
  Delete "$LOCALAPPDATA\Microsoft\WindowsApps\fengsha-diagram.cmd"
!macroend

