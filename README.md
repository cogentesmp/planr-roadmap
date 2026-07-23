# PLANR Roadmap (public, encrypted)

A password-protected, auto-updating view of the PLANR **Jul–Dec 2026** workplan.

## How it works

```
cogentesmp/agsteward  PLANR project board   ← single source of truth
        │  (GitHub Actions, daily + manual)
        ▼
  scripts/build-data.mjs   reads the board (issues matching "TX.X — …"),
                           merges native fields + issue-body sections,
                           writes planr-activities.json, then AES-GCM
                           encrypts it → planr-activities.enc
        ▼
  GitHub Pages   serves index.html (data-free shell) + planr-activities.enc
                 the page asks for the shared password and decrypts in-browser
```

**Nothing sensitive is in the repo or the served HTML** — the roadmap only exists
as ciphertext (`planr-activities.enc`), unlocked client-side with the shared password.

## Editing the roadmap
Edit the **GitHub issues** on the board — not this repo. Each roadmap issue is titled
`TX.X — Title` and follows [`ISSUE_BODY_TEMPLATE.md`](ISSUE_BODY_TEMPLATE.md). Status,
Effort and Priority come from the board fields; scheduling values live in the
` ```planr ` block in the issue body. Changes appear after the next sync (daily, or
trigger **Actions → Sync roadmap & publish → Run workflow**).

## Secrets (repo settings → Secrets and variables → Actions)
- `PLANR_BOARD_TOKEN` — fine-grained PAT with **Projects: read** + **Issues: read** on `cogentesmp/agsteward`.
- `PLANR_PASSPHRASE` — the shared viewing password (also given to viewers).

## Rotating the password
Change `PLANR_PASSPHRASE` and re-run the workflow; the new `.enc` re-encrypts with the new key.
