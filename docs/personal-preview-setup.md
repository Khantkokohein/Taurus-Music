# Personal Preview Setup

This mode is for one verified Firebase user while paid plans remain disabled.

## Access boundary

- Set `APP_MODE=personal` only in the Vercel Preview environment.
- Set `PERSONAL_ALLOWED_UIDS` to the exact verified Firebase UID.
- A missing allowlist fails closed. Other authenticated users receive `403`.
- Keep `PAYMENTS_ENABLED=false`.

## Lyria 3 Pro

- Store `GEMINI_API_KEY` as a Vercel Sensitive Environment Variable.
- Keep `GEMINI_MUSIC_MODEL=lyria-3-pro-preview` server-side.
- Never expose either value through `VITE_*`, logs, responses, source code, or Git.
- Restrict the Google API key to the required API and rotate it if exposure is suspected.

## Storage

Generated audio is uploaded server-side to the configured Google Cloud Storage
bucket using short-lived Vercel OIDC credentials. Do not use a service-account
JSON key. The browser receives only a short-lived signed download URL and then
saves the song under the authenticated user's Firebase Storage path.

## Release gate

Before using the paid production mode, remove personal-mode assumptions, keep
server authorization and atomic credits enabled, configure verified webhooks,
and test payment idempotency separately.
