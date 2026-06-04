# Stew Updates

Private daily recap delivery for Ax's Day.

This repo is safe to host as a public static site only because daily payloads are encrypted before they are written into `days/`.

## Architecture

1. HQ remains the private source of truth.
2. `scripts/build-ax-day.mjs` reads a private markdown digest.
3. The script writes:
   - a local private page in `../ax-day/YYYY-MM-DD/index.html`
   - an encrypted hosted payload in `days/YYYY-MM-DD.json.enc`
   - a private link in `../ax-day/YYYY-MM-DD/link.txt`
   - a Pushover-ready message in `../ax-day/YYYY-MM-DD/sms.txt`
4. GitHub Pages hosts only the static viewer and encrypted payloads.
5. The decryption key lives in the URL fragment after `#key=`.

Anyone with the full link can read that day's recap. Treat links as private.

## Generate A Day

From this folder:

```bash
npm run build:day -- --date 2026-05-21 --source ../daily-digests/2026-05-21.md
```

For a dry setup test:

```bash
npm run build:sample
```

## Send Pushover

Create a Pushover application named `Stew Updates`, then set:

```bash
export PUSHOVER_APP_TOKEN="..."
export PUSHOVER_USER_KEY="..."
```

Or create a non-committed `.env` file in this folder:

```bash
PUSHOVER_APP_TOKEN=...
PUSHOVER_USER_KEY=...
```

Send:

```bash
npm run send:pushover -- --date 2026-05-21
```

## Deploy

Commit and push this folder to the `stew-updates` GitHub repository. GitHub Pages serves the root directory from `main`.

For the nightly automation, publish only the encrypted day payload:

```bash
npm run publish:day -- --date 2026-05-21
```

When the viewer UI changes, publish the static viewer shell too:

```bash
npm run publish:static
```

If the change also adds or updates a Today payload, include it explicitly:

```bash
npm run publish:static -- --file index.html --file styles.css --file app.js --file today/2026-06-03.json
```
