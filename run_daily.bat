@echo off
cd /d "C:\Users\ekapr\Documents\GitHub\legiscope"
set PYTHONPATH=C:\Users\ekapr\Documents\GitHub\legiscope
REM 자동 초안(--draft) 비활성: News Epoch 워크플로우는 brief만 받고 본문은 직접 작성
"C:\Users\ekapr\AppData\Local\Programs\Python\Python311\python.exe" article_daily.py --slack >> "C:\Users\ekapr\Documents\GitHub\legiscope\output\logs\daily_%DATE:~0,4%-%DATE:~5,2%-%DATE:~8,2%.log" 2>&1
