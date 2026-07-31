@echo off
rem 词书 · 首次设置（只需做一次）：登录 Netlify + 链接到你的站点
set "NETLIFY=%APPDATA%\npm\netlify.cmd"
if not exist "%NETLIFY%" set "NETLIFY=netlify.cmd"

echo ============================================
echo 第 1 步：登录 Netlify
echo 会在浏览器打开授权页面，登录你的 Netlify 账号并确认。
echo 完成后回到这个窗口。
echo ============================================
call "%NETLIFY%" login
if errorlevel 1 (
  echo.
  echo 登录失败，请重试。
  pause
  exit /b 1
)

echo.
echo ============================================
echo 第 2 步：链接到你的站点
echo 用键盘方向键选择 "Link existing project" 回车，
echo 然后选择站点 glistening-horse-e0f9ab（或包含它的那一项）回车。
echo ============================================
call "%NETLIFY%" link
if errorlevel 1 (
  echo.
  echo 链接失败，请重试。
  pause
  exit /b 1
)

echo.
echo 首次设置完成！以后改完代码，双击 deploy.bat 即可更新，网址不变。
pause
