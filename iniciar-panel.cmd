@echo off
rem Inicia la base de datos local y el panel de administracion en http://localhost:3100/admin
set PGCTL="C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
%PGCTL% -D "%~dp0.local\pgdata" status >nul 2>&1 || %PGCTL% -D "%~dp0.local\pgdata" -l "%~dp0.local\pg.log" start
cd /d "%~dp0apps\web"
echo.
echo Panel: http://localhost:3100/admin   (la primera carga tarda ~30 s)
echo Usuarios y claves: .local\credenciales.txt
echo Para cerrar: Ctrl+C
echo.
start "" cmd /c "timeout /t 25 >nul && start http://localhost:3100/admin"
npm run dev -- -p 3100
