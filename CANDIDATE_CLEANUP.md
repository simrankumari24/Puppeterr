Candidate files/dirs to archive or remove (review before deleting)

- auto-improve/reports/ (many JSON reports; archive to reduce repo size)
- stress-tester-runs.jsonl
- stress-tester-summary.json
- element-map-output.json
- pixelGridExtract.py (if unused)
- shapeDetect.py (if duplicate of shapeDetector.js functionality)
- model-catalog.txt.example (example file; keep or move to docs)
- wrangler.toml / wrangler.jsonc if not using Cloudflare Workers
- large demo or test artifacts in root (logs, json blobs)

Recommended action: move these to `/archive/` first, commit, verify app still runs, then delete if desired.
