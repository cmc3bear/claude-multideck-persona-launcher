"""MULTI-PERSONA-0023: Add oqe_version: 2.0 front-matter + OQE 2.0 callout block
to all MULTIDECK persona agent files. Replace legacy JOB-NNNN references with
PROJECT-WORKTYPE-#### format. Emit a migration manifest.

Idempotent: re-running skips files that already carry the front-matter and block.
Run from repo root: python scripts/migrate-persona-oqe-2-0.py
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PERSONAS_DIR = REPO_ROOT / "personas"
MANIFEST_PATH = REPO_ROOT / "state" / "migration-MULTI-PERSONA-0023.md"

FRONT_MATTER_TEMPLATE = """<!--
oqe_version: 2.0
spec_source: state/oqe-version.json
governs: {governs}
last_updated_by: Architect MULTI-PERSONA-0023 pass {date}
-->

"""

OQE_BLOCK = """## OQE 2.0 Requirements (mandatory on every job)

Every job I touch under OQE 2.0 must carry these fields, or the creation gate rejects it:

- `problem` — what is wrong and why it matters (per `docs/OQE_DISCIPLINE.md` §11)
- `criteria` — minimum 5 testable items, each citing a specific `§N` of OQE_DISCIPLINE.md or a file path (§11 `linkable_citations_only`)
- `depends_on` — explicit array, never null (§11 `dependency_tracking`)
- `oqe_version: "2.0"` — declared on the job record (§12)
- ID format `PROJECT-WORKTYPE-####` — legacy `PROJECT-####` IDs flagged for migration (§13 `project_worktype_job_ids`)

Bare OQE references that lack a `§N` anchor or file path are rejected at the creation gate per §11. See `state/oqe-version.json` for the full capability matrix and `docs/OQE_DISCIPLINE.md` §14 for the three enforcement gates (creation, review, standing).

---

"""

GOVERNS = {
    "ARCHITECT_AGENT.md": "Architect persona scope: project structure, docs, README, agent coordination",
    "COMMERCIAL_PRODUCER_AGENT.md": "Commercial Producer persona scope: demo video production, scene direction, final master",
    "DISPATCH_AGENT.md": "Dispatch persona scope: workspace coordination, cross-project routing, job board orchestration",
    "ENGINEER_AGENT.md": "Engineer persona scope: feature implementation, tests, build, refactor",
    "FOREMAN_AGENT.md": "Foreman persona scope: MULTIDECK project lead, planning, docs, cross-persona coordination",
    "INSPECTOR_AGENT.md": "Inspector persona scope: QA, review gate, persona deploy validation, lane enforcement",
    "KERNEL_AGENT.md": "Kernel persona scope: launcher HTML/JS/CSS, server.cjs routes, Node backend, feature implementation",
    "LAUNCHER_ENGINEER_AGENT.md": "Launcher Engineer persona scope: launcher UI, persona spawning, terminal integration",
    "PACKER_AGENT.md": "Packer persona scope: asset pipeline, portrait + intro generation, ICO + shortcut builds",
    "PERSONA_AUTHOR_AGENT.md": "Persona Author persona scope: agent design, roster management, persona templates",
    "PRODUCER_AGENT.md": "Producer persona scope: end-to-end commercial production, script, VO, music, master",
    "RESEARCHER_AGENT.md": "Researcher persona scope: investigation, source grading, evidence gathering",
    "RESONANCE_AGENT.md": "Resonance persona scope: voice engineering, Kokoro hooks, ffmpeg post-processing, callsign system",
    "REVIEWER_AGENT.md": "Reviewer persona scope: quality gate, review workflow, OQE compliance verification",
    "VOICE_TECHNICIAN_AGENT.md": "Voice Technician persona scope: Kokoro TTS pipeline, voice config, playback mutex",
}

# Legacy JOB-NNNN -> PROJECT-WORKTYPE-NNNN replacements.
# Engineer's example is JWT auth (workspace-level feature). Reviewer's escalation
# example shares the same context. Use WS-AUTH-#### to keep the ID format
# illustrative and OQE-2.0-compliant without fabricating a real ticket.
JOB_ID_REPLACEMENTS = {
    "JOB-0042": "WS-AUTH-0042",
    "JOB-0047": "WS-AUTH-0047",
}

FRONT_MATTER_SENTINEL = "oqe_version: 2.0"
OQE_BLOCK_SENTINEL = "## OQE 2.0 Requirements (mandatory on every job)"


def find_oqe_insertion_anchor(lines: list[str]) -> int:
    """Insert the OQE block right before the first H2 that comes after the
    intro section (Identity / What I Am / What I Am NOT / My Lane). Returns
    the line index where the new block should be inserted.

    Heuristic: skip the first H1 (`# Persona:`) and the first ~5 H2 sections
    that are intro material, then insert before the next H2 (typically
    "Core Functions", "Tools", "On Startup", "Voice Output Rules", etc.).

    Falls back to inserting before the first H2 we see if the file is short.
    """
    h2_indices = [i for i, ln in enumerate(lines) if ln.startswith("## ")]
    if not h2_indices:
        # No H2s at all — append at end.
        return len(lines)

    # Prefer to insert right before the first H2 whose title contains
    # one of these markers (these are post-intro sections):
    post_intro_markers = (
        "Core Functions",
        "On Startup",
        "Tools",
        "Voice Output Rules",
        "Job Board",
        "Style",
        "Process",
        "Handoff",
    )
    for idx in h2_indices:
        title = lines[idx][3:].strip()
        if any(m.lower() in title.lower() for m in post_intro_markers):
            return idx

    # Otherwise, insert before the LAST H2 that looks like intro
    # ("Identity", "What I Am", "My Lane") + 1, by inserting before the
    # H2 that immediately follows them.
    intro_markers = ("Identity", "What I Am", "My Lane", "Recall")
    last_intro_idx = None
    for idx in h2_indices:
        title = lines[idx][3:].strip()
        if any(m.lower() in title.lower() for m in intro_markers):
            last_intro_idx = idx
    if last_intro_idx is not None:
        # Find next H2 after last_intro_idx
        for idx in h2_indices:
            if idx > last_intro_idx:
                return idx
        # No following H2 — append at end of file.
        return len(lines)

    # Fallback: insert before the first H2.
    return h2_indices[0]


def migrate_file(path: Path, today: str) -> dict:
    raw = path.read_text(encoding="utf-8")
    record = {
        "file": str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "front_matter_before": "absent",
        "front_matter_after": "absent",
        "oqe_block_before": "absent",
        "oqe_block_after": "absent",
        "legacy_job_refs_before": [],
        "legacy_job_refs_after": [],
        "changes_applied": [],
    }

    # Snapshot legacy refs before
    record["legacy_job_refs_before"] = re.findall(r"JOB-\d+", raw)

    # 1. Front-matter
    if FRONT_MATTER_SENTINEL in raw[:200]:
        record["front_matter_before"] = "present"
        record["front_matter_after"] = "present"
    else:
        governs = GOVERNS.get(path.name, f"{path.stem.replace('_', ' ').title()} persona scope")
        front_matter = FRONT_MATTER_TEMPLATE.format(governs=governs, date=today)
        raw = front_matter + raw
        record["front_matter_after"] = "added"
        record["changes_applied"].append("front-matter added")

    # 2. OQE 2.0 block
    if OQE_BLOCK_SENTINEL in raw:
        record["oqe_block_before"] = "present"
        record["oqe_block_after"] = "present"
    else:
        lines = raw.split("\n")
        anchor = find_oqe_insertion_anchor(lines)
        # Insert OQE_BLOCK as its own group of lines before anchor
        new_lines = lines[:anchor] + OQE_BLOCK.split("\n") + lines[anchor:]
        raw = "\n".join(new_lines)
        record["oqe_block_after"] = "added"
        record["changes_applied"].append("OQE 2.0 block inserted")

    # 3. Legacy JOB-NNNN replacements
    replaced_any = False
    for legacy, new in JOB_ID_REPLACEMENTS.items():
        if legacy in raw:
            raw = raw.replace(legacy, new)
            replaced_any = True
    if replaced_any:
        record["changes_applied"].append("legacy JOB-NNNN refs replaced")

    record["legacy_job_refs_after"] = re.findall(r"JOB-\d+", raw)

    # Write back only if changed
    if record["changes_applied"]:
        path.write_text(raw, encoding="utf-8")

    return record


def main() -> None:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    persona_files = sorted(PERSONAS_DIR.glob("*AGENT*.md"))
    if not persona_files:
        raise SystemExit(f"No persona files found in {PERSONAS_DIR}")

    records = [migrate_file(p, today) for p in persona_files]

    # Build manifest markdown
    lines = [
        "<!--",
        "oqe_version: 2.0",
        "spec_source: state/oqe-version.json",
        "governs: Migration manifest for MULTI-PERSONA-0023 (oqe_version + OQE 2.0 callout in personas)",
        f"last_updated_by: Architect MULTI-PERSONA-0023 migration {today}",
        "-->",
        "",
        "# MULTI-PERSONA-0023 Migration Manifest",
        "",
        f"**Run timestamp:** {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}  ",
        "**Job:** MULTI-PERSONA-0023 — Add oqe_version front-matter to MULTIDECK persona agent files and update legacy JOB-XXXX references  ",
        "**Architect:** Owner of this pass  ",
        f"**Files processed:** {len(records)}  ",
        f"**Files mutated:** {sum(1 for r in records if r['changes_applied'])}  ",
        "",
        "## Per-file state",
        "",
        "| File | Front-matter (before → after) | OQE block (before → after) | Legacy JOB- refs (before → after) | Changes |",
        "|---|---|---|---|---|",
    ]
    for r in records:
        before_refs = ", ".join(r["legacy_job_refs_before"]) or "—"
        after_refs = ", ".join(r["legacy_job_refs_after"]) or "—"
        changes = "; ".join(r["changes_applied"]) or "no-op"
        lines.append(
            f"| `{r['file']}` | {r['front_matter_before']} → {r['front_matter_after']} | "
            f"{r['oqe_block_before']} → {r['oqe_block_after']} | {before_refs} → {after_refs} | {changes} |"
        )

    lines += [
        "",
        "## ID format migration table",
        "",
        "| Legacy ID | Replacement | Context |",
        "|---|---|---|",
        "| JOB-0042 | WS-AUTH-0042 | Engineer persona — JWT auth example |",
        "| JOB-0047 | WS-AUTH-0047 | Reviewer persona — escalation example (2 occurrences) |",
        "",
        "## Verification commands",
        "",
        "```bash",
        "# Criterion 1: front-matter present in all persona files",
        'grep -l "oqe_version: 2.0" personas/*AGENT*.md | wc -l    # expect 15',
        "",
        "# Criterion 2: OQE 2.0 callout block in all persona files",
        'grep -l "OQE 2.0 Requirements (mandatory on every job)" personas/*AGENT*.md | wc -l   # expect 15',
        "",
        "# Criterion 3: zero JOB-NNNN legacy refs in any persona file or CLAUDE.md",
        'grep -nE "JOB-[0-9]+" personas/*AGENT*.md CLAUDE.md            # expect no output',
        "",
        "# Criterion 4: §N anchors used (no bare 'per OQE standards')",
        'grep -nE "per OQE standards" personas/*AGENT*.md               # expect no output',
        "```",
        "",
        "## Notes",
        "",
        "- Job spec stated **14** persona files; repo has **15** (`*AGENT*.md` glob). All 15 were processed.",
        "- Job spec listed Architect, Commercial-Producer, and CLAUDE.md as carrying legacy refs; fresh grep showed only Engineer (1) and Reviewer (2). Those were replaced. CLAUDE.md and Architect/Commercial-Producer agent files had zero matches at run time.",
        "- The OQE 2.0 callout is a uniform block across all personas. Persona-specific phrasing was rejected because it risked drift; the rules apply identically regardless of role.",
        "- Front-matter `governs` field is per-persona to keep the declaration informative.",
        "- Replacements use `WS-AUTH-####` (workspace + auth worktype) to keep example IDs OQE-2.0-format-compliant without fabricating MULTIDECK tickets that do not exist.",
        "",
    ]

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text("\n".join(lines), encoding="utf-8")

    print(f"Migration complete: {sum(1 for r in records if r['changes_applied'])} of {len(records)} files mutated")
    print(f"Manifest: {MANIFEST_PATH.relative_to(REPO_ROOT)}")
    for r in records:
        marker = "*" if r["changes_applied"] else " "
        print(f"  {marker} {r['file']:50} {' / '.join(r['changes_applied']) or 'no-op'}")


if __name__ == "__main__":
    main()
