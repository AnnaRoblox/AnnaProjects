@echo off
echo Please enter the name of the Python module you want to install:
set /p moduleName=

:: Set the path to the Python executable and Scripts directory
set PYTHON_PATH=C:\Users\username\AppData\Local\Programs\Python\Python313
set SCRIPTS_PATH=%PYTHON_PATH%\Scripts

:: Add Python and Scripts directories to PATH
set PATH=%PYTHON_PATH%;%SCRIPTS_PATH%;%PATH%

:: Install the module
pip install %moduleName%

pause

