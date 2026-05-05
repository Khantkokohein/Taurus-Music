# Taurus Platform Start

## Current Direction

- Keep Taurus Music, Taurus Voice, Developers, Admin, and TaurusPay as separate product areas.
- Google Cloud project: `taurus-calling`.
- Google Cloud project number: `846393681682`.
- Firebase web app: `taurus-web` / `1:846393681682:web:9c39fe6c96162f4073b5cb`.
- Firestore database: `(default)` in `asia-southeast1`.
- Firebase Storage bucket: `taurus-calling.firebasestorage.app` in `ASIA-SOUTHEAST1`.
- Firebase Auth Google provider: enabled.
- Authorized domains: `taurus-music.vercel.app`, `taurus-music-hia2.vercel.app`, `khant-ko-ko-hein.vercel.app`, `localhost`.
- Do not edit `tauruspay.site` during this phase.
- Wallet integration is the final step.
- Do not show MMK pricing in Taurus Music UI. Use TON, USDT, Taurus Coin, Credits, and plan names.
- All paid income should flow to the admin wallet once TaurusPay is connected.

## Build Order

1. Record the product requirements in this document.
2. Add internal Taurus account code for users.
3. Add a separate Taurus Voice page.
4. Add a separate Developers page with API key management.
5. Add Firestore rules for developer API keys.
6. Point Firebase config to `taurus-calling`.
7. Provision Firebase Storage and deploy Firestore/Storage rules.
8. Connect TaurusPay webhook and admin wallet later.
9. Move long song generation to Cloud Run queue later.

## Credit Model Draft

- Taurus Coin: top-up wallet credit from TaurusPay.
- Song Credit: generation quota consumed by song creation.
- Free plan: 2 songs/week and 8 songs/month.
- Owner account: unlimited.
- User UI must not show API cost or margin.

## Payment Draft

- Accepted currencies: TON, USDT, Taurus Coin.
- Admin wallet: pending.
- TaurusPay webhook/API details: pending.
- Wallet connection: pending last step.

## Voice Product Draft

- Taurus Voice should contain Explore Voices, Create Voice, My Voices, and voice owner reward status.
- Voice owners need consent and verification before public use.
- Celebrity/iconic voices should not be added without rights.
- Voice rewards should be tracked as ledger entries before any cash-out policy is enabled.

## Developer Product Draft

- Developers can create Taurus API keys.
- Keys should be hashed in Firestore.
- Scopes: `song.generate`, `voice.use`, `lyrics.generate`.
- Quota/rate limit is required before public API launch.
- Server-side API key verification requires the Cloud Run backend/service account phase.

## Remaining From User

- TaurusPay API/webhook format.
- Admin TON/USDT wallet address.
- Final Taurus Coin rate.
- Final song credit cost.
- Final voice owner reward percentage or fixed coin amount.
