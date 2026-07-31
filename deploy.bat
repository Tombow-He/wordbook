@echo off
rem 词书 · 一键更新部署（以后每次改完双击这个）
cd /d "%~dp0"
node tools\deploy.mjs
pause
