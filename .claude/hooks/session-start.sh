#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Session start hook running..."

# --- Dependency installation ---
# Uncomment/add the relevant block as the project grows:

# Node.js
# if [ -f "$CLAUDE_PROJECT_DIR/package.json" ]; then
#   cd "$CLAUDE_PROJECT_DIR"
#   npm install
# fi

# Python
# if [ -f "$CLAUDE_PROJECT_DIR/pyproject.toml" ] || [ -f "$CLAUDE_PROJECT_DIR/requirements.txt" ]; then
#   cd "$CLAUDE_PROJECT_DIR"
#   pip install -e ".[dev]" --quiet 2>/dev/null || pip install -r requirements.txt --quiet
# fi

# C / C++ (build tools)
# if [ -f "$CLAUDE_PROJECT_DIR/CMakeLists.txt" ]; then
#   apt-get install -y --no-install-recommends cmake build-essential > /dev/null 2>&1 || true
# fi

# Rust
# if [ -f "$CLAUDE_PROJECT_DIR/Cargo.toml" ]; then
#   cd "$CLAUDE_PROJECT_DIR"
#   cargo fetch
# fi

echo "Session start hook complete."
