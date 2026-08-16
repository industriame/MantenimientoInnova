#!/usr/bin/env node
/**
 * Llena ime_mantenimiento con los datos de prueba (mismo seed que App.jsx).
 *
 * Uso:
 *   node db/seed.mjs
 *
 * Variables opcionales:
 *   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=ime_mantenimiento
 */

import { spawnSync } from "node:child_process";

const PRESUPUESTO_MENSUAL_SEDE = 100;
const FEE_SERVICIO_SEDE = 450;

const CATEGORIAS_BASE = [
  "HERRAJERIA",
  "CARPINTERIA",
  "CANALETAS",
  "PUERTAS PRINCIPALES DE INGRESO VEHICULAR",
  "EQUIPOS MENORES",
  "CERCA ELECTRICA",
  "SEGURIDAD FISICA",
  "SISTEMA CONTRA INCENDIOS",
  "ALARMAS",
  "SISTEMA HIDRAULICOS Y SANITARIOS",
  "BEBEDEROS",
  "CESPED SINTÉTICO",
  "CANCHAS DEPORTIVAS",
  "JUEGOS INFANTILES",
  "CUBIERTA",
  "FUMIGACION DE MATAMALEZAS",
  "SOPORTE DE TVS",
  "TVS",
  "UPS",
  "ALUMINIO Y VIDRIO",
  "PARQUEADEROS",
];

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fmtHora = (d) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function flattenActivos(sedes) {
  const out = [];
  for (const sede of sedes || []) {
    for (const fase of sede.fases || []) {
      for (const act of fase.activos || []) {
        out.push({
          sedeId: sede.id,
          sedeNombre: sede.nombre,
          faseId: fase.id,
          faseNombre: fase.nombre,
          activoId: act.id,
          activoNombre: act.nombre,
        });
      }
    }
  }
  return out;
}

function seedData() {
  const sedeDefs = [
    {
      nombre: "Quitumbe",
      estudiantes: 820,
      constructor: "Constructora Andina S.A.",
      fases: ["Fase 1", "Fase 2"],
      activos: [
        ["Aula 101", "Comedor", "Baños PB"],
        ["Canchas", "Laboratorio"],
      ],
    },
    {
      nombre: "Calderón",
      estudiantes: 640,
      constructor: "Constructora Andina S.A.",
      fases: ["Fase 1", "Fase 2"],
      activos: [
        ["Aula 201", "Comedor", "Baños PB"],
        ["Canchas", "Sala de Cómputo"],
      ],
    },
    {
      nombre: "Pomasqui",
      estudiantes: 510,
      constructor: "Edifica Cía. Ltda.",
      fases: ["Fase 1"],
      activos: [["Aula 301", "Comedor", "Biblioteca", "Canchas"]],
    },
    {
      nombre: "Valle de los Chillos",
      estudiantes: 730,
      constructor: "Edifica Cía. Ltda.",
      fases: ["Fase 1", "Fase 2"],
      activos: [
        ["Aula 401", "Comedor"],
        ["Auditorio", "Canchas", "Baños PB"],
      ],
    },
  ];

  const sedes = sedeDefs.map((s) => ({
    id: uid("sede"),
    nombre: s.nombre,
    estudiantes: s.estudiantes,
    presupuestoPreventivo: PRESUPUESTO_MENSUAL_SEDE,
    feeServicio: FEE_SERVICIO_SEDE,
    constructor: s.constructor,
    fases: s.fases.map((f, fi) => ({
      id: uid("fase"),
      nombre: f,
      activos: (s.activos[fi] || []).map((a) => ({
        id: uid("act"),
        nombre: a,
      })),
    })),
  }));

  const usuarios = [
    {
      id: uid("usr"),
      nombre: "Luis Zambrano",
      rol: "admin",
      clave: "admin2026",
      sedeIds: [],
    },
    {
      id: uid("usr"),
      nombre: "Innova Schools (Dirección)",
      rol: "cliente",
      clave: "innova2026",
      sedeIds: [],
    },
    {
      id: uid("usr"),
      nombre: "Cristian Vargas",
      rol: "tecnico",
      clave: "campo2026",
      sedeIds: [sedes[0].id, sedes[1].id],
    },
    {
      id: uid("usr"),
      nombre: "Juan",
      rol: "tecnico",
      clave: "juan2026",
      sedeIds: [sedes[2].id, sedes[3].id],
    },
    {
      id: uid("usr"),
      nombre: "Patricia Mejía",
      rol: "solicitante",
      clave: "quitumbe26",
      sedeIds: [sedes[0].id],
    },
    {
      id: uid("usr"),
      nombre: "Andrea Castro",
      rol: "solicitante",
      clave: "calderon26",
      sedeIds: [sedes[1].id],
    },
  ];
  const cristian = usuarios[2];
  const juan = usuarios[3];
  const patricia = usuarios[4];
  const andrea = usuarios[5];

  const flat = flattenActivos(sedes);
  const dias = (n) => fmtDate(new Date(Date.now() + n * 86400000));

  const planDefs = [
    {
      tarea: "Revisión de luminarias",
      cat: "EQUIPOS MENORES",
      frec: "Mensual",
      dur: [30, "minutos"],
      proc: "1. Verificar cada luminaria.\n2. Reemplazar focos quemados.\n3. Limpiar difusores.\n4. Registrar cambios.",
    },
    {
      tarea: "Limpieza de canaletas",
      cat: "CANALETAS",
      frec: "Trimestral",
      dur: [45, "minutos"],
      proc: "1. Retirar hojas y sedimento.\n2. Verificar obstrucciones y fugas.\n3. Confirmar caída de agua libre.",
    },
    {
      tarea: "Chequeo de grifería",
      cat: "SISTEMA HIDRAULICOS Y SANITARIOS",
      frec: "Mensual",
      dur: [20, "minutos"],
      proc: "1. Revisar llaves y sifones.\n2. Ajustar o cambiar empaques.\n3. Verificar presión y drenaje.",
    },
    {
      tarea: "Revisión de extintores",
      cat: "SISTEMA CONTRA INCENDIOS",
      frec: "Trimestral",
      dur: [20, "minutos"],
      proc: "1. Verificar presión del manómetro.\n2. Revisar fecha de recarga.\n3. Confirmar señalización y acceso.",
    },
    {
      tarea: "Inspección de cubierta",
      cat: "CUBIERTA",
      frec: "Semestral",
      dur: [2, "horas"],
      proc: "1. Revisar planchas y fijaciones.\n2. Buscar filtraciones u óxido.\n3. Registrar hallazgos con foto.",
    },
  ];

  const planes = planDefs.map((p, i) => {
    const aplic = [flat[i % flat.length], flat[(i + 4) % flat.length]]
      .filter(Boolean)
      .map((a, k) => ({
        sedeId: a.sedeId,
        faseId: a.faseId,
        activoId: a.activoId,
        fechaInicial: dias(-(60 + i * 12 + k * 5)),
      }));
    return {
      id: uid("plan"),
      tarea: p.tarea,
      procedimiento: p.proc,
      categoria: p.cat,
      frecuencia: p.frec,
      duracionValor: p.dur[0],
      duracionUnidad: p.dur[1],
      aplicaciones: aplic,
    };
  });

  const ordenes = [];
  const mkOT = (n, plan, ap, estado, fecha, tecnicoId, mats, matEstado) => ({
    id: uid("ot"),
    codigo: `OT-${String(n).padStart(4, "0")}`,
    planId: plan.id,
    tarea: plan.tarea,
    procedimiento: plan.procedimiento,
    categoria: plan.categoria,
    frecuencia: plan.frecuencia,
    duracionValor: plan.duracionValor,
    duracionUnidad: plan.duracionUnidad,
    sedeId: ap.sedeId,
    faseId: ap.faseId,
    activoId: ap.activoId,
    tecnicoId,
    fechaProgramada: fecha,
    fechaCompletada: estado === "completada" ? fecha : "",
    estado,
    observaciones: "",
    foto: "",
    materiales: mats || [],
    materialesEstado: matEstado || "",
    consumos: [],
    createdAt: fecha,
  });

  const ot1 = mkOT(
    1,
    planes[0],
    planes[0].aplicaciones[0],
    "completada",
    dias(-25),
    cristian.id,
    [],
    "",
  );
  ot1.consumos = [
    {
      id: uid("con"),
      stockId: "",
      nombre: "Foco LED 18W",
      unidad: "u",
      cantidad: 4,
      costoUnitario: 4.5,
      fecha: dias(-25),
    },
  ];
  ordenes.push(ot1);
  ordenes.push(
    mkOT(2, planes[1], planes[1].aplicaciones[0], "completada", dias(-18), cristian.id, [], ""),
  );
  ordenes.push(
    mkOT(3, planes[2], planes[2].aplicaciones[0], "en_proceso", dias(0), cristian.id, [
      { id: uid("mat"), nombre: "Empaque de grifería", cantidad: 6, unidad: "u", costoUnitario: 1.2 },
    ], "pendiente_aprobacion"),
  );
  ordenes.push(
    mkOT(4, planes[3], planes[3].aplicaciones[1], "programada", dias(4), juan.id, [], ""),
  );

  const solDefs = [
    {
      act: 0,
      sol: patricia.id,
      desc: "Foco quemado en el aula, afecta visibilidad en la tarde.",
      crit: "media",
      estado: "pendiente",
      d: -1,
    },
    {
      act: 1,
      sol: patricia.id,
      desc: "Grifo del comedor gotea constantemente.",
      crit: "alta",
      estado: "en_proceso",
      d: -4,
      prog: 0,
      tec: cristian.id,
      mats: [
        { id: uid("mat"), nombre: 'Llave de paso 1/2"', cantidad: 1, unidad: "u", costoUnitario: 12 },
      ],
      matEstado: "pendiente_aprobacion",
    },
    {
      act: 2,
      sol: patricia.id,
      desc: "Puerta de baño con bisagra suelta.",
      crit: "baja",
      estado: "completada",
      d: -12,
      cierre: 3,
      calif: 5,
      tec: cristian.id,
      mats: [
        { id: uid("mat"), nombre: 'Bisagra 3"', cantidad: 2, unidad: "u", costoUnitario: 3.25 },
      ],
      matEstado: "aprobado",
    },
    {
      act: 5,
      sol: andrea.id,
      desc: "Tomacorriente sin funcionar en sala de cómputo.",
      crit: "critico",
      estado: "pendiente",
      d: 0,
    },
    {
      act: 6,
      sol: andrea.id,
      desc: "Mancha de humedad en el techo.",
      crit: "media",
      estado: "programada",
      d: -6,
      prog: 0,
      tec: cristian.id,
    },
    {
      act: 4,
      sol: patricia.id,
      desc: "Malla de la cancha con rotura.",
      crit: "",
      estado: "pendiente",
      d: -9,
    },
    {
      act: 3,
      sol: andrea.id,
      desc: "Cerradura del aula no cierra bien.",
      crit: "media",
      estado: "completada",
      d: -3,
      cierre: 3,
      prog: -1,
      tec: cristian.id,
      mats: [
        { id: uid("mat"), nombre: "Cerradura pomo", cantidad: 1, unidad: "u", costoUnitario: 14 },
      ],
      matEstado: "aprobado",
    },
  ];

  const solicitudes = solDefs.map((s, i) => {
    const a = flat[s.act % flat.length];
    const f = new Date(Date.now() + s.d * 86400000);
    return {
      id: uid("sol"),
      codigo: `SOL-${String(i + 1).padStart(4, "0")}`,
      sedeId: a.sedeId,
      faseId: a.faseId,
      activoId: a.activoId,
      descripcion: s.desc,
      criticidad: s.crit,
      solicitanteId: s.sol,
      fecha: fmtDate(f),
      hora: fmtHora(f),
      estado: s.estado,
      tecnicoId: s.tec || "",
      fechaProgramada: s.tec ? dias(s.prog ?? s.d) : "",
      fechaCompletada:
        s.estado === "completada" ? dias(s.d + (s.cierre ?? 2)) : "",
      horaCompletada: s.estado === "completada" ? s.horaCierre || "15:30" : "",
      observaciones: "",
      foto: "",
      resolucion:
        s.estado === "completada" ? "Se ajustó y lubricó la bisagra." : "",
      materiales: s.mats || [],
      materialesEstado: s.matEstado || "",
      calificacion: s.calif || 0,
      comentarioCalif: "",
    };
  });

  const stockBase = [
    ["Foco LED 18W", "u", 24, 4.5, 6],
    ["Empaque de grifería", "u", 40, 1.2, 10],
    ["Silicona sanitaria", "tubo", 8, 6.8, 3],
    ["Cinta teflón", "rollo", 15, 0.9, 5],
    ['Bisagra 3"', "u", 12, 3.25, 4],
    ["Pintura látex blanco", "galón", 5, 22.0, 2],
  ];
  const stock = [];
  sedes.forEach((sd, si) => {
    stockBase.forEach((b, bi) => {
      stock.push({
        id: uid("stk"),
        sedeId: sd.id,
        nombre: b[0],
        unidad: b[1],
        cantidad: Math.max(0, b[2] - si * 3 - bi),
        costoUnitario: b[3],
        minimo: b[4],
      });
    });
  });

  const servicios = [
    {
      id: uid("srv"),
      codigo: "SRV-0001",
      sedeId: flat[0].sedeId,
      faseId: flat[0].faseId,
      activoId: flat[0].activoId,
      trabajo: "Mantenimiento y recarga de sistema de aire acondicionado",
      proveedor: "Clima Andino S.A.",
      presupuesto: 180,
      fecha: dias(-8),
      estado: "programada",
      observaciones: "",
    },
    {
      id: uid("srv"),
      codigo: "SRV-0002",
      sedeId: flat[6].sedeId,
      faseId: flat[6].faseId,
      activoId: flat[6].activoId,
      trabajo: "Certificación anual de sistema contra incendios",
      proveedor: "Fire Tech Ecuador",
      presupuesto: 240,
      fecha: dias(12),
      estado: "programada",
      observaciones: "",
    },
  ];

  return {
    sedes,
    usuarios,
    planes,
    ordenes,
    solicitudes,
    servicios,
    stock,
    categorias: CATEGORIAS_BASE,
    otCounter: ordenes.length + 1,
    solCounter: solicitudes.length + 1,
    srvCounter: servicios.length + 1,
    resumenesMes: {},
  };
}

const host = process.env.PGHOST || "127.0.0.1";
const port = process.env.PGPORT || "5432";
const user = process.env.PGUSER || "postgres";
const password = process.env.PGPASSWORD || "postgres";
const database = process.env.PGDATABASE || "ime_mantenimiento";

const payload = seedData();
const json = JSON.stringify(payload);
const sql = `SELECT api.put_app_state($seed$${json}$seed$::jsonb) IS NOT NULL AS ok;\n`;

const result = spawnSync(
  "psql",
  ["-h", host, "-p", port, "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sql],
  {
    env: { ...process.env, PGPASSWORD: password },
    encoding: "utf8",
  },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "Error al ejecutar psql");
  console.error("\nAsegúrate de haber corrido antes: psql ... -f db/init.sql");
  process.exit(result.status || 1);
}

console.log(result.stdout.trim());
console.log("\nDatos de prueba cargados.");
console.log("Usuarios:");
for (const u of payload.usuarios) {
  console.log(`  - ${u.nombre} (${u.rol}): ${u.clave}`);
}
