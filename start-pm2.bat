@echo off
cd /d "C:\Users\WAyu\Desktop\test"
pm2 resurrect >nul 2>&1 || pm2 start server.js --name supreme-boost --watch --ignore-watch node_modules
