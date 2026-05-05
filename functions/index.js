// Nutritionix proxy — keeps the API key on the server side and limits
// access to authenticated users only. Called from the Records app via
// httpsCallable('nutrients').
//
// Env vars required (functions/.env on local; Firebase secrets/params in prod):
//   NUTRITIONIX_APP_ID
//   NUTRITIONIX_APP_KEY
// Get them from https://www.nutritionix.com/business/api (free tier: 200/day).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

const NUTRITIONIX_APP_ID = defineString('NUTRITIONIX_APP_ID');
const NUTRITIONIX_APP_KEY = defineString('NUTRITIONIX_APP_KEY');

exports.nutrients = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const query = (request.data && request.data.query || '').toString().trim();
  if (!query) {
    throw new HttpsError('invalid-argument', 'query required.');
  }
  if (query.length > 500) {
    throw new HttpsError('invalid-argument', 'query too long.');
  }
  const appId = NUTRITIONIX_APP_ID.value();
  const appKey = NUTRITIONIX_APP_KEY.value();
  if (!appId || !appKey) {
    throw new HttpsError('failed-precondition', 'Nutritionix credentials not configured on server.');
  }

  let res;
  try {
    res = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'x-app-key': appKey,
        'x-remote-user-id': request.auth.uid
      },
      body: JSON.stringify({ query })
    });
  } catch (err) {
    throw new HttpsError('unavailable', 'Nutritionix unreachable: ' + err.message);
  }
  if (res.status === 404) {
    // Nutritionix returns 404 when nothing in the query parses as food.
    return { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0, items: [], unmatched: true };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpsError('internal', `Nutritionix error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const foods = Array.isArray(json.foods) ? json.foods : [];
  let cal = 0, protein = 0, fat = 0, carbs = 0, fiber = 0;
  for (const f of foods) {
    cal += +f.nf_calories || 0;
    protein += +f.nf_protein || 0;
    fat += +f.nf_total_fat || 0;
    carbs += +f.nf_total_carbohydrate || 0;
    fiber += +f.nf_dietary_fiber || 0;
  }
  return {
    calories: Math.round(cal),
    protein_g: Math.round(protein * 10) / 10,
    fat_g: Math.round(fat * 10) / 10,
    carbs_g: Math.round(carbs * 10) / 10,
    fiber_g: Math.round(fiber * 10) / 10,
    items: foods.map((f) => ({
      name: f.food_name,
      qty: f.serving_qty,
      unit: f.serving_unit,
      cal: Math.round(+f.nf_calories || 0),
      protein: Math.round((+f.nf_protein || 0) * 10) / 10
    }))
  };
});
