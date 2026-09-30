@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
echo Abriendo Transcriptor en http://127.0.0.1:4173 ...
call npm start
pause
