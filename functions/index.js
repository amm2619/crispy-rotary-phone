// Nutritionix proxy — keeps the API key on the server side and limits
// access to authenticated users only. Called from the Records app via
// httpsCallable('nutrients').
//
// Env vars required (functions/.env — Firebase auto-uploads on deploy):
//   NUTRITIONIX_APP_ID
//   NUTRITIONIX_APP_KEY
// Get them from https://www.nutritionix.com/business/api (free tier: 200/day).
//
// Using v1 onCall (functions.https.onCall) — its v1-style endpoint
// (region-project.cloudfunctions.net/name) is what httpsCallable hits by
// default and CORS is automatic. v2 has known browser-CORS gotchas.

const functions = require('firebase-functions');

exports.nutrients = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    }
    const query = ((data && data.query) || '').toString().trim();
    if (!query) {
      throw new functions.https.HttpsError('invalid-argument', 'query required.');
    }
    if (query.length > 500) {
      throw new functions.https.HttpsError('invalid-argument', 'query too long.');
    }
    const appId = process.env.NUTRITIONIX_APP_ID;
    const appKey = process.env.NUTRITIONIX_APP_KEY;
    if (!appId || !appKey) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Nutritionix credentials not configured on server.'
      );
    }

    let res;
    try {
      res = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-id': appId,
          'x-app-key': appKey,
          'x-remote-user-id': context.auth.uid
        },
        body: JSON.stringify({ query })
      });
    } catch (err) {
      throw new functions.https.HttpsError(
        'unavailable',
        'Nutritionix unreachable: ' + err.message
      );
    }
    if (res.status === 404) {
      // Nutritionix returns 404 when nothing in the query parses as food.
      return {
        calories: 0,
        protein_g: 0,
        fat_g: 0,
        carbs_g: 0,
        fiber_g: 0,
        items: [],
        unmatched: true
      };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new functions.https.HttpsError(
        'internal',
        `Nutritionix error ${res.status}: ${text.slice(0, 200)}`
      );
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
