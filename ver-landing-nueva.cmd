@echo off
rem Arma la landing nueva (v2) y la muestra en http://127.0.0.1:8789 (solo vista previa: no publica nada).
cd /d "%~dp0mesaverso-landing"
echo.
echo Armando la landing nueva...
call node build-v2.mjs
echo.
echo Abri http://127.0.0.1:8789 en Chrome (la primera vez tarda ~30 s). Para cerrar: Ctrl+C
echo.
start "" cmd /c "timeout /t 20 >nul && start http://127.0.0.1:8789"
call npx -y wrangler@4 dev -c wrangler.v2.jsonc --port 8789
