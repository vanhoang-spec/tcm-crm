@echo off
chcp 65001 >nul
cd /d "%~dp0.."
set NGAY=%date:~-4%-%date:~3,2%-%date:~0,2%
set GIO=%time:~0,2%%time:~3,2%
set GIO=%GIO: =0%
set DICH=D:\TCM-BACKUP\%NGAY%_%GIO%

echo ========================================
echo   SAO LUU DU LIEU TCM CRM
echo ========================================
echo.
echo Dang chep vao: %DICH%
mkdir "%DICH%" 2>nul
copy "prisma\dev.db" "%DICH%\" >nul
xcopy "storage" "%DICH%\storage\" /E /I /Q /Y >nul 2>nul
copy ".env" "%DICH%\" >nul
echo.
echo XONG. Du lieu da luu tai:
echo    %DICH%
echo.
echo Nen chep thu muc D:\TCM-BACKUP len o cung ngoai
echo hoac Google Drive moi tuan mot lan.
echo ========================================
pause
