#!/bin/bash
# MultiDeck Pre-Push Review Gate
#
# This hook blocks git push unless every unpushed commit contains a
# "Reviewed-by:" trailer in its commit message. This enforces Coordination
# Standard #4 (Reviewer gate before operator interaction) and #7 (never
# push without review) at the git level — making it impossible to skip.
#
# Install: cp scripts/pre-push-review-gate.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
# Bypass:  git push --no-verify (ONLY for emergencies, must document why)
#
# The Reviewer agent adds the trailer when it passes:
#   Reviewed-by: Reviewer <reviewer@multideck.local>
#
# OQE Design Decision (2026-04-16):
#   Objective: Prevent commits from reaching GitHub without Reviewer gate.
#   Evidence: 6+ commits pushed without review in two sessions (STRONG, observed).
#     Rules written in persona docs and coordination standards were ignored (STRONG).
#     A remembered rule is a suggestion. A blocking hook is enforcement (STRONG).
#   Qualitative: HIGH confidence. This is the minimum viable enforcement.

remote="$1"
url="$2"

# Find commits that are being pushed but not yet on the remote
while read local_ref local_sha remote_ref remote_sha; do
  if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
    continue  # deleting branch, skip
  fi

  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    # New branch — check only commits not already on any remote branch
    range="$local_sha --not --remotes"
  else
    range="$remote_sha..$local_sha"
  fi

  # Check each unpushed commit for Reviewed-by trailer
  commits=$(git log --format="%H %s" $range 2>/dev/null)
  if [ -z "$commits" ]; then
    continue
  fi

  while IFS= read -r line; do
    sha=$(echo "$line" | cut -d' ' -f1)
    subject=$(echo "$line" | cut -d' ' -f2-)

    # Check for Reviewed-by trailer in the full commit message
    if ! git log -1 --format="%B" "$sha" | grep -qi "^Reviewed-by:"; then
      echo ""
      echo "=========================================="
      echo " PUSH BLOCKED — MISSING REVIEWER GATE"
      echo "=========================================="
      echo ""
      echo " Commit: ${sha:0:7} $subject"
      echo ""
      echo " ESCALATION PROTOCOL (MANDATORY):"
      echo "   1. Spawn Reviewer sub-agent for full 6-gate review"
      echo "   2. Audit the related job: description, result, tags complete?"
      echo "   3. Persona alignment check: are you in scope? why was review skipped?"
      echo "   4. Write mini-retrospective: what happened, root cause, pattern check"
      echo "   5. Only then: amend commit with Reviewed-by: trailer and push"
      echo ""
      echo " See docs/REVIEW_WORKFLOW.md — Push Denial Escalation Protocol"
      echo ""
      echo " Emergency bypass: git push --no-verify"
      echo " (MUST document why in retrospective. Auditable.)"
      echo ""
      exit 1
    fi
  done <<< "$commits"
done

exit 0
