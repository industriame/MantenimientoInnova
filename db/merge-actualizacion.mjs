import fs from "node:fs";

const actualizacion = fs.readFileSync("Actualizacion App.jsx", "utf8");
const current = fs.readFileSync("app/src/App.jsx", "utf8");

function extractBetween(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  if (a < 0 || b < 0) {
    throw new Error("markers not found: " + startMarker + " / " + endMarker);
  }
  return { start: a, end: b, text: src.slice(a, b) };
}

const isEmptyStateFn = `function isEmptyState(raw) {
  if (!raw || typeof raw !== "object") return true;
  const sedes = raw.sedes;
  const usuarios = raw.usuarios;
  return (
    !(Array.isArray(sedes) && sedes.length) &&
    !(Array.isArray(usuarios) && usuarios.length)
  );
}
`;

let useSystem = extractBetween(
  current,
  "function useSystemData() {",
  "// Acciones de dominio agrupadas",
).text;

// Añadir gracia de sync al polling
if (!useSystem.includes("ultimoEscritoRef")) {
  useSystem = useSystem.replace(
    "const writeChainRef = useRef(Promise.resolve());",
    "const writeChainRef = useRef(Promise.resolve());\n  const ultimoEscritoRef = useRef(0);",
  );
  useSystem = useSystem.replace(
    "setUltimaSync(new Date());\n      setSyncError(null);\n      return true;",
    "ultimoEscritoRef.current = Date.now();\n      setUltimaSync(new Date());\n      setSyncError(null);\n      return true;",
  );
  useSystem = useSystem.replace(
    "applyLocal(draft);\n      escribiendoRef.current = true;",
    "applyLocal(draft);\n      escribiendoRef.current = true;\n      ultimoEscritoRef.current = Date.now();",
  );
}
if (!useSystem.includes("GRACIA_SYNC_MS")) {
  useSystem = useSystem.replace(
    `if (escribiendoRef.current || document.hidden) return;\n      if (flushWaitersRef.current.length) return;`,
    `if (escribiendoRef.current || document.hidden) return;\n      if (flushWaitersRef.current.length) return;\n      if (Date.now() - (ultimoEscritoRef.current || 0) < GRACIA_SYNC_MS) return;`,
  );
}

let out = actualizacion;

// Imports: storage → PostgREST client
out = out.replace(
  `import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";\nimport { storage } from "./storage";\n`,
  `import React, {\n  useState,\n  useEffect,\n  useCallback,\n  useMemo,\n  useRef,\n} from "react";\nimport { hasAppData, loadAppState, saveAppState } from "./api/db.js";\n`,
);

out = out.replace(/^const STORAGE_KEY = "ime-mantenimiento-v4";\n/m, "");

// Sustituir solo useSystemData (conserva normalizeData de Actualizacion)
const us = extractBetween(
  out,
  "function useSystemData() {",
  "// Acciones de dominio agrupadas",
);
out =
  out.slice(0, us.start) +
  isEmptyStateFn +
  "\n" +
  useSystem +
  out.slice(us.end);

// Asegurar syncError en App
out = out.replace(
  "const { data, persist, loading, ultimaSync } = useSystemData();",
  "const { data, persist, loading, ultimaSync, syncError } = useSystemData();",
);

if (!out.includes("{syncError &&")) {
  const styleNeedle =
    "<style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap'); * { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; }`}</style>";
  if (!out.includes(styleNeedle)) {
    throw new Error("style needle not found");
  }
  out = out.replace(
    styleNeedle +
      `
      {loading || !data ? (`,
    styleNeedle +
      `
      {syncError && (
        <div
          className="px-4 py-2 text-xs font-medium text-center"
          style={{ background: "#FDE8E4", color: COLORS.rojo }}
        >
          {syncError}
        </div>
      )}
      {loading || !data ? (`,
  );
}

function convertPersistCalls(code) {
  let result = "";
  let i = 0;
  while (i < code.length) {
    const idx = code.indexOf("persist(", i);
    if (idx === -1) {
      result += code.slice(i);
      break;
    }
    result += code.slice(i, idx);
    const after = code.slice(idx + "persist(".length).trimStart();
    if (
      after.startsWith("(") ||
      after.startsWith("(d)") ||
      after.startsWith("(data)")
    ) {
      result += "persist(";
      i = idx + "persist(".length;
      continue;
    }
    let j = idx + "persist(".length;
    while (j < code.length && /\s/.test(code[j])) j++;
    if (code[j] !== "{") {
      result += "persist(";
      i = idx + "persist(".length;
      continue;
    }
    let depthParen = 1;
    let k = idx + "persist(".length;
    let inStr = null;
    let escaped = false;
    for (; k < code.length; k++) {
      const c = code[k];
      if (inStr) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          continue;
        }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inStr = c;
        continue;
      }
      if (c === "(") depthParen++;
      else if (c === ")") {
        depthParen--;
        if (depthParen === 0) break;
      }
    }
    const inner = code.slice(idx + "persist(".length, k);
    const trimmed = inner.trim();
    if (trimmed.startsWith("{") && /\.\.\.\s*data\b/.test(trimmed)) {
      result += `persist((data) => (${trimmed}))`;
    } else {
      result += `persist(${inner})`;
    }
    i = k + 1;
  }
  return result;
}

out = convertPersistCalls(out);

fs.writeFileSync("app/src/App.jsx", out);

const checks = {
  lines: out.split("\n").length,
  api: out.includes("./api/db.js"),
  storage: out.includes("./storage"),
  STORAGE_KEY: /\bSTORAGE_KEY\b/.test(out),
  TIPOS_PROVEEDOR: out.includes("TIPOS_PROVEEDOR"),
  procedimientoPasos: out.includes("procedimientoPasos"),
  saveAppState: out.includes("saveAppState"),
  syncError: out.includes("syncError"),
  por_aprobar: out.includes("por_aprobar"),
  normalizeDetalle: out.includes("tipoProveedor"),
  stale: (out.match(/persist\(\{\s*\.\.\.\s*data/g) || []).length,
  functional: (out.match(/persist\(\(data\)\s*=>/g) || []).length,
};
console.log(checks);
if (!checks.api || checks.storage || !checks.TIPOS_PROVEEDOR || !checks.saveAppState) {
  process.exit(1);
}
