<!--
oqe_version: 2.0
spec_source: state/oqe-version.json
governs: Workspace-wide coordination standards; cites OQE_DISCIPLINE.md §11-§14 as the discipline substrate
last_updated_by: Dispatch alignment pass 2026-04-20
-->

# Workspace Governance Standards

**Canonical location:** `docs/WORKSPACE_GOVERNANCE.md` (this file)

> **OQE 2.0 compliance**: Every job posted under these standards must carry `problem`, `oqe_version`, `depends_on`, and a minimum of 5 criteria with §N / file citations (per OQE_DISCIPLINE.md §11-§14). Legacy PROJECT-#### IDs are being migrated to PROJECT-WORKTYPE-#### by WS-INFRA-0012 / MULTI-INFRA-0014 / PLANEX-INFRA-0016.
**Applies to:** All projects using this MultiDeck framework
**Enforced by:** Dispatch (workspace coordinator)
**Effective date:** 2026-04-16
**Version:** 1.0

---

## 1. OQE Discipline (Mandatory on Every Task)

Every task, job, and deliverable follows **Objective, Qualitative, Evidence**:

- **Objective**: One-sentence statement of what the task accomplishes, plus success criteria
- **Qualitative**: Confidence assessment (HIGH/MODERATE/LOW), alternatives considered, assumptions stated
- **Evidence**: What was actually observed. File paths, line numbers, test results. Tagged STRONG/MODERATE/LIMITED

No work ships without an OQE frame. The Reviewer checks for it on every job.

---

## 2. Coordination Standards (9 Rules)

These govern how coordinators and agents operate across all projects.

1. **Understand before tasking.** Read the codebase, job board, and project state before assigning work.
2. **Automation first.** Do it or have an agent do it. The operator is last resort.
3. **OQE on everything.** Every task gets an OQE frame. Question alternatives. No speculation.
4. **Reviewer gate before operator interaction.** All work gets one loop of review before the operator sees it.
5. **Route by scope.** Task the correct agent. Stay in lane. If work belongs elsewhere, create a handoff.
6. **Job board is a planning tool.** Jobs created BEFORE work starts. Each reviewed individually with evidence.
7. **Never push without review.** External systems (GitHub, YouTube, email) require Reviewer PASS first.
8. **Quality over speed.** Skipping process costs more than following it.
9. **Project boundary enforcement.** Agents are scoped to their project. Cross-project work routes through the coordinator.

---

## 3. Project Boundary Enforcement

- Agents on a project board only see and act on that project's jobs
- Cross-project requests go through Dispatch, never direct
- When an agent reports status, it reports ONLY its own project
- Dispatch is the only entity that bridges between projects

---

## 4. Job Board Field Requirements

Starting from the effective date, ALL project job boards must include these fields:

**On job creation:**
| Field | Description |
|---|---|
| `subject` | One-line objective |
| `description` | Full objective with context and scope |
| `assigned_to` | Which agent owns the work |
| `priority` | P0 (blocking) / P1 (critical) / P2 (normal) / P3 (backlog) |
| `posted_by` | Who created the job |

**On job completion:**
| Field | Description |
|---|---|
| `result` | Evidence of completion — what was done, verified how |
| `alternatives_considered` | What other approaches were evaluated and why this one was chosen |
| `tags` | Categorization for filtering and analysis |
| `completed_at` | Timestamp |

---

## 5. Review Workflow

### Standard Review (every job)
- Reviewer checks OQE framing, claim verification, scope, evidence
- PASS adds `Reviewed-by:` trailer to commit (where applicable)
- FLAG returns to agent with specific feedback, one fix loop max

### Pre-Push Enforcement (where git repos exist)
- Pre-push hook blocks pushes without `Reviewed-by:` trailer
- Hook ships with MultiDeck framework, recommended for all repos

### Push Denial Escalation (5 steps, mandatory)
When a push is blocked:
1. Full Redline 6-gate review via sub-agent
2. Job documentation audit (all fields complete?)
3. Persona alignment check (in scope? why was review skipped?)
4. Mini-retrospective (root cause, pattern check, mitigation)
5. Only then: amend and push

---

## 6. Retrospectives

Every session that produces work must end with a retrospective documenting:
- What was done
- Process failures (with root causes)
- What went right
- Commitments for next session

Retrospectives are stored in each project's state directory.

---

## 7. Design Decisions

Significant technical or process decisions are documented with full OQE frames:
- Inline in the code where the decision is implemented
- Linked from the job that prompted the decision
- Include alternatives considered and why they were rejected

---

## 8. Persona Startup Protocol (Coordination Check-In)

Every persona session must check in with the coordination server on startup. The check-in pattern differs by transport.

### Windows Terminal (native)

```bash
python3 dispatch-framework/coordination/hook-announce.py <persona> \
  "orient online: <N> active jobs. focus: <one-line priority>." \
  --to dispatch
```

Coord server is at `localhost:3047` — no additional setup needed.

### WSL + tmux

The Windows-host coord server is not reachable via `localhost` from WSL. Derive the gateway IP from the default route before announcing:

```bash
WIN_IP=$(ip route | grep default | awk '{print $3}' 2>/dev/null)
export DISPATCH_COORD_URL=http://${WIN_IP}:3047
python3 dispatch-framework/coordination/hook-announce.py <persona> \
  "orient online: <N> active jobs. focus: <one-line priority>." \
  --to dispatch
```

`hook-announce.py` auto-detects WSL and derives the gateway when `DISPATCH_COORD_URL` is unset, but exporting it explicitly is recommended so `hook-complete.py` and `hook-resource.py` also reach the server without manual intervention.

### Steam Deck + Tailscale

```bash
export DISPATCH_COORD_URL=http://<windows-host-tailscale-ip>:3047
python3 dispatch-framework/coordination/hook-announce.py <persona> \
  "orient online" --to dispatch
```

### What to include in the startup announce

```
"orient online: <N> active jobs, <N> closed. focus: <one-line current priority>."
```

Example:
```
"orient online: 3 active jobs, 12 closed. focus: MULTI-DOCS-0089 transport matrix doc."
```

### Backslash rule

Avoid backslashes in announce message text. The coord server Content-Length parser returns 400 on raw backslash sequences. Use forward slashes for any path references in messages. See `docs/CLAUDE_DISPATCH_INTEGRATION.md` for details.

---

## Adoption

Each project team is responsible for adopting these standards by:
1. Updating their coordination docs to reference this file
2. Ensuring their job board enforces the required fields
3. Training their agents (persona files reference this governance)
4. Installing review hooks where applicable

Dispatch tracks adoption via jobs posted to each project board.

---

*Created: 2026-04-16 by Dispatch*
*This document is the workspace-level source of truth. Project-specific docs may extend but not contradict these standards.*
