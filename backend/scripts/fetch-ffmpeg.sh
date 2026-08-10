#!/usr/bin/env bash
# Lambda ffmpeg Layer 用の静的バイナリ(linux amd64)を取得する。
# バイナリはサイズが大きいため git 管理せず、デプロイ前にこのスクリプトで取得する。
# CI(deploy.yml) とローカル(make deploy) の両方から呼ぶ。
#
# 重要: Lambda(Amazon Linux)では共有ライブラリが揃わないため、必ず
# 静的リンク(static)ビルドを使う。John Van Sickle のビルドが static。
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

# static ビルドのミラー(順に試す)。全て John Van Sickle の同一 static ビルド。
URLS=(
  "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
  "https://www.johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
)

ARCHIVE="$TMP/ffmpeg.tar.xz"
ok=""
for url in "${URLS[@]}"; do
  echo "Downloading ffmpeg (static) from: $url"
  if curl -fsSL --retry 4 --retry-delay 3 --retry-all-errors "$url" -o "$ARCHIVE"; then
    magic="$(head -c 6 "$ARCHIVE" | xxd -p 2>/dev/null || true)"
    if [ "$magic" = "fd377a585a00" ]; then ok=1; break; fi
    echo "  -> invalid archive (magic=$magic), trying next"
  fi
done

if [ -z "$ok" ]; then
  echo "Failed to download a valid ffmpeg static archive" >&2
  exit 1
fi

tar xf "$ARCHIVE" -C "$TMP"
FOUND="$(find "$TMP" -type f -name ffmpeg | head -1)"
if [ -z "$FOUND" ]; then
  echo "ffmpeg binary not found in archive" >&2
  exit 1
fi
cp "$FOUND" "$DEST"
chmod +x "$DEST"

echo "ffmpeg installed: $DEST ($(du -h "$DEST" | cut -f1))"
