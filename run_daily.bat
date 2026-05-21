@echo off
cd /d "C:\Users\ekapr\Documents\GitHub\legiscope"
set PYTHONPATH=C:\Users\ekapr\Documents\GitHub\legiscope
"C:\Users\ekapr\AppData\Local\Programs\Python\Python311\python.exe" article_daily.py --slack --draft >> "C:\Users\ekapr\Documents\GitHub\legiscope\output\logs\daily_%DATE:~0,4%-%DATE:~5,2%-%DATE:~8,2%.log" 2>&1
