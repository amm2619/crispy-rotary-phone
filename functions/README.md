# Records — Cloud Functions

A single Firebase Cloud Function (`nutrients`) that proxies the Records app's
food-macro lookups to Nutritionix. The browser never sees the API key.

## One-time setup

1. **Get Nutritionix credentials** — sign up at
   https://www.nutritionix.com/business/api (free tier: 200 requests/day).

2. **Upgrade Firebase to Blaze plan** — Cloud Functions require the pay-as-you-go
   plan. Daily free quota: 2M function invocations, so this app stays at $0
   for personal use.

3. **Install the Firebase CLI** if you don't have it:
   ```
   npm install -g firebase-tools
   firebase login
   ```

4. **Configure credentials** — copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```
   Then edit `.env` and paste your `NUTRITIONIX_APP_ID` and `NUTRITIONIX_APP_KEY`.
   (`.env` is gitignored — it never gets committed.)

5. **Install deps and deploy**, from the repo root:
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```

After deploy, the Records app calls `nutrients` automatically when the Weight
Loss tab loads. Macros are cached in Firestore so each unique food is fetched
exactly once (per user) across all your devices.

## Local emulator (optional)

```
firebase emulators:start --only functions
```

The web app currently points at production functions; if you want to hit the
emulator, add `connectFunctionsEmulator(functions, 'localhost', 5001)` after
the `getFunctions(app)` call in `Records/index.html`.

## Cost / quota notes

- Nutritionix free tier: 200 lookups/day. Each unique food label is cached, so
  the meal plan's ~30 ingredients use ~30 lookups total — once.
- Firebase Functions free quota covers personal use with multiple orders of
  magnitude of headroom.
