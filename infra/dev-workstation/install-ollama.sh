#!/bin/sh
# Install Ollama in Docker without systemd. Uses HTTP/1.1 and retries because
# large CDN downloads often fail with curl HTTP/2 PROTOCOL_ERROR in build contexts.
set -eu

arch="$(dpkg --print-architecture)"
case "$arch" in
  amd64|arm64) ;;
  *) echo "install-ollama: unsupported architecture: $arch" >&2; exit 1 ;;
esac

bindir="/usr/local/bin"
libdir="/usr/local/lib/ollama"
url="https://ollama.com/download/ollama-linux-${arch}.tar.zst"

echo ">>> Installing ollama from ${url}"

rm -rf "$libdir"
install -o0 -g0 -m755 -d "$bindir" "$libdir"

curl --fail --show-error --location --progress-bar \
  --http1.1 --retry 5 --retry-delay 5 --retry-all-errors \
  "$url" | zstd -d | tar -xf - -C /usr/local

ln -sf /usr/local/ollama "$bindir/ollama"
echo ">>> Ollama installed to $bindir/ollama"
