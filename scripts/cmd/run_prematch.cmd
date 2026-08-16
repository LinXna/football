@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\powershell\run_prematch.ps1"
echo.
echo 非滚球处理已结束，按任意键关闭。
pause >nul
