# Google Cloud OIDC Setup

This project is designed to use short-lived Vercel OIDC credentials. Do not create or commit a service-account JSON key for production.

## Required Google Cloud resources

1. A dedicated production Google Cloud/Firebase project with billing enabled.
2. Vertex AI API, IAM Service Account Credentials API, Security Token Service API, Firestore, Firebase Authentication, and Cloud Storage enabled.
3. A private Cloud Storage bucket for temporary generated audio.
4. A dedicated runtime service account for the Taurus Music Vercel project.
5. Separate Workload Identity Federation principals for `production` and `preview`.

## Minimum runtime permissions

Grant only the resources the runtime needs:

- `roles/aiplatform.user` on the production project.
- `roles/storage.objectAdmin` on the dedicated generated-audio bucket, not every bucket in the project.
- `roles/iam.workloadIdentityUser` on the runtime service account for the exact Vercel project and environment principals.
- `roles/iam.serviceAccountTokenCreator` on the runtime service account only where required for `signBlob` and short-lived download URLs.

Do not grant Owner, Editor, or broad project-wide Storage Admin roles.

## Vercel OIDC trust

Use the team-specific Vercel issuer. Restrict the Google Workload Identity Provider with an attribute condition that matches the expected Vercel team, Taurus Music project, and deployment environment. Do not trust every identity from the pool.

Configure the non-secret server variables listed in `.env.example` separately for Production and Preview. Never prefix server variables with `VITE_`.

## Storage controls

- Keep the generated-audio bucket private and disable public access.
- Add a lifecycle rule that deletes objects under `generated/` after one day.
- Add CORS only for the exact production and preview application origins, `GET`, and the response headers required to download audio.
- The API issues a download URL that expires after ten minutes. The browser immediately copies the audio into the user's Firebase Storage path.

## Launch verification

Before production:

1. Confirm a Production OIDC token cannot access Preview resources and the reverse.
2. Confirm the service account cannot list or modify unrelated buckets.
3. Generate one Lyria 2 instrumental clip and verify the temporary object is private.
4. Verify the signed download URL expires and cannot be modified to access another object.
5. Verify failed generation or storage upload refunds the reserved credit once.
6. Configure Google Cloud budgets, Vertex AI quotas, and alerts before accepting paid users.

Lyria 2 (`lyria-002`) currently produces short instrumental WAV clips. Do not advertise vocals or full-length songs until a provider with those capabilities and acceptable commercial terms is integrated and tested.
