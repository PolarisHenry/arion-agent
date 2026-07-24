#!/bin/sh
# Worker entrypoint — start a D-Bus session + gnome-keyring (Secret Service)
# before running the worker, so lark-cli's keychain can store/retrieve the
# Feishu app secret. Without this, a headless container has no keychain and
# every lark-cli auth call fails with "missing client_secret".
set -e

mkdir -p "$HOME/.lark-cli"

# Start a private D-Bus session; export its address so the worker (and its
# lark-cli child processes via execFileSync) can reach gnome-keyring.
eval "$(dbus-launch --sh-syntax)"
export DBUS_SESSION_BUS_ADDRESS DBUS_SESSION_BUS_PID

# Unlock the default keyring with an empty password (non-interactive; creates
# the login keyring on first run so libsecret-backed keychain calls succeed).
printf '' | gnome-keyring-daemon --unlock --components=secrets >/dev/null 2>&1 || true

exec "$@"
