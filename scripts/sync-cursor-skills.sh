#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
skills_src="$root/.github/skills"
skills_dst="$root/.cursor/skills"

mkdir -p "$skills_dst"

count=0
for skill_dir in "$skills_src"/*; do
  [[ -d "$skill_dir" && -f "$skill_dir/SKILL.md" ]] || continue
  name="$(basename "$skill_dir")"
  ln -sfn "../../.github/skills/$name" "$skills_dst/$name"
  count=$((count + 1))
done

echo "Synced $count Cursor skill symlink(s) into .cursor/skills/"
