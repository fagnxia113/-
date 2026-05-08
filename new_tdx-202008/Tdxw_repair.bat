@echo off
echo 注册WMI服务...
regsvr32 /s wmidcprv.dll
regsvr32 /s wmiprvsd.dll
echo 注册WMI完成...
set /p a=是否进行系统扫描并修复系统文件，请输入(y或者n)并按回车:
if /i "%a%"=="n" exit
if /i "%a%"=="y" goto :1
cls&%0
:1
sfc /scannow
pause

