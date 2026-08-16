/**
 * Cliente PostgREST / Supabase para el estado de la app.
 * RPCs: has_app_data, get_app_state, put_app_state (schema api)
 *
 * Local:  VITE_POSTGREST_URL=/rest  (proxy Vite → PostgREST :3000)
 * Supabase:
 *   VITE_POSTGREST_URL=https://TU_REF.supabase.co/rest/v1
 *   VITE_SUPABASE_ANON_KEY=eyJ...
 */

const BASE = (import.meta.env.VITE_POSTGREST_URL || "/rest").replace(/\/$/, "");
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

function headers() {
  const h = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (ANON_KEY) {
    h.apikey = ANON_KEY;
    h.Authorization = `Bearer ${ANON_KEY}`;
  }
  return h;
}

async function rpc(name, body) {
  const res = await fetch(`${BASE}/rpc/${name}`, {
    method: "POST",
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PostgREST ${name}: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** @returns {Promise<boolean>} */
export async function hasAppData() {
  return rpc("has_app_data");
}

/** @returns {Promise<object>} documento camelCase de la app */
export async function loadAppState() {
  return rpc("get_app_state");
}

/** @param {object} data documento completo de la app */
export async function saveAppState(data) {
  return rpc("put_app_state", { payload: data });
}
