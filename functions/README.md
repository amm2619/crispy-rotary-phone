# Records — Cloud Functions

A single Firebase v1 callable function (`nutrients`) that proxies the Records
app's food-macro lookups to Nutritionix. The browser never sees the API key.

## Auto-deploy via GitHub Actions (recommended)

The workflow at `.github/workflows/deploy-functions.yml` redeploys the
function on every push to `main` that touches `functions/**`. One-time setup:

1. **Get Nutritionix credentials** at
   https://www.nutritionix.com/business/api (free tier: 200 requests/day).

2. **Create a Firebase service-account key**:
   - Go to https://console.firebase.google.com/project/records-app-c778b/settings/serviceaccounts/adminsdk
   - Click **Generate new private key** → downloads a JSON file.

3. **Add 3 GitHub secrets** at
   https://github.com/amm2619/crispy-rotary-phone/settings/secrets/actions:
   - `NUTRITIONIX_APP_ID` — your Nutritionix App ID
   - `NUTRITIONIX_APP_KEY` — your Nutritionix App Key
   - `FIREBASE_SERVICE_ACCOUNT` — paste the **entire contents** of the JSON
     file from step 2 (starts with `{` and ends with `}`)

4. **Trigger a deploy** by either:
   - Pushing any change under `functions/`, or
   - Going to Actions → "Deploy Cloud Functions" → Run workflow

The workflow output will show the function URL when deploy succeeds.

## Manual deploy (alternative)

If you'd rather deploy from your laptop:

```bash
npm install -g firebase-tools
firebase login

cd functions
cp .env.example .env       # then paste real Nutritionix credentials
npm install
cd ..

firebase deploy --only functions --project records-app-c778b
```

After a successful deploy, refresh the app on amm2619.github.io and click
**Retry** in the macro banner. Each unique food label is fetched once and
cached in Firestore so the daily quota lasts ~6 weeks of meal-plan use.

## Troubleshooting

- **`firebase functions:list`** — quick check that `nutrients` is actually
  deployed in the `us-central1` region.
- **CORS error in browser** — the function isn't deployed yet, or it
  deployed but Cloud Run didn't get public-invoker IAM bindings. The v1
  import (`require('firebase-functions/v1')`) we use here makes Firebase
  set this automatically.
- **`failed-precondition: credentials not configured`** — the .env file
  wasn't picked up at deploy time. Check that `functions/.env` exists
  locally (manual deploy) or that GitHub secrets are set (auto-deploy).

## Cost / quota notes

- Nutritionix free tier: 200 lookups/day. Each unique food label is cached,
  so the meal plan's ~30 ingredients use ~30 lookups total — once.
- Firebase Functions free quota covers personal use with multiple orders of
  magnitude of headroom.
