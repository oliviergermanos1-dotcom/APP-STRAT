@echo off
REM ============================================================
REM CAP Strategic Analytics - Lancement serveur local
REM ============================================================
echo.
echo   CAP Strategic Analytics - AGL
echo   ==============================
echo.
echo   Lancement du serveur local sur http://localhost:8000
echo.
echo   Ouvre ton navigateur et va sur : http://localhost:8000
echo   Pour arreter : Ctrl+C
echo.
echo ============================================================
echo.

cd /d "%~dp0\.."

REM Tester si Python est installe
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    python -m http.server 8000
) else (
    where py >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        py -m http.server 8000
    ) else (
        echo.
        echo ERREUR : Python n'est pas installe.
        echo.
        echo Solution : ouvre simplement index.html en double-cliquant
        echo OU installe Python depuis https://www.python.org/downloads/
        echo.
        pause
    )
)
