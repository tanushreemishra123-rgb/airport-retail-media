#!/usr/bin/env bash
# Sync source (no node_modules/dist/db) from the local dev dir to the delivery
# folder on the mounted output filesystem. node_modules can't live on that mount
# (it rejects npm's atomic renames), so we develop locally and sync source here.
set -eu
SRC=/home/claude/airport-retail-media
DEST=/mnt/user-data/outputs/airport-retail-media
mkdir -p "$DEST"
tar c -C "$SRC" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='*.tsbuildinfo' \
  --exclude='data' \
  --exclude='*.sqlite*' \
  --exclude='.DS_Store' \
  . | tar x -C "$DEST"
echo "synced $SRC -> $DEST"
