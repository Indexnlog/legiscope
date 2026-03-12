@echo off
cd /d C:\Users\ekapr\legiscope
set PYTHONPATH=C:\Users\ekapr\legiscope
C:\Users\ekapr\AppData\Local\Programs\Python\Python311\python.exe article_daily.py --slack --draft >> C:\Users\ekapr\legiscope\output\logs\daily_%DATE:~0,4%-%DATE:~5,2%-%DATE:~8,2%.log 2>&1
