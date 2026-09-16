#!/bin/bash
# launchd 등록 해제
LABEL="com.onseungchan.anna-watch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "해제 완료: $LABEL"
