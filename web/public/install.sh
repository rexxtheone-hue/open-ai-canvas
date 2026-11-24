#!/bin/sh
# OmniMuse CLI installer for macOS and Linux.
#   curl -fsSL https://omnimuse.io/install.sh | sh
set -eu

HOST="${OMNIMUSE_HOST:-https://omnimuse.io}"
HOST="${HOST%/}"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$os" in
  darwin|linux) ;;
  *) echo "Unsupported OS: $os. On Windows, run in PowerShell: irm $HOST/install.ps1 | iex" >&2; exit 1 ;;
esac
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) arch=amd64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) echo "Unsupported CPU architecture: $arch" >&2; exit 1 ;;
esac

if [ -n "${OMNIMUSE_INSTALL_DIR:-}" ]; then
  dir="$OMNIMUSE_INSTALL_DIR"
elif [ -w /usr/local/bin ]; then
  dir=/usr/local/bin
else
  dir="$HOME/.local/bin"
fi
mkdir -p "$dir"

url="$HOST/cli/omnimuse-$os-$arch"
tmp="$(mktemp)"
echo "Downloading $url"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$url" -o "$tmp"
else
  wget -qO "$tmp" "$url"
fi
chmod +x "$tmp"
mv "$tmp" "$dir/omnimuse"

echo "Installed omnimuse to $dir/omnimuse"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "Add it to your PATH:  export PATH=\"$dir:\$PATH\"" ;;
esac
if [ "$HOST" != "https://omnimuse.io" ]; then
  echo "Next: omnimuse login --host $HOST"
else
  echo "Next: omnimuse login"
fi
