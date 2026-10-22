// HTTP helpers shared by the Edge Functions (no imports, so they can be tested with the app's test runner).

export const CORS = {
  'Access-Control-Allow-Origin': 'https://eric-yeah.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
