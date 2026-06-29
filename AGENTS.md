# AGENTS.md

## Security First

Security is the first priority for every analysis, recommendation, and code change in this repository. Prefer the safest design over speed, convenience, or feature delivery.

## Sensitive Data

- Analyze only project files that are relevant to the current task.
- Never expose, print, copy, summarize, or commit secrets, API keys, tokens, environment-variable values, private URLs, cookies, session values, customer data, or production data.
- If a secret-looking value is found, redact it as `<REDACTED>` and report only its type and location. Do not repeat the value.
- Never move server-only secrets into client-side code, browser bundles, logs, tests, examples, or documentation.
- In Next.js, never place private keys or server secrets in `NEXT_PUBLIC_*` variables. In this Vite project, never place private values in `VITE_*` variables.

## Authentication and Authorization

- Check every relevant change for unauthorized-access and privilege-escalation risks.
- Protected pages, API routes, admin pages, and order, payment, or user-data features must enforce authentication and authorization on the server. Client-side guards are not sufficient.
- API routes must return `401 Unauthorized` when authentication is missing or invalid, and `403 Forbidden` when an authenticated user lacks permission.
- Derive user identity from the verified server-side session or token. Do not trust a client-supplied user ID, role, ownership flag, price, credit balance, or payment status.
- Prevent users from reading, creating, updating, or deleting records owned by other users. Check ownership and tenant boundaries server-side to prevent IDOR/BOLA vulnerabilities.
- Keep administrative, payment, credit, quota, role, and ban-state mutations server-only.

## Database Security

- If Supabase is introduced or used, verify Row Level Security policies for every protected table and storage bucket. Use default-deny policies and test cross-user access.
- For Firebase or any other datastore, apply equivalent default-deny access controls and validate ownership for every protected record.

## Working Rules

- Read only the files needed for the task to save tokens and reduce unnecessary exposure.
- If requirements, authorization boundaries, or security implications are unclear, ask the user before proceeding.
- Make the smallest safe change that satisfies the request.
- Do not modify unrelated files or behavior.
- Do not deploy, rotate credentials, change production settings, or access production/customer data unless the user explicitly authorizes that exact action.
