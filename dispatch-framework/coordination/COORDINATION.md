# MULTIDECK Inter-Agent Coordination Protocol

> **Governance authority:** `docs/WORKSPACE_GOVERNANCE.md` is the canonical source of workspace-level standards that override anything in this file. It defines OQE discipline, coordination rules (§2), project boundary enforcement (§3), job board field requirements (§4), review workflow (§5), and escalation protocol (§6). Read it before cross-project coordination.

This document defines how the MULTIDECK project agents hand off work to each other and make joint decisions. All coordination state lives in this directory.

> **External coordinator:** Dispatch is a workspace-level agent that sits above MULTIDECK. It may post jobs to this board on behalf of the user but is not a MULTIDECK agent. Dispatch persona: `dispatch-framework/personas/DISPATCH_AGENT.md`

## Agents

| Name | Persona File | Role |
|------|-------------|------|
| **Foreman** | `personas/FOREMAN_AGENT.md` | Project lead, PM, docs, cross-persona coordination |
| **Kernel** | `personas/KERNEL_AGENT.md` | Core developer — launcher HTML/JS, server routes, Node backend |
| **Packer** | `personas/PACKER_AGENT.md` | Asset pipeline — SD portraits, Kokoro intros, ICO conversion, shortcuts |
| **Inspector** | `personas/INSPECTOR_AGENT.md` | QA, review gate, launch testing, job board compliance |
| **Resonance** | `personas/RESONANCE_AGENT.md` | Voice engineering — Kokoro hooks, ffmpeg chains, voice config, mutex |
| **Producer** | `personas/PRODUCER_AGENT.md` | Commercial production — demos, trailers, VO, music beds, final masters |
| *(Dispatch)* | *external — `03-INFRASTRUCTURE/dispatch/`* | *Workspace-level coordinator. May post jobs here on user's behalf.* |

---

## Files

```
dispatch-framework/coordination/
├── COORDINATION.md         # This file — protocol reference
├── JOB_BOARD.json          # Machine-readable source of truth
```

---

## Job Board

See `JOB_BOARD.json` for the machine-readable source of truth and `docs/JOB_BOARD.md` for full schema documentation.

### Priority Levels

| Priority | Meaning |
|----------|---------|
| **P0** | Blocking / urgent — drop everything |
| **P1** | Important — do next |
| **P2** | Normal — queue order |
| **P3** | Backlog — when time permits |

### Status Flow

> **Superseded by WORKSPACE_GOVERNANCE.md §5:** The current job-board.py uses a different status flow. Refer to `docs/REVIEW_WORKFLOW.md` for the authoritative status model.

```
open → in_progress → submitted → [flagged → resubmit] → closed
```

### Valid `assigned_to` Values

> **Superseded by WORKSPACE_GOVERNANCE.md §3:** Agents are scoped to their project; see `dispatch-framework/personas/personas.json` for the current operative roster. The agent names below are from a legacy configuration.
