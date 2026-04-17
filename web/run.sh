#!/bin/bash
set -e
cd "$(dirname "$0")"

# 可选：通过环境变量指定文章目录
# export ARTICLES_DIR=/home/zkwap/workspace/articles

node server.js > server.log 2>&1 &
echo $! > server.pid
sleep 1
cat server.log
