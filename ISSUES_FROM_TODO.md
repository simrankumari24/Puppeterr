Prioritized Tasks (generated from TODO.md)

High priority
- Fix title auto-gen & manual rename
  - Prevent backend auto-title events from overwriting manual renames.
  - Persist manual rename preference across sessions/bootstraps.
  - Add UI for AI-suggested titles and manual override.
- Quiet chat sync + typing UX
  - Throttle SSE `chat_sync` rebuilds and suppress rebuilds while user typing or editing.
  - Prevent list rebuilds from removing inline rename inputs.
- Make chat items proper accessible buttons
  - Ensure chat list items are `<button>` with `aria-label` and visible focus state.

Medium priority
- Collapsed sidebar UX
  - Keep logo visible when collapsed.
  - Stack header icons and render compact icon-only chat items.
  - Hide initials/text in collapsed view (or replace with generated icons).
- Fix image analysis pipeline
  - Review `pixelGridExtract.py`, `shapeDetect.py`, `pixelGridReasoner.js`, `shapeDetector.js` for failures.
- Renovate auto-improve loop
  - Harden orchestration, retries, and reporting in `auto-improve/*` scripts.

Lower priority / Feature ideas
- Agent Personality Packs (chaotic, professional, minimalist...)
- Task Replay System (re-run previous tasks with same settings)
- Pipeline Visualizer (per-step timing + failures)
- Theme Engine v2 (Orbitron, Geist, Terminal Green, Solarized, etc.)
- Usage-based pricing UI (display only, no billing integration)
- Voice (TTS/STT) support using Web Speech API or provider integration

Repository housekeeping
- Don't delete files automatically. See `CANDIDATE_CLEANUP.md` for suggested cleanup items.

Next steps suggested
1. Confirm high priority items (I already implemented manual-title persistence guard).
2. Run the app and exercise rename + auto-title flow; paste any errors.
3. Approve a small set of files to archive or remove, then I can move them to `archive/`.

If you'd like, I can open GitHub issues for each High/Medium task and draft PRs for the Medium items next.
