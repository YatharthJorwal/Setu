@echo off
rem Setu launcher. Run with no argument to start the app. Run with help to see the other commands.
setlocal EnableExtensions
cd /d "%~dp0"
set "AREA=rudraprayag"
set "CMD=%~1"
if "%CMD%"=="" set "CMD=start"
set "FORCE=0"
if /i "%CMD%"=="setup" set "FORCE=1"

if /i "%CMD%"=="help" goto :usage
if /i "%CMD%"=="-h" goto :usage
if /i "%CMD%"=="/?" goto :usage
if /i "%CMD%"=="info" goto :cmd_info
if /i "%CMD%"=="save" goto :cmd_save

where python >nul 2>nul
if errorlevel 1 (
  echo [error] Python was not found. Install Python 3.11 or newer and tick Add to PATH.
  goto :fail
)
where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node was not found. Install Node 20 or newer, the LTS version.
  goto :fail
)

if not exist ".venv\Scripts\python.exe" (
  echo [setup] Creating the Python virtual environment
  python -m venv .venv
  if errorlevel 1 goto :fail
)
set "PY=.venv\Scripts\python.exe"

if "%FORCE%"=="1" if exist ".venv\.deps-ok" del ".venv\.deps-ok"
if not exist ".venv\.deps-ok" (
  echo [setup] Installing Python packages
  "%PY%" -m pip install -q -r pipeline\requirements.txt
  if errorlevel 1 goto :fail
  echo ok>".venv\.deps-ok"
)

if "%FORCE%"=="1" goto :npm_install
if exist "web\node_modules\vite" goto :npm_done
:npm_install
echo [setup] Installing web packages
pushd web
call npm install
set "NPM_RC=%errorlevel%"
popd
if not "%NPM_RC%"=="0" goto :fail
:npm_done

if /i "%CMD%"=="setup" (
  echo [setup] Done.
  goto :eof
)
if /i "%CMD%"=="start" goto :cmd_start
if /i "%CMD%"=="rebuild" goto :cmd_rebuild
if /i "%CMD%"=="refetch" goto :cmd_refetch
if /i "%CMD%"=="audit" goto :cmd_audit
if /i "%CMD%"=="graph" goto :cmd_graph
if /i "%CMD%"=="tiers" goto :cmd_tiers
if /i "%CMD%"=="news" goto :cmd_news
if /i "%CMD%"=="population" goto :cmd_population
if /i "%CMD%"=="test" goto :cmd_test
echo [error] Unknown command: %CMD%
echo.
goto :usage

:cmd_info
echo [info] This copy of Setu lives in: %cd%
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [info] This folder is not a git repository.
  goto :eof
)
echo [info] Git remote:
git remote -v
echo [info] Branch and changes:
git status -sb
echo [info] Last commits:
git log --oneline -5
if exist "web\src\brief\handler.ts" (echo [info] Has the AI brief code: yes) else (echo [info] Has the AI brief code: NO, this copy is out of date)
if exist "web\.env.local" (echo [info] Has web\.env.local: yes) else (echo [info] Has web\.env.local: no)
goto :eof

:cmd_save
set "MSG=%~2"
if "%MSG%"=="" set "MSG=chore: save progress"
echo [save] Saving the repo in: %cd%
git ls-files --error-unmatch web\.env.local >nul 2>nul
if not errorlevel 1 (
  echo [error] web\.env.local is tracked by git, so nothing was saved. Tell me before continuing.
  goto :fail
)
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
  if errorlevel 1 goto :fail
) else (
  echo [save] Nothing new to commit. Pushing any earlier commits.
)
git push
if errorlevel 1 (
  echo.
  echo [save] The push was rejected: GitHub has commits this folder does not.
  echo [save] Run this, then run.bat save again:  git pull --rebase origin main
  goto :fail
)
echo [save] Done.
goto :eof

:cmd_start
if not exist "data\raw\dem\*.tif" (
  call :fetch_dem
  if errorlevel 1 goto :fail
)
if not exist "data\raw\osm\%AREA%_roads.json" (
  call :fetch_osm
  if errorlevel 1 goto :fail
)
if not exist "data\processed\terrain.json" (
  call :build
  if errorlevel 1 goto :fail
)
if not exist "data\processed\graph.json" (
  call :build_graph
  if errorlevel 1 goto :fail
)
goto :serve

:cmd_rebuild
call :build
if errorlevel 1 goto :fail
goto :serve

:cmd_refetch
call :fetch_dem
if errorlevel 1 goto :fail
call :fetch_osm
if errorlevel 1 goto :fail
call :build
if errorlevel 1 goto :fail
goto :serve

:cmd_audit
"%PY%" -m pipeline.audit --area %AREA%
if errorlevel 1 goto :fail
goto :eof

:cmd_graph
call :build_graph
if errorlevel 1 goto :fail
pushd web
call npm test -- real-graph
set "GRAPH_RC=%errorlevel%"
popd
if not "%GRAPH_RC%"=="0" goto :fail
goto :eof

:cmd_news
echo [news] Fetching recent headlines. This takes about 20 seconds.
"%PY%" -m pipeline.news
if errorlevel 1 goto :fail
pushd web
node scripts\sync-data.mjs
popd
echo [news] Done. Use Refresh in the app, or start it with run.bat
goto :eof

:cmd_population
echo [population] Estimating how many people live at each village. Reading the corridor from the WorldPop grid can take a few minutes.
if "%~2"=="" ("%PY%" -m pipeline.population) else ("%PY%" -m pipeline.population --raster "%~2")
if errorlevel 1 goto :fail
call :build_graph
if errorlevel 1 goto :fail
echo [population] Done. Start the app with run.bat and check the numbers at the top.
goto :eof

:cmd_tiers
echo [tiers] Writing the facility review sheet. Existing edits are kept.
"%PY%" -m pipeline.build_graph --area %AREA% --write-tier-template
if errorlevel 1 goto :fail
start "" "pipeline\patches\facility_tiers.csv"
goto :eof

:cmd_test
"%PY%" -m unittest discover -s pipeline/tests -t .
if errorlevel 1 goto :fail
pushd web
call npm run typecheck
if errorlevel 1 (
  popd
  goto :fail
)
call npm test
if errorlevel 1 (
  popd
  goto :fail
)
popd
echo [test] All checks passed.
goto :eof

:serve
echo [run] The AI brief uses a local Ollama model, qwen3.5:4b by default. Start Ollama to enable it, otherwise a labelled template brief is shown.
echo [run] Starting the app. Press Ctrl+C to stop.
cd web
call npm run dev -- --open
goto :eof

:fetch_dem
echo [data] Downloading terrain tiles
"%PY%" -m pipeline.fetch_dem --area %AREA%
exit /b %errorlevel%

:fetch_osm
echo [data] Downloading OpenStreetMap data. The public server is often busy, so retries are normal.
"%PY%" -m pipeline.fetch_osm --area %AREA%
exit /b %errorlevel%

:build
echo [data] Building the map files
"%PY%" -m pipeline.build --area %AREA%
if errorlevel 1 exit /b 1
call :build_graph
exit /b %errorlevel%

:build_graph
echo [data] Building the road graph
"%PY%" -m pipeline.build_graph --area %AREA%
exit /b %errorlevel%

:usage
echo Setu launcher
echo.
echo   run.bat            start the app, fetching and building data first if it is missing
echo   run.bat rebuild    rebuild the map files and road graph from data already downloaded, then start
echo   run.bat refetch    download fresh OSM and terrain data, rebuild, then start
echo   run.bat audit      run the data audit and print the summary
echo   run.bat graph      rebuild the road graph and print the real-data network report
echo   run.bat tiers      write and open the facility review sheet
echo   run.bat news       fetch fresh local headlines for the news card
echo   run.bat population estimate people per village from WorldPop, then rebuild the graph
echo   run.bat test       run all tests and the type check
echo   run.bat setup      reinstall the Python and web packages
echo   run.bat info       show which folder this is, its git state, and whether it is up to date
echo   run.bat save "msg" commit everything and push, always from this folder
exit /b 0

:fail
echo.
echo [error] Something failed. Scroll up for the first error message.
pause
exit /b 1
