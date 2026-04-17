#!/bin/bash
# WeFeed 启动脚本：server + watcher
BASEDIR="$(cd "$(dirname "$0")" && pwd)"
WEBDIR="$BASEDIR/web"
LOGDIR="$BASEDIR/logs"
mkdir -p "$LOGDIR"

start_service() {
  local name=$1
  local cmd=$2
  local pidfile="$LOGDIR/$name.pid"
  local logfile="$LOGDIR/$name.log"

  if [ -f "$pidfile" ] && kill -0 "$(cat $pidfile)" 2>/dev/null; then
    echo "[$name] 已在运行 (PID $(cat $pidfile))"
    return
  fi

  nohup bash -c "$cmd" >> "$logfile" 2>&1 &
  echo $! > "$pidfile"
  sleep 1
  if kill -0 "$(cat $pidfile)" 2>/dev/null; then
    echo "[$name] 启动成功 (PID $(cat $pidfile))"
  else
    echo "[$name] 启动失败，查看日志: $logfile"
    cat "$logfile"
  fi
}

start_service "server"  "cd $WEBDIR && /usr/bin/node server.js"
start_service "watcher" "cd $WEBDIR && /usr/bin/node watcher.js"
