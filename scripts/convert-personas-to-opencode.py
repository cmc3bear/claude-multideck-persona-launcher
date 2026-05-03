#!/usr/bin/env python3
"""
Convert MultiDeck personas (personas/personas.json + personas/<NAME>_AGENT.md)
to OpenCode agent files at ~/.config/opencode/agents/<key>.md.

Each output file is an OpenCode agent definition with frontmatter:
  - mode: primary
  - model: ollama/qwen3-coder:30b-32k (overridable via DISPATCH_OPENCODE_MODEL)
  - permissions: edit/run/bash/webfetch granted by default; tighten per persona
                 by editing the generated file directly

The body of the original *_AGENT.md is appended verbatim as the agent prompt.
This is a one-shot generator — re-run after editing personas.json or any
*_AGENT.md to regenerate. Hand-edits to generated files are NOT preserved on
re-run; if you need persona-specific overrides for OpenCode only, add them
to a sibling .opencode-extra.md and the generator will append it.

Usage:
    python scripts/convert-personas-to-opencode.py            # all personas
    python scripts/convert-personas-to-opencode.py dispatch   # single persona
    python scripts/convert-personas-to-opencode.py --dry-run  # show plan only

Honors env var DISPATCH_OPENCODE_AGENTS_DIR to override the output dir.
"""

import argparse
import json
import os
import sys
from pathlib import Path

DEFAULT_MODEL = os.environ.get("DISPATCH_OPENCODE_MODEL", "ollama/qwen3-coder:30b-32k")
DEFAULT_AGENTS_DIR = Path(
    os.environ.get(
        "DISPATCH_OPENCODE_AGENTS_DIR",
        Path.home() / ".config" / "opencode" / "agents",
    )
)

REPO_ROOT = Path(__file__).resolve().parents[1]
PERSONAS_JSON = REPO_ROOT / "personas" / "personas.json"


def load_registry() -> dict:
    with PERSONAS_JSON.open(encoding="utf-8") as f:
        return json.load(f)


def read_agent_md(rel_path: str) -> str:
    p = REPO_ROOT / rel_path
    if not p.exists():
        raise FileNotFoundError(f"agent file missing: {p}")
    return p.read_text(encoding="utf-8")


def read_extra(key: str) -> str:
    extra = REPO_ROOT / "personas" / f"{key}.opencode-extra.md"
    return extra.read_text(encoding="utf-8") if extra.exists() else ""


def render(key: str, persona: dict) -> str:
    agent_md = read_agent_md(persona["agent_file"])
    extra = read_extra(key)
    callsign = persona.get("callsign", key)
    description = persona.get("description", "").replace('"', "'")

    fm = [
        "---",
        f"name: {key}",
        f'description: "{description}"',
        "mode: primary",
        f"model: {DEFAULT_MODEL}",
        "permission:",
        "  read: allow",
        "  edit: allow",
        "  glob: allow",
        "  grep: allow",
        "  bash:",
        '    "**": allow',
        "  webfetch: allow",
        "  websearch: allow",
        "  external_directory: allow",
        "temperature: 0.2",
        "---",
        "",
        f"# {callsign} (OpenCode runtime)",
        "",
        "This is the OpenCode-runtime adaptation of the MultiDeck persona.",
        "The full persona spec, OQE 2.0 obligations, and behavioral rules follow.",
        "",
        agent_md.strip(),
    ]
    if extra:
        fm.extend(["", "---", "", "## OpenCode-specific overrides", "", extra.strip()])
    return "\n".join(fm) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("personas", nargs="*", help="optional persona keys to convert")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", help="override output dir", default=None)
    args = ap.parse_args()

    out_dir = Path(args.out) if args.out else DEFAULT_AGENTS_DIR
    registry = load_registry()
    keys = args.personas or sorted(registry["personas"].keys())

    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for k in keys:
        if k not in registry["personas"]:
            print(f"  skip: unknown persona '{k}'", file=sys.stderr)
            continue
        try:
            content = render(k, registry["personas"][k])
        except FileNotFoundError as e:
            print(f"  skip: {e}", file=sys.stderr)
            continue
        target = out_dir / f"{k}.md"
        if args.dry_run:
            print(f"  would write {target} ({len(content)} bytes)")
        else:
            target.write_text(content, encoding="utf-8")
            written.append(target)
            print(f"  wrote {target}")

    if not args.dry_run:
        print(f"\nConverted {len(written)} persona(s) to OpenCode format.")
        print(f"Output dir: {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
