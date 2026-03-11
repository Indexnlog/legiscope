@echo off
REM Legiscope 주간 자동 수집 배치파일
REM Windows 작업 스케줄러에 이 파일을 등록하세요

cd /d "C:\Users\ekapr\legiscope"
"C:\Users\ekapr\AppData\Local\Programs\Python\Python311\python.exe" run_weekly.py >> output\logs\scheduler.log 2>&1
