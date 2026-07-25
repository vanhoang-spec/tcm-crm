@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title TCM CRM - DANG CHAY (dung dong cua so nay)
echo ========================================
echo   TCM CRM DANG CHAY
echo ========================================
echo.
echo Dia chi truy cap trong van phong:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http://%%a:3000
echo.
echo Tren chinh may nay: http://localhost:3000
echo.
echo *** DUNG DONG CUA SO NAY - dong la CRM tat ***
echo ========================================
echo.
call npm run start:lan
pause
