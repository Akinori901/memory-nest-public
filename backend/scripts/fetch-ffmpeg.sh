#!/usr/bin/env bash
# Lambda ffmpeg Layer 用の静的バイナリ(linux amd64)を取得する。
# バイナリはサイズが大きいため git 管理せず、デプロイ前にこのスクリプトで取得する。
# CI(deploy.yml) とローカル(make deploy) の両方から呼ぶ。
#
# 重要: Lambda(Amazon Linux)では共有ライブラリが揃わないため、必ず
# 静的リンク(static)ビルドを使う。
#
# 取得元は GitHub Releases を優先する。以前使っていた johnvansickle.com は
# GitHub Actions のIPからの接続が reset/timeout する事象があり CI が不安定
# だったため、GitHub CDN 由来の eugeneware/ffmpeg-static(static, linux-x64,
# 生ELFバイナリ)を第一候補にする。
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$DIR/layers/ffmpeg/bin/ffmpeg"

if [ -x "$DEST" ]; then
  echo "ffmpeg already present: $DEST"
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ELF(実行ファイル)のマジックナンバー: 7f 45 4c 46
is_elf() {
  [ "$(head -c 4 "$1" | xxd -p 2>/dev/null)" = "7f454c46" ]
}
# xz アーカイブのマジックナンバー: fd 37 7a 58 5a 00
is_xz() {
  [ "$(head -c 6 "$1" | xxd -p 2>/dev/null)" = "fd377a585a00" ]
}

# --- 1) GitHub Releases: eugeneware/ffmpeg-static (生ELF, static) ---
fetch_from_github() {
  local url
  url="$(curl -fsSL --retry 3 \
    https://api.github.com/repos/eugeneware/ffmpeg-static/releases/latest \
    | grep -oE '"browser_download_url": *"[^"]*ffmpeg-linux-x64"' \
    | head -1 | sed 's/.*: *"//;s/"$//')"
  [ -n "$url" ] || return 1
  echo "Downloading ffmpeg (static ELF) from GitHub Releases: $url"
  curl -fSL --retry 5 --retry-delay 3 --retry-all-errors "$url" -o "$DEST" || return 1
  is_elf "$DEST" || { echo "  -> not an ELF binary"; return 1; }
  chmod +x "$DEST"
  return 0
}

# --- 2) フォールバック: John Van Sickle (static, tar.xz) ---
fetch_from_jvs() {
  local url="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
  local archive="$TMP/ffmpeg.tar.xz"
  echo "Downloading ffmpeg (static) from: $url"
  curl -fSL --retry 4 --retry-delay 3 --retry-all-errors "$url" -o "$archive" || return 1
  is_xz "$archive" || { echo "  -> invalid archive"; return 1; }
  tar xf "$archive" -C "$TMP"
  local found
  found="$(find "$TMP" -type f -name ffmpeg | head -1)"
  [ -n "$found" ] || return 1
  cp "$found" "$DEST"
  chmod +x "$DEST"
  return 0
}

if fetch_from_github || fetch_from_jvs; then
  echo "ffmpeg installed: $DEST ($(du -h "$DEST" | cut -f1))"
else
  echo "Failed to obtain a valid static ffmpeg binary" >&2
  exit 1
fi
