#!/bin/bash
export PATH="/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin:${PATH:-}"
exec /usr/bin/python3 "$HOME/.config/openchamber/bin/grokbot-oc-notify.py" "$@"
