@echo off
rem 词书 · 一键启动本地服务器（手机可访问）
cd /d "%~dp0"
echo 正在启动词书服务器...
node tools\serve.mjs
if errorlevel 1 (
  echo.
  echo 启动失败：请确认已安装 Node.js（https://nodejs.org）
  pause
)
