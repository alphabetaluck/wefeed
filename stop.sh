#!/bin/bash
LOGDIR="$(cd "$(dirname "$0")" && pwd)/logs"

for name in server watcher; do
  pidfile="$LOGDIR/$name.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "[$name] 已停止 (PID $pid)"
    else
      echo "[$name] 进程不存在"
    fi
    rm -f "$pidfile"
  else
    echo "[$name] 未找到 pid 文件"
  fi
done
