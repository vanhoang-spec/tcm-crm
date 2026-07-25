@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo ========================================
echo   TCM CRM - CAP NHAT / CHUAN BI CHAY
echo ========================================
echo.
echo [1/3] Cai dat thu vien...
call npm install
if errorlevel 1 goto loi
echo.
echo [2/3] Cap nhat cau truc du lieu...
call npx prisma migrate deploy
if errorlevel 1 goto loi
call npx prisma generate
if errorlevel 1 goto loi
echo.
echo [3/3] Dong goi ban chay that (co the mat 2-5 phut)...
call npm run build
if errorlevel 1 goto loi
echo.
echo ========================================
echo   XONG! Gio bam vao file 2-CHAY-CRM.bat
echo ========================================
pause
exit /b 0

:loi
echo.
echo ========================================
echo   CO LOI XAY RA - chup man hinh nay lai
echo ========================================
pause
exit /b 1
