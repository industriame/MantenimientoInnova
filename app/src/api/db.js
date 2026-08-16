/**
 * Cliente PostgREST para el estado de la app.
 * Usa RPC atómicos: get_app_state / put_app_state / has_app_data
 * (las tablas viven en el schema `data`; ver db/init.sql)
 */

const BASE = (import.meta.env.VITE_POSTGREST_URL || "/rest").replace(/\/$/, "");

async function rpc(name, body) {
  const res = await fetch(`${BASE}/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
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
