import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  QrCode,
  Wrench,
  ClipboardList,
  BarChart3,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Building2,
  Layers,
  Users,
  ShieldCheck,
  ArrowLeft,
  Download,
  Send,
  Trash2,
  Pencil,
  CalendarDays,
  Filter,
  KeyRound,
  Eye,
  EyeOff,
  Camera,
  LogOut,
  TrendingUp,
  Wallet,
  Star,
  Info,
  RefreshCw,
  FileText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { hasAppData, loadAppState, saveAppState } from "./api/db.js";

/* ============================================================================
   1. CONFIGURACIÓN Y CONSTANTES
   ========================================================================= */

const PRESUPUESTO_MENSUAL_SEDE = 100; // USD/mes por sede — solo materiales
const FEE_SERVICIO_SEDE = 450; // USD/mes — nuestro honorario por sede
// Escala de los medidores (días). MTBF: más alto es mejor. MTTR: más bajo es mejor.
const GAUGE_MAX_DIAS = 15;
const colorMTBF = (v) =>
  v === null
    ? COLORS.slate
    : v >= 7
      ? COLORS.verde
      : v >= 3
        ? COLORS.ambar
        : COLORS.rojo;
const colorCumpl = (p) =>
  p === null
    ? COLORS.slate
    : p >= 80
      ? COLORS.verde
      : p >= 50
        ? COLORS.ambar
        : COLORS.rojo;
const colorMTTR = (v) =>
  v === null
    ? COLORS.slate
    : v <= 3
      ? COLORS.verde
      : v <= 7
        ? COLORS.ambar
        : COLORS.rojo;

const COLORS = {
  charcoal: "#35383C",
  charcoalLight: "#4A4E54",
  orange: "#ED5B23",
  cream: "#F5F3EE",
  paper: "#FBFAF7",
  slate: "#787D85",
  line: "#E3E0D8",
  rojo: "#C1442D",
  ambar: "#D9A441",
  verde: "#2E7D5B",
  vino: "#7A1F1F",
};

// --- Roles: el tipo de usuario Y el permiso son lo mismo ---
const ROLES = {
  solicitante: {
    label: "Solicitante",
    desc: "Reporta novedades de su sede",
    color: COLORS.orange,
    sedes: "una",
  },
  tecnico: {
    label: "Técnico de Mantenimiento",
    desc: "Ejecuta actividades en sus sedes",
    color: COLORS.charcoal,
    sedes: "varias",
  },
  admin: {
    label: "Supervisor Administrador",
    desc: "Control total del sistema",
    color: COLORS.verde,
    sedes: "todas",
  },
  cliente: {
    label: "Cliente",
    desc: "Revisa y aprueba costos, sin edición",
    color: "#3B6EA5",
    sedes: "todas",
  },
};
const ROL_IDS = Object.keys(ROLES);
const rolDe = (u) => ROLES[u?.rol] || ROLES.solicitante;

// --- Estados de actividad (comunes a preventivo y correctivo) ---
const cSlate = { color: COLORS.slate };
const cChar = { color: COLORS.charcoal };
const cOrange = { color: COLORS.orange };
const bLine = { borderColor: COLORS.line };
const cardStyle = { borderColor: COLORS.line, background: "white" };

const ESTADOS = {
  pendiente: { label: "Pendiente", color: COLORS.slate },
  programada: { label: "Programada", color: COLORS.ambar },
  en_proceso: { label: "En proceso", color: COLORS.orange },
  completada: { label: "Completada", color: COLORS.verde },
};
const ESTADOS_EJECUCION = ["programada", "en_proceso", "completada"];

// --- Criticidad (solo correctivos) ---
const CRITICIDAD = {
  critico: { label: "Crítico", color: COLORS.vino, nivel: 4 },
  alta: { label: "Alta", color: COLORS.rojo, nivel: 3 },
  media: { label: "Media", color: COLORS.ambar, nivel: 2 },
  baja: { label: "Baja", color: COLORS.verde, nivel: 1 },
};
const CRITICIDAD_IDS = ["critico", "alta", "media", "baja"];

// --- Flujo de materiales / costos ---
const MAT_ESTADO = {
  borrador: { label: "En elaboración", color: COLORS.slate },
  pendiente_costeo: { label: "Pendiente de costeo", color: COLORS.ambar },
  pendiente_aprobacion: {
    label: "Pendiente de aprobación",
    color: COLORS.orange,
  },
  en_espera: { label: "En espera", color: "#3B6EA5" },
  aprobado: { label: "Aprobado", color: COLORS.verde },
  rechazado: { label: "Rechazado", color: COLORS.rojo },
};

const FRECUENCIAS = ["Mensual", "Trimestral", "Semestral", "Anual"];
const FRECUENCIA_DIAS = {
  Mensual: 30,
  Trimestral: 90,
  Semestral: 180,
  Anual: 365,
};
const DURACION_UNIDADES = [
  ["minutos", "min"],
  ["horas", "horas"],
  ["dias", "días"],
];

const SEMAFORO = {
  0: { label: "Sin historial", color: COLORS.slate, nivel: 0 },
  1: { label: "Al día", color: COLORS.verde, nivel: 1 },
  2: { label: "Por vencer", color: COLORS.ambar, nivel: 2 },
  3: { label: "Vencido", color: COLORS.rojo, nivel: 3 },
  4: { label: "Muy vencido", color: COLORS.vino, nivel: 4 },
};

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

const SEDE_PALETTE = [
  "#ED5B23",
  "#2E7D5B",
  "#3B6EA5",
  "#8B5CF6",
  "#C1442D",
  "#D9A441",
  "#0891B2",
  "#BE185D",
];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

/* ============================================================================
   2. UTILIDADES BÁSICAS
   ========================================================================= */

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fmtHora = (d) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const mesKey = (fechaISO) => (fechaISO || "").slice(0, 7); // 'YYYY-MM'
const mesLabel = (key) => {
  if (!key) return "—";
  const [y, m] = key.split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
};
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// Horas entre dos marcas fecha+hora. Si falta la hora asume 00:00.
const horasEntre = (f1, h1, f2, h2) => {
  if (!f1 || !f2) return 0;
  const a = new Date(`${f1}T${h1 || "00:00"}:00`);
  const b = new Date(`${f2}T${h2 || "00:00"}:00`);
  return (b - a) / 3600000;
};

// Texto legible de una duración expresada en días fraccionarios
const duracionTexto = (dias) => {
  if (dias === null || dias === undefined) return "—";
  const h = dias * 24;
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${dias.toFixed(1)} d`;
};

/* === 3. MODELO DE DATOS (espejo del Google Sheet) =========================
   sedes · usuarios · planes · ordenes(OT) · solicitudes(SOL) · servicios(SRV)
   Regla: nunca se guarda un nombre de persona, siempre el id de usuario.
   Detalle completo en arquitectura-datos.md
   ======================================================================== */

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
  const admin = usuarios[0],
    cristian = usuarios[2],
    juan = usuarios[3];
  const patricia = usuarios[4],
    andrea = usuarios[5];

  const flat = flattenActivos(sedes);
  const hoy = new Date();
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

  // Órdenes preventivas: algunas completadas (dan historial + costo), una en curso
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
    mkOT(
      2,
      planes[1],
      planes[1].aplicaciones[0],
      "completada",
      dias(-18),
      cristian.id,
      [],
      "",
    ),
  );
  ordenes.push(
    mkOT(
      3,
      planes[2],
      planes[2].aplicaciones[0],
      "en_proceso",
      dias(0),
      cristian.id,
      [
        {
          id: uid("mat"),
          nombre: "Empaque de grifería",
          cantidad: 6,
          unidad: "u",
          costoUnitario: 1.2,
        },
      ],
      "pendiente_aprobacion",
    ),
  );
  ordenes.push(
    mkOT(
      4,
      planes[3],
      planes[3].aplicaciones[1],
      "programada",
      dias(4),
      juan.id,
      [],
      "",
    ),
  );

  // Solicitudes correctivas
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
        {
          id: uid("mat"),
          nombre: 'Llave de paso 1/2"',
          cantidad: 1,
          unidad: "u",
          costoUnitario: 12,
        },
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
        {
          id: uid("mat"),
          nombre: 'Bisagra 3"',
          cantidad: 2,
          unidad: "u",
          costoUnitario: 3.25,
        },
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
        {
          id: uid("mat"),
          nombre: "Cerradura pomo",
          cantidad: 1,
          unidad: "u",
          costoUnitario: 14,
        },
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

  /* Stock por sede: insumos de uso frecuente ya comprados. El técnico los
     consume en preventivos sin pasar por aprobación; el consumo descuenta
     existencias y carga el valor al presupuesto de la sede. */
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

  // Servicios externos de especialidad (presupuesto digitado a mano)
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
  };
}

/* ============================================================================
   4. LÓGICA DE DOMINIO  (funciones puras — trasladables a Apps Script)
   ========================================================================= */

// --- Jerarquía ---
function flattenActivos(sedes) {
  const out = [];
  (sedes || []).forEach((sede) =>
    (sede.fases || []).forEach((fase) =>
      (fase.activos || []).forEach((act) =>
        out.push({
          sedeId: sede.id,
          sedeNombre: sede.nombre,
          faseId: fase.id,
          faseNombre: fase.nombre,
          activoId: act.id,
          activoNombre: act.nombre,
        }),
      ),
    ),
  );
  return out;
}

function ubicacionTexto(sedes, { sedeId, faseId, activoId }) {
  const sede = (sedes || []).find((s) => s.id === sedeId);
  if (!sede) return "—";
  const fase = (sede.fases || []).find((f) => f.id === faseId);
  if (!fase) return `Sede completa · ${sede.nombre}`;
  const act = (fase.activos || []).find((a) => a.id === activoId);
  if (!act) return `${fase.nombre} completa · ${sede.nombre}`;
  return `${act.nombre} · ${fase.nombre} · ${sede.nombre}`;
}

const sedeNombre = (sedes, id) =>
  (sedes || []).find((s) => s.id === id)?.nombre || "—";
const sedeColor = (sedes, id) => {
  const i = (sedes || []).findIndex((s) => s.id === id);
  return SEDE_PALETTE[i >= 0 ? i % SEDE_PALETTE.length : 0];
};

// --- Usuarios ---
const usuarioNombre = (usuarios, id) =>
  (usuarios || []).find((u) => u.id === id)?.nombre || "Sin asignar";
const tecnicosDeSede = (usuarios, sedeId) =>
  (usuarios || []).filter(
    (u) => u.rol === "tecnico" && (u.sedeIds || []).includes(sedeId),
  );
// Sedes visibles según rol: admin y cliente ven todas
const sedesVisibles = (data, user) =>
  user.rol === "admin" || user.rol === "cliente"
    ? data.sedes
    : data.sedes.filter((s) => (user.sedeIds || []).includes(s.id));

// --- Costos: el costo SIEMPRE es la suma de materiales aprobados ---
function costoAprobado(item) {
  if (!item || item.materialesEstado !== "aprobado") return 0;
  return (item.materiales || []).reduce(
    (s, m) => s + (Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0),
    0,
  );
}
/* Consumo de stock: se carga al presupuesto de inmediato, sin aprobación,
   porque el material ya estaba comprado y en bodega. */
function costoConsumos(item) {
  return (item?.consumos || []).reduce(
    (s, c) => s + (Number(c.cantidad) || 0) * (Number(c.costoUnitario) || 0),
    0,
  );
}

function costoEstimado(item) {
  return (item?.materiales || []).reduce(
    (s, m) => s + (Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0),
    0,
  );
}
// Mes contable de una actividad: cuando se completó, si no cuando está programada
const mesContable = (item) =>
  mesKey(item.fechaCompletada || item.fechaProgramada || item.fecha);

/* --- PRESUPUESTO: gastado = aprobado; comprometido = en costeo/aprobación/
   espera; proyección = extrapolación por avance del mes. Servicios aparte. --- */
const MAT_COMPROMETIDOS = [
  "pendiente_costeo",
  "pendiente_aprobacion",
  "en_espera",
];

const presupuestoDeSede = (data, sedeId) => {
  const s = (data.sedes || []).find((x) => x.id === sedeId);
  return Number(s?.presupuestoPreventivo ?? PRESUPUESTO_MENSUAL_SEDE) || 0;
};

function actividadesDeSedeMes(data, sedeId, mes) {
  const todas = [...(data.ordenes || []), ...(data.solicitudes || [])];
  return todas.filter((a) => a.sedeId === sedeId && mesContable(a) === mes);
}

const serviciosDeSedeMes = (data, sedeId, mes) =>
  (data.servicios || []).filter(
    (s) => s.sedeId === sedeId && mesKey(s.fecha) === mes,
  );

function presupuestoSedeMes(data, sedeId, mes) {
  const acts = actividadesDeSedeMes(data, sedeId, mes);
  const gastado = acts.reduce(
    (s, a) => s + costoAprobado(a) + costoConsumos(a),
    0,
  );
  const comprometido = acts
    .filter((a) => MAT_COMPROMETIDOS.includes(a.materialesEstado))
    .reduce((s, a) => s + costoEstimado(a), 0);

  const servicios = serviciosDeSedeMes(data, sedeId, mes);
  const costoServicios = servicios.reduce(
    (s, x) => s + (Number(x.presupuesto) || 0),
    0,
  );

  const presupuesto = presupuestoDeSede(data, sedeId);
  const disponible = presupuesto - gastado - comprometido;
  const pct = presupuesto > 0 ? (gastado / presupuesto) * 100 : 0;
  const pctConComprometido =
    presupuesto > 0 ? ((gastado + comprometido) / presupuesto) * 100 : 0;

  // Proyección: solo tiene sentido para el mes en curso
  const hoy = new Date();
  const esMesActual = mes === mesKey(fmtDate(hoy));
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const avanceMes = esMesActual ? hoy.getDate() / diasMes : 1;
  const proyeccion = avanceMes > 0 ? gastado / avanceMes : gastado;

  let estado = "ok";
  if (gastado + comprometido > presupuesto) estado = "excedido";
  else if (
    pctConComprometido >= 80 ||
    (esMesActual && proyeccion > presupuesto)
  )
    estado = "riesgo";

  return {
    sedeId,
    mes,
    presupuesto,
    gastado,
    comprometido,
    disponible,
    costoServicios,
    servicios: servicios.length,
    pct,
    pctConComprometido,
    proyeccion,
    esMesActual,
    avanceMes,
    estado,
    actividades: acts.length,
  };
}

function presupuestoGlobalMes(data, mes) {
  const porSede = (data.sedes || []).map((s) => ({
    ...presupuestoSedeMes(data, s.id, mes),
    nombre: s.nombre,
  }));
  const suma = (k) => porSede.reduce((acc, p) => acc + p[k], 0);
  const presupuesto = suma("presupuesto");
  const gastado = suma("gastado");
  const comprometido = suma("comprometido");
  return {
    mes,
    porSede,
    presupuesto,
    gastado,
    comprometido,
    costoServicios: suma("costoServicios"),
    disponible: presupuesto - gastado - comprometido,
    pct: presupuesto > 0 ? (gastado / presupuesto) * 100 : 0,
    excedidas: porSede.filter((p) => p.estado === "excedido").length,
    enRiesgo: porSede.filter((p) => p.estado === "riesgo").length,
  };
}

/* --- KPIs: MTBF = días ÷ nº correctivos; MTTR = promedio de días de cierre;
   costo/estudiante = (preventivo + correctivo + servicios) ÷ estudiantes --- */
function indicadoresMes(data, sedeIds, mes) {
  const enMes = (f) => mesKey(f) === mes;
  const correctivos = (data.solicitudes || []).filter(
    (s) => sedeIds.includes(s.sedeId) && enMes(s.fecha),
  );

  // Días de exposición: si es el mes en curso, solo los días transcurridos
  const hoy = new Date();
  const [y, m] = mes.split("-").map(Number);
  const diasDelMes = new Date(y, m, 0).getDate();
  const esMesActual = mes === mesKey(fmtDate(hoy));
  const diasTranscurridos = esMesActual ? hoy.getDate() : diasDelMes;

  const nFallas = correctivos.length;
  const mtbf = nFallas > 0 ? diasTranscurridos / nFallas : null;

  // MTTR con precisión de horas: usa fecha+hora de apertura y de cierre
  const cerrados = correctivos.filter(
    (s) => s.estado === "completada" && s.fechaCompletada && s.fecha,
  );
  const mttr =
    cerrados.length > 0
      ? cerrados.reduce(
          (acc, s) =>
            acc +
            Math.max(
              0,
              horasEntre(s.fecha, s.hora, s.fechaCompletada, s.horaCompletada) /
                24,
            ),
          0,
        ) / cerrados.length
      : null;

  /* Costos del mes.
     Costo por estudiante = fee de servicio + materiales + servicios externos.
     El presupuesto mensual de $100/sede aplica SOLO a materiales. */
  let costoFee = 0,
    costoPreventivo = 0,
    costoCorrectivo = 0,
    costoServicios = 0;
  let estudiantes = 0;
  sedeIds.forEach((id) => {
    const sede = (data.sedes || []).find((s) => s.id === id);
    (data.ordenes || []).forEach((o) => {
      if (o.sedeId === id && mesContable(o) === mes)
        costoPreventivo += costoAprobado(o) + costoConsumos(o);
    });
    (data.solicitudes || []).forEach((x) => {
      if (x.sedeId === id && mesContable(x) === mes)
        costoCorrectivo += costoAprobado(x) + costoConsumos(x);
    });
    costoServicios += serviciosDeSedeMes(data, id, mes).reduce(
      (a, x) => a + (Number(x.presupuesto) || 0),
      0,
    );
    costoFee += Number(sede?.feeServicio) || 0;
    estudiantes += Number(sede?.estudiantes) || 0;
  });

  const costoMateriales = costoPreventivo + costoCorrectivo;
  const costoTotal = costoFee + costoMateriales + costoServicios;
  const costoPorEstudiante = estudiantes > 0 ? costoTotal / estudiantes : null;

  return {
    mes,
    nFallas,
    diasTranscurridos,
    diasDelMes,
    mtbf,
    mttr,
    cerrados: cerrados.length,
    costoFee,
    costoPreventivo,
    costoCorrectivo,
    costoMateriales,
    costoServicios,
    costoTotal,
    estudiantes,
    costoPorEstudiante,
  };
}

/* Avance del plan de mantenimiento: estado de cada aplicación de plan en las
   sedes dadas. Sirve para medir cumplimiento del programa preventivo. */
function avancePlan(data, sedeIds) {
  const cats = {
    ejecucion: 0,
    alDia: 0,
    porVencer: 0,
    vencido: 0,
    muyVencido: 0,
  };
  let total = 0;

  (data.planes || []).forEach((plan) => {
    (plan.aplicaciones || []).forEach((ap) => {
      if (!sedeIds.includes(ap.sedeId)) return;
      total++;
      const rel = (data.ordenes || []).filter(
        (o) =>
          o.planId === plan.id &&
          o.sedeId === ap.sedeId &&
          o.faseId === ap.faseId &&
          o.activoId === ap.activoId,
      );
      if (
        rel.some((o) => o.estado === "programada" || o.estado === "en_proceso")
      ) {
        cats.ejecucion++;
        return;
      }
      const ultima = rel
        .filter((o) => o.estado === "completada")
        .sort((a, b) => (a.fechaCompletada < b.fechaCompletada ? 1 : -1))[0];
      const sem = semaforoPreventivo({
        frecuencia: plan.frecuencia,
        fechaInicial: ap.fechaInicial,
        ultimoMantenimiento: ultima?.fechaCompletada || null,
      });
      if (sem.nivel <= 1) cats.alDia++;
      else if (sem.nivel === 2) cats.porVencer++;
      else if (sem.nivel === 3) cats.vencido++;
      else cats.muyVencido++;
    });
  });

  // Cumplimiento: solo las tareas al día sobre el total del programa
  const cumplidas = cats.alDia;
  return {
    total,
    ...cats,
    cumplimiento: total > 0 ? (cumplidas / total) * 100 : null,
    datos: [
      { name: "Al día", value: cats.alDia, color: COLORS.verde },
      { name: "En ejecución", value: cats.ejecucion, color: COLORS.orange },
      { name: "Por vencer", value: cats.porVencer, color: COLORS.ambar },
      { name: "Vencido", value: cats.vencido, color: COLORS.rojo },
      { name: "Muy vencido", value: cats.muyVencido, color: COLORS.vino },
    ].filter((d) => d.value > 0),
  };
}

/* Satisfacción: promedio de las estrellas dadas por los solicitantes en las
   solicitudes ya cerradas de las sedes indicadas. */
function satisfaccion(data, sedeIds) {
  const calificadas = (data.solicitudes || []).filter(
    (s) =>
      sedeIds.includes(s.sedeId) &&
      s.estado === "completada" &&
      Number(s.calificacion) > 0,
  );
  const cerradas = (data.solicitudes || []).filter(
    (s) => sedeIds.includes(s.sedeId) && s.estado === "completada",
  ).length;

  const total = calificadas.length;
  const promedio =
    total > 0
      ? calificadas.reduce((a, s) => a + Number(s.calificacion), 0) / total
      : null;
  const dist = [5, 4, 3, 2, 1].map((n) => ({
    n,
    cant: calificadas.filter((s) => s.calificacion === n).length,
  }));
  return {
    promedio,
    total,
    cerradas,
    sinCalificar: cerradas - total,
    dist,
    comentarios: calificadas.filter((s) => s.comentarioCalif),
  };
}

/* Serie mensual del costo por estudiante. */
function serieCostoEstudiante(data, sedeIds, mesFinal, meses = 6) {
  const [y, m] = mesFinal.split("-").map(Number);
  const out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const kpi = indicadoresMes(data, sedeIds, k);
    out.push({
      mes: MESES[d.getMonth()].slice(0, 3),
      mesKey: k,
      costo:
        kpi.costoPorEstudiante !== null
          ? Number(kpi.costoPorEstudiante.toFixed(3))
          : 0,
    });
  }
  return out;
}

const ESTADO_PRESUPUESTO = {
  ok: { label: "Dentro del presupuesto", color: COLORS.verde },
  riesgo: { label: "En riesgo", color: COLORS.ambar },
  excedido: { label: "Excedido", color: COLORS.rojo },
};

// --- Semáforo de pendientes ---
function semaforoPreventivo(item) {
  const base = item.ultimoMantenimiento || item.fechaInicial;
  if (!base) return SEMAFORO[0];
  const ciclo = FRECUENCIA_DIAS[item.frecuencia] || 90;
  const transcurridos = Math.floor(
    (new Date() - new Date(`${base}T00:00:00`)) / 86400000,
  );
  const ratio = transcurridos / ciclo;
  if (ratio < 0.7) return SEMAFORO[1];
  if (ratio < 1.0) return SEMAFORO[2];
  if (ratio < 1.5) return SEMAFORO[3];
  return SEMAFORO[4];
}
const semaforoCorrectivo = (item) =>
  item.criticidad
    ? {
        label: CRITICIDAD[item.criticidad].label,
        color: CRITICIDAD[item.criticidad].color,
        nivel: CRITICIDAD[item.criticidad].nivel,
      }
    : SEMAFORO[0];
const semaforoServicio = (item) => {
  if (!item.fecha) return SEMAFORO[0];
  const dias = Math.floor(
    (new Date(`${item.fecha}T00:00:00`) - new Date()) / 86400000,
  );
  if (dias < 0) return { label: "Atrasado", color: COLORS.rojo, nivel: 4 };
  if (dias <= 7) return { label: "Esta semana", color: COLORS.ambar, nivel: 3 };
  return { label: "Programado", color: COLORS.verde, nivel: 1 };
};

const semaforoDe = (item) =>
  item.tipo === "preventivo"
    ? semaforoPreventivo(item)
    : item.tipo === "servicio"
      ? semaforoServicio(item)
      : semaforoCorrectivo(item);
const ordenarPorUrgencia = (items) =>
  [...items].sort((a, b) => semaforoDe(b).nivel - semaforoDe(a).nivel);

/* --- Pendientes: preventivo sin OT abierta (reaparece tras completarse) +
   correctivo en estado 'pendiente' --------------------------------------- */
function getPendientes(data) {
  const items = [];

  (data.planes || []).forEach((plan) => {
    (plan.aplicaciones || []).forEach((ap) => {
      const rel = (data.ordenes || []).filter(
        (o) =>
          o.planId === plan.id &&
          o.sedeId === ap.sedeId &&
          o.faseId === ap.faseId &&
          o.activoId === ap.activoId,
      );
      if (
        rel.some((o) => o.estado === "programada" || o.estado === "en_proceso")
      )
        return;
      const ultima = rel
        .filter((o) => o.estado === "completada")
        .sort((a, b) => (a.fechaCompletada < b.fechaCompletada ? 1 : -1))[0];

      items.push({
        key: `${plan.id}|${ap.sedeId}|${ap.faseId}|${ap.activoId}`,
        tipo: "preventivo",
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
        fechaInicial: ap.fechaInicial,
        ultimoMantenimiento: ultima?.fechaCompletada || null,
      });
    });
  });

  (data.servicios || []).forEach((sv) => {
    if (sv.estado === "completada") return;
    items.push({
      key: `srv|${sv.id}`,
      tipo: "servicio",
      servicioId: sv.id,
      codigo: sv.codigo,
      tarea: sv.trabajo,
      proveedor: sv.proveedor,
      presupuesto: sv.presupuesto,
      fecha: sv.fecha,
      estadoServicio: sv.estado,
      sedeId: sv.sedeId,
      faseId: sv.faseId,
      activoId: sv.activoId,
    });
  });

  (data.solicitudes || []).forEach((s) => {
    if (s.estado !== "pendiente") return;
    items.push({
      key: `sol|${s.id}`,
      tipo: "correctivo",
      solicitudId: s.id,
      codigo: s.codigo,
      tarea: s.descripcion,
      criticidad: s.criticidad,
      solicitanteId: s.solicitanteId,
      fecha: s.fecha,
      hora: s.hora,
      sedeId: s.sedeId,
      faseId: s.faseId,
      activoId: s.activoId,
    });
  });

  return items;
}

// Actividades asignadas a un técnico (preventivas + correctivas, ya programadas)
function actividadesDeTecnico(data, tecnicoId) {
  const pre = (data.ordenes || [])
    .filter((o) => o.tecnicoId === tecnicoId)
    .map((o) => ({ ...o, tipo: "preventivo" }));
  const cor = (data.solicitudes || [])
    .filter((s) => s.tecnicoId === tecnicoId && s.estado !== "pendiente")
    .map((s) => ({ ...s, tipo: "correctivo", tarea: s.descripcion }));
  const rank = { en_proceso: 0, programada: 1, completada: 2 };
  return [...pre, ...cor].sort(
    (a, b) =>
      (rank[a.estado] ?? 9) - (rank[b.estado] ?? 9) ||
      (a.fechaProgramada || "").localeCompare(b.fechaProgramada || ""),
  );
}

// Todas las actividades con materiales en algún punto del flujo de costos
function itemsConMateriales(data, estadosFiltro) {
  const pre = (data.ordenes || []).map((o) => ({ ...o, tipo: "preventivo" }));
  const cor = (data.solicitudes || []).map((s) => ({
    ...s,
    tipo: "correctivo",
    tarea: s.descripcion,
  }));
  return [...pre, ...cor].filter((i) =>
    estadosFiltro.includes(i.materialesEstado),
  );
}

/* ============================================================================
   5. PERSISTENCIA  (PostgREST → tablas en schema data vía RPC)
   ========================================================================= */

/* Registro único compartido: todos leen/escriben la misma base y se relee
   cada SYNC_MS para propagar cambios. Último en escribir gana. */
const SYNC_MS = 4000;

function isEmptyState(raw) {
  if (!raw || typeof raw !== "object") return true;
  const sedes = raw.sedes;
  const usuarios = raw.usuarios;
  return !(Array.isArray(sedes) && sedes.length) && !(Array.isArray(usuarios) && usuarios.length);
}

/* Repara datos guardados por versiones anteriores para que la app nunca
   arranque con un esquema incompleto (roles viejos, colecciones faltantes). */
const ROLES_LEGADO = {
  supervisor_cliente: "cliente",
  supervisor: "admin",
  general: "admin",
};

function normalizeData(raw) {
  const base = seedData();
  if (!raw || typeof raw !== "object") return base;
  const d = { ...raw };

  d.sedes = Array.isArray(d.sedes) ? d.sedes : base.sedes;
  d.sedes = d.sedes.map((s) => ({
    ...s,
    fases: (s.fases || []).map((f) => ({ ...f, activos: f.activos || [] })),
    estudiantes: Number(s.estudiantes) || 0,
    presupuestoPreventivo:
      Number(s.presupuestoPreventivo) || PRESUPUESTO_MENSUAL_SEDE,
    feeServicio: Number(s.feeServicio) || 0,
    constructor: s.constructor || "",
  }));

  d.usuarios = (Array.isArray(d.usuarios) ? d.usuarios : base.usuarios).map(
    (u) => {
      const rol = ROLES_LEGADO[u.rol] || u.rol;
      return {
        ...u,
        rol: ROLES[rol] ? rol : "solicitante",
        sedeIds: u.sedeIds || [],
      };
    },
  );
  if (!d.usuarios.some((u) => u.rol === "admin"))
    d.usuarios = [
      ...base.usuarios.filter((u) => u.rol === "admin"),
      ...d.usuarios,
    ];

  const arr = (v) => (Array.isArray(v) ? v : []);
  d.planes = arr(d.planes).map((p) => ({
    ...p,
    aplicaciones: arr(p.aplicaciones),
  }));
  d.ordenes = arr(d.ordenes).map((o) => {
    const plan = d.planes.find((p) => p.id === o.planId);
    return {
      ...o,
      materiales: arr(o.materiales),
      materialesEstado: o.materialesEstado || "",
      consumos: arr(o.consumos),
      duracionValor: o.duracionValor ?? plan?.duracionValor ?? 0,
      duracionUnidad: o.duracionUnidad || plan?.duracionUnidad || "minutos",
    };
  });
  d.solicitudes = arr(d.solicitudes).map((x) => ({
    ...x,
    materiales: arr(x.materiales),
    materialesEstado: x.materialesEstado || "",
    calificacion: Number(x.calificacion) || 0,
    horaCompletada: x.horaCompletada || "",
    consumos: arr(x.consumos),
  }));
  d.servicios = arr(d.servicios);
  d.stock = arr(d.stock).map((x) => ({
    ...x,
    cantidad: Number(x.cantidad) || 0,
    costoUnitario: Number(x.costoUnitario) || 0,
    minimo: Number(x.minimo) || 0,
  }));
  d.categorias = arr(d.categorias).length ? d.categorias : CATEGORIAS_BASE;
  // Resúmenes de gestión generados a demanda, uno por mes (clave "YYYY-MM")
  d.resumenesMes =
    raw.resumenesMes && typeof raw.resumenesMes === "object"
      ? raw.resumenesMes
      : {};

  d.otCounter = Number(d.otCounter) || d.ordenes.length + 1;
  d.solCounter = Number(d.solCounter) || d.solicitudes.length + 1;
  d.srvCounter = Number(d.srvCounter) || d.servicios.length + 1;
  return d;
}

function useSystemData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const dataRef = useRef(null);
  const snapshotRef = useRef(null); // JSON que este cliente considera vigente
  const escribiendoRef = useRef(false); // evita que el polling pise una escritura
  const flushTimerRef = useRef(null);
  const flushWaitersRef = useRef([]);
  const writeChainRef = useRef(Promise.resolve());

  const applyLocal = (next) => {
    const normalized = normalizeData(next);
    dataRef.current = normalized;
    snapshotRef.current = JSON.stringify(normalized);
    setData(normalized);
    return normalized;
  };

  const flushToDb = useCallback(async () => {
    const toSave = dataRef.current;
    if (!toSave) return false;
    escribiendoRef.current = true;
    try {
      const saved = normalizeData(await saveAppState(toSave));
      // Si hubo más edits durante el POST, no pisar el estado local más nuevo
      if (snapshotRef.current === JSON.stringify(toSave)) {
        dataRef.current = saved;
        snapshotRef.current = JSON.stringify(saved);
        setData(saved);
      } else {
        // Reenviar el estado más reciente
        const again = normalizeData(await saveAppState(dataRef.current));
        dataRef.current = again;
        snapshotRef.current = JSON.stringify(again);
        setData(again);
      }
      setUltimaSync(new Date());
      setSyncError(null);
      return true;
    } catch (e) {
      console.error("No se pudo guardar en PostgREST", e);
      setSyncError(
        "No se pudo guardar en la base. Arranca PostgREST en el puerto 3000.",
      );
      return false;
    } finally {
      escribiendoRef.current = false;
    }
  }, []);

  // Carga inicial desde tablas (RPC get_app_state / put_app_state)
  useEffect(() => {
    (async () => {
      try {
        const populated = await hasAppData();
        if (populated) {
          applyLocal(await loadAppState());
        } else {
          applyLocal(await saveAppState(normalizeData(seedData())));
        }
        setUltimaSync(new Date());
        setSyncError(null);
      } catch (e) {
        console.error("No se pudo cargar desde PostgREST", e);
        setSyncError(
          "Sin conexión a PostgREST (puerto 3000). Los cambios no se guardarán en la base.",
        );
        applyLocal(seedData());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Relectura periódica: trae cambios de otros usuarios
  useEffect(() => {
    const id = setInterval(async () => {
      if (escribiendoRef.current || document.hidden) return;
      if (flushWaitersRef.current.length) return;
      try {
        const remote = normalizeData(await loadAppState());
        if (isEmptyState(remote)) return;
        const json = JSON.stringify(remote);
        if (json !== snapshotRef.current) {
          dataRef.current = remote;
          snapshotRef.current = json;
          setData(remote);
        }
        setUltimaSync(new Date());
        setSyncError(null);
      } catch (_) {
        /* sin conexión: se reintenta al siguiente ciclo */
      }
    }, SYNC_MS);
    return () => clearInterval(id);
  }, []);

  // updater: objeto completo O función (prev) => next  — preferir función
  const persist = useCallback(
    (nextOrFn) => {
      const prev = dataRef.current;
      if (!prev) return Promise.resolve(false);
      const draft =
        typeof nextOrFn === "function" ? nextOrFn(prev) : nextOrFn;
      applyLocal(draft);
      escribiendoRef.current = true;

      return new Promise((resolve) => {
        flushWaitersRef.current.push(resolve);
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
          const waiters = flushWaitersRef.current;
          flushWaitersRef.current = [];
          writeChainRef.current = writeChainRef.current
            .then(async () => {
              const ok = await flushToDb();
              waiters.forEach((w) => w(ok));
            })
            .catch(() => {
              waiters.forEach((w) => w(false));
            });
        }, 350);
      });
    },
    [flushToDb],
  );

  return { data, persist, loading, ultimaSync, syncError };
}

// Acciones de dominio agrupadas: un solo lugar donde se muta el estado
function useAcciones(data, persist) {
  return useMemo(
    () => ({
      updateOrden: (id, patch) =>
        persist((d) => ({
          ...d,
          ordenes: d.ordenes.map((o) =>
            o.id === id ? { ...o, ...patch } : o,
          ),
        })),
      updateSolicitud: (id, patch) =>
        persist((d) => ({
          ...d,
          solicitudes: d.solicitudes.map((s) =>
            s.id === id ? { ...s, ...patch } : s,
          ),
        })),
      // Consumir stock: descuenta bodega y registra el consumo en la actividad
      consumirStock: (item, art, cantidad) => {
        const consumo = {
          id: uid("con"),
          stockId: art.id,
          nombre: art.nombre,
          unidad: art.unidad,
          cantidad,
          costoUnitario: art.costoUnitario,
          fecha: fmtDate(new Date()),
        };
        const conConsumo = (a) => ({
          ...a,
          consumos: [...(a.consumos || []), consumo],
        });
        return persist((d) => {
          const stock = d.stock.map((x) =>
            x.id === art.id
              ? { ...x, cantidad: Math.max(0, x.cantidad - cantidad) }
              : x,
          );
          return item.tipo === "preventivo"
            ? {
                ...d,
                stock,
                ordenes: d.ordenes.map((o) =>
                  o.id === item.id ? conConsumo(o) : o,
                ),
              }
            : {
                ...d,
                stock,
                solicitudes: d.solicitudes.map((x) =>
                  x.id === item.id ? conConsumo(x) : x,
                ),
              };
        });
      },
      // Devolver a bodega lo cargado por error
      devolverStock: (item, consumo) => {
        const sinConsumo = (a) => ({
          ...a,
          consumos: (a.consumos || []).filter((c) => c.id !== consumo.id),
        });
        return persist((d) => {
          const stock = d.stock.map((x) =>
            x.id === consumo.stockId
              ? { ...x, cantidad: x.cantidad + consumo.cantidad }
              : x,
          );
          return item.tipo === "preventivo"
            ? {
                ...d,
                stock,
                ordenes: d.ordenes.map((o) =>
                  o.id === item.id ? sinConsumo(o) : o,
                ),
              }
            : {
                ...d,
                stock,
                solicitudes: d.solicitudes.map((x) =>
                  x.id === item.id ? sinConsumo(x) : x,
                ),
              };
        });
      },
      updateActividad: (item, patch) =>
        item.tipo === "preventivo"
          ? persist((d) => ({
              ...d,
              ordenes: d.ordenes.map((o) =>
                o.id === item.id ? { ...o, ...patch } : o,
              ),
            }))
          : persist((d) => ({
              ...d,
              solicitudes: d.solicitudes.map((s) =>
                s.id === item.id ? { ...s, ...patch } : s,
              ),
            })),
    }),
    [persist],
  );
}

/* ============================================================================
   6. COMPONENTES UI COMPARTIDOS
   ========================================================================= */

function Chip({ children, color = COLORS.charcoal, solid, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${className}`}
      style={
        solid
          ? { background: color, color: "white" }
          : { background: `${color}18`, color }
      }
    >
      {children}
    </span>
  );
}

function EstadoChip({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.pendiente;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: `${e.color}1A`, color: e.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: e.color }}
      />
      {e.label}
    </span>
  );
}

const TIPO_META = {
  preventivo: { label: "Preventivo", color: COLORS.orange },
  correctivo: { label: "Correctivo", color: COLORS.charcoal },
  servicio: { label: "Servicio", color: "#3B6EA5" },
};
const tipoMeta = (t) => TIPO_META[t] || TIPO_META.correctivo;

function TipoChip({ tipo }) {
  const m = tipoMeta(tipo);
  return (
    <Chip solid color={m.color}>
      {m.label}
    </Chip>
  );
}

function Semaforo({ item, showLabel }) {
  const s = semaforoDe(item);
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" title={s.label}>
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ background: s.color }}
      />
      {showLabel && (
        <span className="text-[10px] font-semibold" style={{ color: s.color }}>
          {s.label}
        </span>
      )}
    </span>
  );
}

/* Calificación de 1 a 5 estrellas. En modo lectura solo muestra el resultado. */
const CALIF_TEXTO = {
  1: "Muy insatisfecho",
  2: "Insatisfecho",
  3: "Aceptable",
  4: "Satisfecho",
  5: "Muy satisfecho",
};

function Estrellas({ valor = 0, onChange, size = 20, readOnly }) {
  const [hover, setHover] = useState(0);
  const activo = hover || valor;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          disabled={readOnly}
          onClick={() => onChange && onChange(n === valor ? 0 : n)}
          onMouseEnter={() => !readOnly && setHover(n)}
          className={readOnly ? "cursor-default" : "cursor-pointer"}
          title={readOnly ? undefined : CALIF_TEXTO[n]}
          aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
        >
          <Star
            size={size}
            color={n <= activo ? COLORS.ambar : COLORS.line}
            fill={n <= activo ? COLORS.ambar : "none"}
          />
        </button>
      ))}
    </div>
  );
}

/* Bloque de calificación dentro de la tarjeta de una solicitud completada. */
function BloqueCalificacion({ solicitud, onCalificar }) {
  const [comentario, setComentario] = useState(solicitud.comentarioCalif || "");
  const [abierto, setAbierto] = useState(false);
  const calificada = solicitud.calificacion > 0;

  return (
    <div
      className="mt-2 rounded-md p-2.5"
      style={{
        background: calificada ? `${COLORS.verde}0D` : `${COLORS.ambar}12`,
      }}
    >
      <p className="text-[11px] font-semibold mb-1.5" style={cChar}>
        {calificada ? "Tu calificación" : "¿Cómo fue la atención?"}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Estrellas
          valor={solicitud.calificacion}
          onChange={(n) => {
            onCalificar({ calificacion: n });
            if (n > 0) setAbierto(true);
          }}
        />
        {solicitud.calificacion > 0 && (
          <span
            className="text-[11px] font-semibold"
            style={{ color: COLORS.ambar }}
          >
            {CALIF_TEXTO[solicitud.calificacion]}
          </span>
        )}
      </div>

      {calificada && !abierto && !solicitud.comentarioCalif && (
        <button
          onClick={() => setAbierto(true)}
          className="text-[10px] font-semibold mt-1.5"
          style={cOrange}
        >
          + Agregar un comentario
        </button>
      )}

      {calificada && (abierto || solicitud.comentarioCalif) && (
        <div className="mt-2">
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            placeholder="Comentario opcional sobre el trabajo realizado"
            className="w-full border rounded-md px-2 py-1.5 text-xs outline-none resize-none"
            style={inputStyle}
          />
          {comentario !== (solicitud.comentarioCalif || "") && (
            <button
              onClick={() => {
                onCalificar({ comentarioCalif: comentario.trim() });
                setAbierto(false);
              }}
              className="mt-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md text-white"
              style={{ background: COLORS.charcoal }}
            >
              Guardar comentario
            </button>
          )}
        </div>
      )}

      {!calificada && (
        <p className="text-[10px] mt-1" style={cSlate}>
          Toca una estrella para calificar.
        </p>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full ${wide ? "sm:max-w-lg" : "sm:max-w-sm"} max-h-[90vh] sm:max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10"
          style={bLine}
        >
          <h3 className="font-semibold text-sm" style={cChar}>
            {title}
          </h3>
          <button onClick={onClose}>
            <X size={18} color={COLORS.slate} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-xs font-semibold" style={cSlate}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && (
        <p className="text-[10px] mt-1" style={cSlate}>
          {hint}
        </p>
      )}
    </div>
  );
}

const inputCls = "w-full border rounded-md px-3 py-2 text-sm outline-none";
const inputStyle = { borderColor: COLORS.line };

function ReadOnly({ children }) {
  return (
    <p
      className="text-sm rounded-md px-3 py-2"
      style={{ background: COLORS.cream, color: COLORS.charcoal }}
    >
      {children}
    </p>
  );
}

function Stat({ label, value, icon, color, sub }) {
  return (
    <div className="rounded-md p-3 border" style={cardStyle}>
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </div>
        <p className="text-xs font-semibold leading-tight" style={cSlate}>
          {label}
        </p>
      </div>
      <p
        className="text-2xl font-bold mt-2 leading-none"
        style={{
          color: COLORS.charcoal,
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] mt-1" style={cSlate}>
          {sub}
        </p>
      )}
    </div>
  );
}

/* Medidor semicircular: muestra un KPI en días contra un máximo de referencia.
   El arco relleno es proporcional al valor; el número va en el centro. */
function GaugeDonut({
  valor,
  max,
  color,
  titulo,
  unidad = "d",
  detalle,
  invertido,
}) {
  const v =
    valor === null || valor === undefined
      ? 0
      : Math.max(0, Math.min(valor, max));
  const datos = [{ v }, { v: Math.max(0.0001, max - v) }];
  const hayDato = valor !== null && valor !== undefined;

  return (
    <div className="border rounded-md p-3" style={cardStyle}>
      <p
        className="text-xs font-semibold uppercase tracking-wide mb-1"
        style={cSlate}
      >
        {titulo}
      </p>
      <div className="relative" style={{ height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={datos}
              dataKey="v"
              startAngle={180}
              endAngle={0}
              innerRadius="62%"
              outerRadius="95%"
              cy="88%"
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={hayDato ? color : COLORS.line} />
              <Cell fill={COLORS.line} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ bottom: 4 }}
        >
          <span
            className="text-2xl font-bold leading-none"
            style={{
              color: hayDato ? color : COLORS.slate,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {hayDato ? `${valor > max ? "+" : ""}${valor.toFixed(1)}` : "—"}
          </span>
          <span className="text-[10px]" style={cSlate}>
            {hayDato ? unidad : "sin datos"}
          </span>
        </div>
      </div>
      <div
        className="flex items-center justify-between text-[9px] -mt-1"
        style={cSlate}
      >
        <span>0</span>
        <span>
          {max} {unidad} máx.
        </span>
      </div>
      {detalle && (
        <p className="text-[10px] mt-1 text-center" style={cSlate}>
          {detalle}
        </p>
      )}
      {invertido && (
        <p className="text-[9px] text-center" style={cSlate}>
          menor es mejor
        </p>
      )}
    </div>
  );
}

function SectionTitle({ children, count, action }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-6 first:mt-0 gap-2">
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={cSlate}
      >
        {children}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {count !== undefined && <Chip color={COLORS.orange}>{count}</Chip>}
        {action}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <p className="text-sm py-2" style={cSlate}>
      {children}
    </p>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 mt-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap shrink-0"
          style={{
            background: active === t.id ? COLORS.charcoal : "white",
            color: active === t.id ? "white" : COLORS.slate,
            border: `1px solid ${active === t.id ? COLORS.charcoal : COLORS.line}`,
          }}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}

// Muestra que la base compartida se está releyendo: prueba visible de la conexión
function SyncBadge({ ultimaSync }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  if (!ultimaSync) return null;
  const seg = Math.floor((Date.now() - ultimaSync.getTime()) / 1000);
  const vivo = seg < 15;
  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 text-[10px] shrink-0"
      style={cSlate}
      title="Los datos son compartidos entre todos los usuarios y se releen cada pocos segundos"
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: vivo ? COLORS.verde : COLORS.ambar }}
      />
      {seg < 5 ? "Sincronizado" : `hace ${seg}s`}
    </span>
  );
}

function AppHeader({ user, onLogout, sedesTexto, ultimaSync }) {
  const rol = rolDe(user);
  return (
    <div className="flex items-center gap-3 pt-4">
      <div
        className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
        style={{ background: COLORS.charcoal }}
      >
        <Wrench size={17} color={COLORS.orange} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-sm leading-tight truncate" style={cChar}>
          {user.nombre}
        </p>
        <p className="text-[11px] truncate" style={cSlate}>
          {rol.label}
          {sedesTexto ? ` · ${sedesTexto}` : ""}
        </p>
      </div>
      <SyncBadge ultimaSync={ultimaSync} />
      <button
        onClick={onLogout}
        className="w-8 h-8 rounded-md border flex items-center justify-center shrink-0"
        style={bLine}
        title="Cerrar sesión"
      >
        <LogOut size={14} color={COLORS.charcoal} />
      </button>
    </div>
  );
}

// Selector de mes reutilizable
function MesSelector({ mes, onChange }) {
  const shift = (d) => {
    const [y, m] = mes.split("-").map(Number);
    const next = new Date(y, m - 1 + d, 1);
    onChange(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => shift(-1)}
        className="w-7 h-7 rounded-md border flex items-center justify-center"
        style={bLine}
      >
        <ChevronLeft size={14} color={COLORS.charcoal} />
      </button>
      <p
        className="text-sm font-bold capitalize text-center"
        style={{ color: COLORS.charcoal, minWidth: 120 }}
      >
        {mesLabel(mes)}
      </p>
      <button
        onClick={() => shift(1)}
        className="w-7 h-7 rounded-md border flex items-center justify-center"
        style={bLine}
      >
        <ChevronRight size={14} color={COLORS.charcoal} />
      </button>
    </div>
  );
}

function FotoUploader({ foto, onChange, readOnly }) {
  const inputRef = useRef(null);
  if (readOnly && !foto) return null;
  return (
    <Field label="Foto">
      {foto ? (
        <div className="relative inline-block">
          <img
            src={foto}
            alt="Evidencia"
            className="rounded-md max-h-40 border"
            style={bLine}
          />
          {!readOnly && (
            <button
              onClick={() => onChange("")}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border flex items-center justify-center"
              style={bLine}
            >
              <X size={11} color={COLORS.rojo} />
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="text-xs font-semibold px-3 py-2 rounded-md border flex items-center gap-1.5"
          style={{ borderColor: COLORS.line, color: COLORS.charcoal }}
        >
          <Camera size={13} /> Adjuntar foto
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const r = new FileReader();
          r.onload = () => onChange(r.result);
          r.readAsDataURL(file);
        }}
      />
    </Field>
  );
}

/* Materiales según rol: técnico lista · admin costea · cliente decide */
function MaterialesPanel({ item, rol, onUpdate, puedeEnviar = true }) {
  const materiales = item.materiales || [];
  const estado = item.materialesEstado || "";
  const puedeListar =
    (rol === "tecnico" || rol === "admin") &&
    (estado === "" || estado === "borrador");
  const puedeCostear = rol === "admin" && estado === "pendiente_costeo";
  const puedeAprobar =
    (rol === "cliente" || rol === "admin") &&
    (estado === "pendiente_aprobacion" || estado === "en_espera");
  const total = costoEstimado(item);
  const info = MAT_ESTADO[estado];

  if (materiales.length === 0 && !puedeListar) return null;

  const set = (id, patch) =>
    onUpdate({
      materiales: materiales.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <p
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={cSlate}
        >
          Recursos / materiales
        </p>
        {info && <Chip color={info.color}>{info.label}</Chip>}
      </div>

      <div className="space-y-1.5">
        {materiales.map((m) => (
          <div key={m.id} className="border rounded-md p-2" style={bLine}>
            {puedeListar ? (
              <div className="space-y-1.5">
                <input
                  value={m.nombre}
                  onChange={(e) => set(m.id, { nombre: e.target.value })}
                  placeholder="Material"
                  className="w-full border rounded px-2 py-1 text-xs outline-none"
                  style={inputStyle}
                />
                <div className="flex gap-1.5 items-center">
                  <input
                    type="number"
                    min="0"
                    value={m.cantidad}
                    onChange={(e) => set(m.id, { cantidad: e.target.value })}
                    placeholder="Cant."
                    className="w-16 border rounded px-2 py-1 text-xs outline-none"
                    style={inputStyle}
                  />
                  <input
                    value={m.unidad}
                    onChange={(e) => set(m.id, { unidad: e.target.value })}
                    placeholder="Unidad"
                    className="flex-1 border rounded px-2 py-1 text-xs outline-none"
                    style={inputStyle}
                  />
                  <button
                    onClick={() =>
                      onUpdate({
                        materiales: materiales.filter((x) => x.id !== m.id),
                      })
                    }
                    className="shrink-0 px-1"
                  >
                    <Trash2 size={13} color={COLORS.slate} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="min-w-0 truncate" style={cChar}>
                  {m.nombre || "—"} · {m.cantidad}
                  {puedeCostear ? "" : ` ${m.unidad}`}
                </span>
                {puedeCostear ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      value={m.unidad}
                      onChange={(e) => set(m.id, { unidad: e.target.value })}
                      placeholder="Unid."
                      title="La unidad puede cambiar según el proveedor"
                      className="w-14 border rounded px-1.5 py-1 text-xs outline-none"
                      style={{ borderColor: COLORS.orange }}
                    />
                    <span className="text-[10px]" style={cSlate}>
                      $/u
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={m.costoUnitario}
                      onChange={(e) =>
                        set(m.id, { costoUnitario: e.target.value })
                      }
                      className="w-16 border rounded px-1.5 py-1 text-xs outline-none"
                      style={{ borderColor: COLORS.orange }}
                    />
                  </div>
                ) : Number(m.costoUnitario) > 0 ? (
                  <span className="font-semibold shrink-0" style={cOrange}>
                    {money(
                      (Number(m.cantidad) || 0) *
                        (Number(m.costoUnitario) || 0),
                    )}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))}
        {materiales.length === 0 && puedeListar && (
          <Empty>Sin materiales agregados.</Empty>
        )}
      </div>

      {puedeListar && (
        <button
          onClick={() =>
            onUpdate({
              materiales: [
                ...materiales,
                {
                  id: uid("mat"),
                  nombre: "",
                  cantidad: 1,
                  unidad: "u",
                  costoUnitario: 0,
                },
              ],
              materialesEstado: "borrador",
            })
          }
          className="flex items-center gap-1 text-[11px] font-semibold mt-1.5"
          style={cOrange}
        >
          <Plus size={11} /> Agregar material
        </button>
      )}

      {puedeListar &&
        materiales.length > 0 &&
        (puedeEnviar ? (
          <button
            onClick={() => onUpdate({ materialesEstado: "pendiente_costeo" })}
            className="w-full mt-2 text-xs font-semibold py-2 rounded-md text-white"
            style={{ background: COLORS.charcoal }}
          >
            Enviar a costeo
          </button>
        ) : (
          <p className="text-[10px] mt-2" style={cSlate}>
            Marca la actividad "En proceso" para enviar los materiales a costeo.
          </p>
        ))}

      {(estado === "pendiente_aprobacion" ||
        estado === "en_espera" ||
        estado === "aprobado" ||
        estado === "rechazado" ||
        puedeCostear) && (
        <div
          className="flex items-center justify-between mt-2 pt-2 border-t"
          style={bLine}
        >
          <span className="text-xs font-bold" style={cChar}>
            Total
          </span>
          <span className="text-sm font-bold" style={cOrange}>
            {money(total)}
          </span>
        </div>
      )}

      {puedeCostear && (
        <button
          onClick={() => onUpdate({ materialesEstado: "pendiente_aprobacion" })}
          className="w-full mt-2 text-xs font-semibold py-2 rounded-md text-white"
          style={{ background: COLORS.orange }}
        >
          Enviar a aprobación del cliente
        </button>
      )}

      {puedeAprobar && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <button
            onClick={() => onUpdate({ materialesEstado: "aprobado" })}
            className="text-xs font-semibold py-2 rounded-md text-white"
            style={{ background: COLORS.verde }}
          >
            Aprobar
          </button>
          <button
            onClick={() => onUpdate({ materialesEstado: "en_espera" })}
            className="text-xs font-semibold py-2 rounded-md text-white disabled:opacity-40"
            disabled={estado === "en_espera"}
            title="Queda en tu bandeja de pendientes para decidir más tarde"
            style={{ background: MAT_ESTADO.en_espera.color }}
          >
            En espera
          </button>
          <button
            onClick={() => onUpdate({ materialesEstado: "rechazado" })}
            className="text-xs font-semibold py-2 rounded-md text-white"
            style={{ background: COLORS.rojo }}
          >
            Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

/* Consumo de stock: el técnico descuenta de bodega lo que usó en un preventivo.
   No pasa por aprobación — el valor entra directo al presupuesto de la sede. */
function ConsumoStock({ item, stockSede, onRegistrar, onQuitar, readOnly }) {
  const [sel, setSel] = useState("");
  const [cant, setCant] = useState(1);
  const consumos = item.consumos || [];
  const total = costoConsumos(item);
  const art = stockSede.find((x) => x.id === sel);
  const excede = art && Number(cant) > art.cantidad;
  const valido = art && Number(cant) > 0 && !excede;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <p
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={cSlate}
        >
          Consumo de bodega
        </p>
        {total > 0 && <Chip color={COLORS.orange}>{money(total)}</Chip>}
      </div>

      {consumos.length > 0 && (
        <div className="space-y-1 mb-2">
          {consumos.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between text-xs gap-2 border rounded-md px-2 py-1.5"
              style={bLine}
            >
              <span className="min-w-0 truncate" style={cChar}>
                {c.nombre} · {c.cantidad} {c.unidad}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-semibold" style={cOrange}>
                  {money(c.cantidad * c.costoUnitario)}
                </span>
                {!readOnly && (
                  <button onClick={() => onQuitar(c)}>
                    <Trash2 size={12} color={COLORS.slate} />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {!readOnly &&
        (stockSede.length === 0 ? (
          <p className="text-[10px]" style={cSlate}>
            Esta sede aún no tiene stock cargado.
          </p>
        ) : (
          <>
            <div className="flex gap-1.5">
              <select
                value={sel}
                onChange={(e) => {
                  setSel(e.target.value);
                  setCant(1);
                }}
                className="flex-1 min-w-0 border rounded-md px-2 py-1.5 text-xs"
                style={inputStyle}
              >
                <option value="">Elegir artículo…</option>
                {stockSede.map((x) => (
                  <option key={x.id} value={x.id} disabled={x.cantidad <= 0}>
                    {x.nombre} · {x.cantidad} {x.unidad}{" "}
                    {x.cantidad <= 0 ? "(agotado)" : ""}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max={art?.cantidad || 999}
                value={cant}
                onChange={(e) => setCant(e.target.value)}
                className="w-14 border rounded-md px-2 py-1.5 text-xs outline-none"
                style={inputStyle}
              />
              <button
                disabled={!valido}
                onClick={() => {
                  onRegistrar(art, Number(cant));
                  setSel("");
                  setCant(1);
                }}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md text-white shrink-0 disabled:opacity-40"
                style={{ background: COLORS.orange }}
              >
                Cargar
              </button>
            </div>
            {art && (
              <p
                className="text-[10px] mt-1"
                style={{ color: excede ? COLORS.rojo : COLORS.slate }}
              >
                {excede
                  ? `Solo quedan ${art.cantidad} ${art.unidad} en bodega.`
                  : `${money(art.costoUnitario)} por ${art.unidad} · subtotal ${money(art.costoUnitario * (Number(cant) || 0))}`}
              </p>
            )}
            <p className="text-[10px] mt-1.5" style={cSlate}>
              Descuenta de bodega y carga al presupuesto de la sede. No requiere
              aprobación.
            </p>
          </>
        ))}
    </div>
  );
}

/* Satisfacción del servicio: promedio de estrellas y su distribución. */
function TarjetaSatisfaccion({ sat }) {
  const color =
    sat.promedio === null
      ? COLORS.slate
      : sat.promedio >= 4.5
        ? COLORS.verde
        : sat.promedio >= 3.5
          ? COLORS.ambar
          : COLORS.rojo;
  const max = Math.max(1, ...sat.dist.map((d) => d.cant));

  return (
    <div className="border rounded-md p-3" style={cardStyle}>
      <p
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={cSlate}
      >
        Satisfacción del servicio
      </p>

      <div className="flex items-center gap-3 mb-3">
        <span
          className="text-3xl font-bold leading-none"
          style={{ color, fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {sat.promedio === null ? "—" : sat.promedio.toFixed(1)}
        </span>
        <div className="min-w-0">
          <Estrellas valor={Math.round(sat.promedio || 0)} size={14} readOnly />
          <p className="text-[10px] mt-0.5" style={cSlate}>
            {sat.total > 0
              ? `${sat.total} de ${sat.cerradas} solicitudes calificadas`
              : "Aún sin calificaciones"}
          </p>
        </div>
      </div>

      {sat.total > 0 ? (
        <div className="space-y-1">
          {sat.dist.map((d) => (
            <div key={d.n} className="flex items-center gap-2">
              <span
                className="text-[10px] w-6 shrink-0 flex items-center gap-0.5"
                style={cSlate}
              >
                {d.n}
                <Star size={9} color={COLORS.ambar} fill={COLORS.ambar} />
              </span>
              <div
                className="flex-1 h-2 rounded-sm overflow-hidden"
                style={{ background: COLORS.line }}
              >
                <div
                  style={{
                    width: `${(d.cant / max) * 100}%`,
                    background: COLORS.ambar,
                    height: "100%",
                  }}
                />
              </div>
              <span
                className="text-[10px] w-4 text-right shrink-0"
                style={cSlate}
              >
                {d.cant}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px]" style={cSlate}>
          Las calificaciones aparecen cuando los solicitantes valoran una
          solicitud cerrada.
        </p>
      )}

      {sat.sinCalificar > 0 && sat.total > 0 && (
        <p
          className="text-[10px] mt-2 pt-2 border-t"
          style={{ ...cSlate, borderColor: COLORS.line }}
        >
          {sat.sinCalificar} cerrada(s) todavía sin calificar.
        </p>
      )}
    </div>
  );
}

/* ============================================================================
   DETALLE DE ORDEN DE TRABAJO  ·  vista completa de solo lectura

   Cualquier tarjeta del sistema puede abrirla llamando useDetalle()(item),
   sin tener que entrar al modo edición.
   ========================================================================= */

const DetalleCtx = React.createContext(() => {});
const useDetalle = () => React.useContext(DetalleCtx);

/* Botón discreto que abre el detalle desde cualquier tarjeta. */
function BotonDetalle({ item, size = 14, className = "" }) {
  const ver = useDetalle();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        ver(item);
      }}
      title="Ver detalle completo"
      className={`shrink-0 opacity-60 hover:opacity-100 ${className}`}
    >
      <Info size={size} color={COLORS.slate} />
    </button>
  );
}

function Dato({ label, children }) {
  if (!children) return null;
  return (
    <div className="min-w-0">
      <p
        className="text-[9px] font-semibold uppercase tracking-wide"
        style={cSlate}
      >
        {label}
      </p>
      <p className="text-xs break-words" style={cChar}>
        {children}
      </p>
    </div>
  );
}

function DetalleActividad({ item, data, onClose }) {
  const esServ = item.tipo === "servicio";
  const esPrev = item.tipo === "preventivo";
  // Un pendiente todavía no tiene orden creada: no lleva código ni estado
  const sinActivar = !item.codigo;
  const sem = sinActivar ? semaforoDe(item) : null;
  const t = tiempoActividad(item);
  const costoMat = costoAprobado(item);
  const costoCon = costoConsumos(item);
  const costo = esServ ? Number(item.presupuesto) || 0 : costoMat + costoCon;
  const matInfo = MAT_ESTADO[item.materialesEstado];

  return (
    <div className="space-y-3">
      {/* Cabecera */}
      <div
        className="rounded-md p-3"
        style={{
          background: COLORS.cream,
          borderLeft: `3px solid ${tipoMeta(item.tipo).color}`,
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TipoChip tipo={item.tipo} />
            {item.codigo ? (
              <span className="text-sm font-bold" style={cChar}>
                {item.codigo}
              </span>
            ) : (
              <span className="text-xs font-semibold" style={cSlate}>
                Aún sin orden generada
              </span>
            )}
            {item.criticidad && (
              <Chip color={CRITICIDAD[item.criticidad].color}>
                {CRITICIDAD[item.criticidad].label}
              </Chip>
            )}
          </div>
          {sinActivar ? (
            <Chip color={sem.color}>{sem.label}</Chip>
          ) : (
            <EstadoChip estado={item.estado} />
          )}
        </div>
        <p className="text-sm font-semibold mt-2" style={cChar}>
          {item.tarea || item.descripcion}
        </p>
        <p className="text-xs mt-0.5" style={cSlate}>
          {ubicacionTexto(data.sedes, item)}
        </p>
      </div>

      {/* Datos generales */}
      <div className="grid grid-cols-2 gap-2.5">
        <Dato label={esServ ? "Proveedor" : "Responsable"}>
          {esServ
            ? item.proveedor || "Sin proveedor"
            : sinActivar
              ? "Por asignar"
              : usuarioNombre(data.usuarios, item.tecnicoId)}
        </Dato>
        <Dato label="Programada">
          {sinActivar ? "Pendiente de programar" : item.fechaProgramada || "—"}
        </Dato>
        {sinActivar && esPrev && (
          <Dato label="Último mantenimiento">
            {item.ultimoMantenimiento || "Sin registro previo"}
          </Dato>
        )}
        {sinActivar && esPrev && item.fechaInicial && (
          <Dato label="Inspección inicial">{item.fechaInicial}</Dato>
        )}
        {item.solicitanteId && (
          <Dato label="Solicitó">{`${usuarioNombre(data.usuarios, item.solicitanteId)} · ${item.fecha || ""} ${item.hora || ""}`}</Dato>
        )}
        {esPrev && item.frecuencia && (
          <Dato label="Frecuencia">{item.frecuencia}</Dato>
        )}
        {item.categoria && <Dato label="Categoría">{item.categoria}</Dato>}
        <Dato label={t.real ? "Tiempo real" : "Tiempo estimado"}>{t.txt}</Dato>
        {item.fechaCompletada && (
          <Dato label="Cierre">{`${item.fechaCompletada}${item.horaCompletada ? ` · ${item.horaCompletada}` : ""}`}</Dato>
        )}
        {costo > 0 && <Dato label="Costo">{money(costo)}</Dato>}
      </div>

      {/* Procedimiento */}
      {item.procedimiento && (
        <Field label="Procedimiento">
          <p
            className="text-xs whitespace-pre-wrap rounded-md p-2.5"
            style={{ background: COLORS.paper, color: COLORS.charcoal }}
          >
            {item.procedimiento}
          </p>
        </Field>
      )}

      {item.observaciones && (
        <Field label="Observaciones del técnico">
          <ReadOnly>{item.observaciones}</ReadOnly>
        </Field>
      )}
      {item.resolucion && (
        <Field label="Resolución">
          <ReadOnly>{item.resolucion}</ReadOnly>
        </Field>
      )}

      {/* Consumo de bodega */}
      {(item.consumos || []).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={cSlate}
            >
              Consumo de bodega
            </p>
            <Chip color={COLORS.orange}>{money(costoCon)}</Chip>
          </div>
          <div className="space-y-1">
            {item.consumos.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5"
                style={bLine}
              >
                <span style={cChar}>
                  {c.nombre} · {c.cantidad} {c.unidad}
                </span>
                <span className="font-semibold" style={cOrange}>
                  {money(c.cantidad * c.costoUnitario)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materiales comprados */}
      {(item.materiales || []).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={cSlate}
            >
              Materiales
            </p>
            {matInfo && <Chip color={matInfo.color}>{matInfo.label}</Chip>}
          </div>
          <div className="space-y-1">
            {item.materiales.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5"
                style={bLine}
              >
                <span style={cChar}>
                  {m.nombre} · {m.cantidad} {m.unidad}
                </span>
                <span className="font-semibold" style={cOrange}>
                  {money(m.cantidad * m.costoUnitario)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calificación del solicitante */}
      {item.calificacion > 0 && (
        <div
          className="rounded-md p-2.5"
          style={{ background: `${COLORS.ambar}12` }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-wide mb-1"
            style={cSlate}
          >
            Calificación del solicitante
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Estrellas valor={item.calificacion} size={14} readOnly />
            <span
              className="text-[11px] font-semibold"
              style={{ color: COLORS.ambar }}
            >
              {CALIF_TEXTO[item.calificacion]}
            </span>
          </div>
          {item.comentarioCalif && (
            <p className="text-xs mt-1.5" style={cChar}>
              “{item.comentarioCalif}”
            </p>
          )}
        </div>
      )}

      {sinActivar && (
        <p
          className="text-[11px] rounded-md p-2.5"
          style={{ background: COLORS.cream, color: COLORS.slate }}
        >
          {esPrev
            ? "Tarea del plan preventivo todavía sin activar. Al activarla se genera su orden de trabajo con código propio."
            : "Solicitud sin programar. Al activarla se le asigna técnico y fecha."}
        </p>
      )}

      {item.foto && (
        <Field label="Evidencia fotográfica">
          <img
            src={item.foto}
            alt="Evidencia"
            className="rounded-md max-h-56 border w-full object-contain"
            style={bLine}
          />
        </Field>
      )}
    </div>
  );
}

/* Envuelve una vista para que sus tarjetas puedan abrir el detalle. */
function ProveedorDetalle({ data, children }) {
  const [item, setItem] = useState(null);
  return (
    <DetalleCtx.Provider value={setItem}>
      {children}
      {item && (
        <Modal title="Detalle de la orden" onClose={() => setItem(null)} wide>
          <DetalleActividad
            item={item}
            data={data}
            onClose={() => setItem(null)}
          />
        </Modal>
      )}
    </DetalleCtx.Provider>
  );
}

/* --- Barra de presupuesto --- */
function PresupuestoBar({ p, compact }) {
  const est = ESTADO_PRESUPUESTO[p.estado];
  const wGast = Math.min(100, p.pct);
  const wComp = Math.min(100 - wGast, (p.comprometido / p.presupuesto) * 100);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold truncate" style={cChar}>
          {p.nombre || ""}
        </span>
        <span
          className="text-xs font-bold shrink-0"
          style={{ color: est.color }}
        >
          {money(p.gastado)} / {money(p.presupuesto)}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden flex"
        style={{ background: COLORS.line }}
      >
        <div style={{ width: `${wGast}%`, background: est.color }} />
        <div
          style={{
            width: `${Math.max(0, wComp)}%`,
            background: `${est.color}55`,
          }}
        />
      </div>
      {!compact && (
        <div className="flex items-center justify-between mt-1 gap-2 flex-wrap">
          <span className="text-[10px]" style={{ color: est.color }}>
            {est.label}
          </span>
          <span className="text-[10px]" style={cSlate}>
            {p.comprometido > 0
              ? `${money(p.comprometido)} comprometido · `
              : ""}
            {p.esMesActual
              ? `proyección ${money(p.proyeccion)}`
              : `${money(Math.max(0, p.disponible))} disponible`}
          </span>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   7. AUTENTICACIÓN  (una sola puerta de entrada; el rol define lo que se ve)
   ========================================================================= */

function Login({ usuarios, onLogin }) {
  const [usuarioId, setUsuarioId] = useState(usuarios[0]?.id || "");
  const [clave, setClave] = useState("");
  const [showClave, setShowClave] = useState(false);
  const [error, setError] = useState("");

  const entrar = () => {
    const u = usuarios.find((x) => x.id === usuarioId);
    if (u && u.clave === clave) onLogin(u);
    else setError("Clave incorrecta.");
  };

  const seleccionado = usuarios.find((u) => u.id === usuarioId);

  return (
    <div className="max-w-sm mx-auto px-4 pt-12 pb-10">
      <div className="text-center mb-8">
        <div
          className="w-14 h-14 rounded-xl mx-auto flex items-center justify-center"
          style={{ background: COLORS.charcoal }}
        >
          <Wrench size={26} color={COLORS.orange} />
        </div>
        <h1
          className="mt-3 font-bold text-xl"
          style={{
            color: COLORS.charcoal,
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: "0.02em",
          }}
        >
          SISTEMA DE MANTENIMIENTO
        </h1>
        <p className="text-xs mt-1" style={cSlate}>
          IndustriaMe · Gestión de instalaciones
        </p>
      </div>

      <div className="space-y-3">
        <Field label="Usuario">
          <select
            value={usuarioId}
            onChange={(e) => {
              setUsuarioId(e.target.value);
              setError("");
            }}
            className="w-full border rounded-md px-3 py-2.5 text-sm font-medium outline-none"
            style={inputStyle}
          >
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} — {rolDe(u).label}
              </option>
            ))}
          </select>
        </Field>

        {seleccionado && (
          <p className="text-[11px] px-1" style={cSlate}>
            {rolDe(seleccionado).desc}
          </p>
        )}

        <Field label="Clave">
          <div className="relative">
            <input
              type={showClave ? "text" : "password"}
              value={clave}
              onChange={(e) => {
                setClave(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && entrar()}
              className="w-full border rounded-md px-3 py-2.5 pr-10 text-sm outline-none"
              style={inputStyle}
            />
            <button
              onClick={() => setShowClave(!showClave)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              {showClave ? (
                <EyeOff size={15} color={COLORS.slate} />
              ) : (
                <Eye size={15} color={COLORS.slate} />
              )}
            </button>
          </div>
        </Field>

        {error && (
          <p className="text-xs" style={{ color: COLORS.rojo }}>
            {error}
          </p>
        )}

        <button
          onClick={entrar}
          className="w-full py-2.5 rounded-md font-semibold text-sm text-white"
          style={{ background: COLORS.orange }}
        >
          Ingresar
        </button>
      </div>

      <div className="mt-8 rounded-md p-3" style={{ background: COLORS.cream }}>
        <p
          className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
          style={cSlate}
        >
          Claves de prueba
        </p>
        {usuarios.map((u) => (
          <p key={u.id} className="text-[10px]" style={cSlate}>
            {u.nombre}: <span className="font-mono">{u.clave}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   8. DASHBOARD COMPARTIDO  (mismo componente, distinto alcance de sedes)
   ========================================================================= */

/* Tarjeta del Resumen del Mes: uno general y, si hay varias sedes, uno por
   cada una (desplegable para no saturar el tablero). Mismo texto que el
   reporte impreso, generado por generarResumenUnificado. */
/* Tarjeta del Resumen del mes: se genera solo al presionar el botón (no de
   forma automática), porque en el mes en curso los datos aún pueden estar
   incompletos. Una vez generado, se guarda por mes en data.resumenesMes para
   que quede fijo entre sesiones y todos los que abran el Dashboard vean el
   mismo texto; "Regenerar" lo vuelve a calcular con los datos más recientes. */
function TarjetaResumenMes({ data, persist, sedes, mes }) {
  const [generando, setGenerando] = useState(false);
  const guardado = data.resumenesMes?.[mes];

  const generar = () => {
    setGenerando(true);
    const r = generarResumenUnificado(data, sedes, mes);
    const ahora = new Date();
    persist((data) => ({
      ...data,
      resumenesMes: {
        ...data.resumenesMes,
        [mes]: { ...r, generadoEn: `${fmtDate(ahora)} · ${fmtHora(ahora)}` },
      },
    }));
    setGenerando(false);
  };

  return (
    <div
      className="border rounded-md p-3"
      style={{ ...cardStyle, borderLeft: `3px solid ${COLORS.orange}` }}
    >
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={cSlate}
        >
          Resumen del mes · {mesLabel(mes)}
        </p>
        {guardado && (
          <button
            onClick={generar}
            disabled={generando}
            className="flex items-center gap-1 text-[10px] font-semibold disabled:opacity-50"
            style={cOrange}
          >
            <RefreshCw size={11} /> Regenerar
          </button>
        )}
      </div>

      {!guardado ? (
        <div className="text-center py-2">
          <p className="text-xs mb-3" style={cSlate}>
            Genera un resumen ejecutivo con los indicadores del mes, el
            remanente de presupuesto y, por sede, recurrencias de correctivos,
            servicios que subieron el costo y el costo por estudiante. Actívalo
            cuando ya tengas suficiente información del periodo — al inicio del
            mes los datos suelen ser parciales.
          </p>
          <button
            onClick={generar}
            disabled={generando}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-md text-white disabled:opacity-50"
            style={{ background: COLORS.orange }}
          >
            <FileText size={13} />{" "}
            {generando ? "Generando…" : "Generar resumen"}
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed" style={cChar}>
            {guardado.parrafo.map((seg, i) =>
              seg.b ? <b key={i}>{seg.t}</b> : <span key={i}>{seg.t}</span>,
            )}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {guardado.vinetas.map((v) => (
              <li
                key={v.sedeId}
                className="text-xs flex items-start gap-2"
                style={cChar}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: sedeColor(data.sedes, v.sedeId) }}
                />
                <span>
                  <b>{v.nombre}:</b> {v.texto}
                </span>
              </li>
            ))}
          </ul>
          <p
            className="text-[10px] mt-2.5 pt-2 border-t"
            style={{ ...cSlate, borderColor: COLORS.line }}
          >
            Generado el {guardado.generadoEn}
          </p>
        </>
      )}
    </div>
  );
}

function Dashboard({
  data,
  persist,
  sedes,
  mes,
  onMesChange,
  mostrarPresupuesto,
  mostrarCosto,
  mostrarSatisfaccion,
}) {
  const sedeIds = sedes.map((s) => s.id);
  const [sedeFiltro, setSedeFiltro] = useState(null);
  const [avisoReporte, setAvisoReporte] = useState("");

  const solicitudes = data.solicitudes.filter(
    (s) =>
      sedeIds.includes(s.sedeId) && (!sedeFiltro || s.sedeId === sedeFiltro),
  );
  const ordenes = data.ordenes.filter(
    (o) =>
      sedeIds.includes(o.sedeId) && (!sedeFiltro || o.sedeId === sedeFiltro),
  );

  const cuenta = (estado) =>
    solicitudes.filter((s) => s.estado === estado).length +
    ordenes.filter((o) => o.estado === estado).length;

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").length;
  const enProceso = cuenta("en_proceso");
  const programadas = cuenta("programada");
  const completadas = cuenta("completada");

  const alcance = sedeFiltro ? [sedeFiltro] : sedeIds;
  const kpi = useMemo(
    () => indicadoresMes(data, alcance, mes),
    [data, sedeFiltro, mes, sedeIds.join(",")],
  );
  const serieCosto = useMemo(
    () => serieCostoEstudiante(data, alcance, mes),
    [data, sedeFiltro, mes, sedeIds.join(",")],
  );
  const avanceGlobal = useMemo(
    () => avancePlan(data, alcance),
    [data, sedeFiltro, sedeIds.join(",")],
  );
  const sat = useMemo(
    () => satisfaccion(data, alcance),
    [data, sedeFiltro, sedeIds.join(",")],
  );
  const avancePorSede = useMemo(
    () =>
      sedes
        .filter((s) => !sedeFiltro || s.id === sedeFiltro)
        .map((s) => ({
          ...avancePlan(data, [s.id]),
          sedeId: s.id,
          nombre: s.nombre,
        }))
        .filter((a) => a.total > 0),
    [data, sedeFiltro, sedeIds.join(",")],
  );

  const presupuestos = sedes.map((s) => ({
    ...presupuestoSedeMes(data, s.id, mes),
    nombre: s.nombre,
  }));
  const gastoMes = presupuestos.reduce((a, p) => a + p.gastado, 0);
  const presupuestoMes = presupuestos.reduce((a, p) => a + p.presupuesto, 0);

  const porSede = sedes.map((s) => ({
    id: s.id,
    nombre: s.nombre.length > 10 ? s.nombre.slice(0, 9) + "…" : s.nombre,
    correctivos: data.solicitudes.filter((x) => x.sedeId === s.id).length,
    preventivos: data.ordenes.filter((x) => x.sedeId === s.id).length,
  }));

  const sedeSel = sedeFiltro ? sedes.find((s) => s.id === sedeFiltro) : null;

  return (
    <div className="mt-4 space-y-4">
      {/* Periodo del tablero y emisión del reporte de gestión */}
      <div
        className="flex items-center justify-between gap-2 flex-wrap border rounded-md p-2.5"
        style={cardStyle}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={cSlate}
          >
            Periodo
          </span>
          <MesSelector mes={mes} onChange={onMesChange} />
        </div>
        {mostrarCosto && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => {
                const via = imprimirHTML(
                  construirReporteMensualHTML(data, mes),
                  `reporte-gestion-${mes}.html`,
                );
                if (via !== "ventana") {
                  const msgs = {
                    iframe:
                      'El navegador bloqueó la pestaña de impresión; se abrió de otra forma. Si no ves el diálogo de imprimir, usa "Descargar".',
                    descarga:
                      "No se pudo abrir la impresión automática; se descargó el archivo para que lo abras e imprimas.",
                    fallo:
                      'No se pudo generar el reporte automáticamente. Usa el botón "Descargar" para intentarlo de nuevo.',
                  };
                  setAvisoReporte(msgs[via] || "");
                  setTimeout(() => setAvisoReporte(""), 7000);
                }
              }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white"
              style={{ background: COLORS.orange }}
            >
              <Download size={13} /> Reporte de gestión mensual
            </button>
            <button
              onClick={() =>
                descargarHTML(
                  construirReporteMensualHTML(data, mes),
                  `reporte-gestion-${mes}.html`,
                )
              }
              title="Descarga el reporte como archivo HTML; ábrelo en el navegador y usa Imprimir → Guardar como PDF"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border"
              style={{ borderColor: COLORS.line, color: COLORS.charcoal }}
            >
              Descargar
            </button>
          </div>
        )}
      </div>
      {avisoReporte && (
        <p
          className="text-[11px] rounded-md px-3 py-2"
          style={{ background: `${COLORS.ambar}18`, color: COLORS.charcoal }}
        >
          {avisoReporte}
        </p>
      )}

      {sedes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSedeFiltro(null)}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border"
            style={{
              borderColor: !sedeFiltro ? COLORS.orange : COLORS.line,
              color: !sedeFiltro ? COLORS.orange : COLORS.slate,
              background: !sedeFiltro ? `${COLORS.orange}12` : "white",
            }}
          >
            Todas
          </button>
          {sedes.map((s) => (
            <button
              key={s.id}
              onClick={() => setSedeFiltro(s.id === sedeFiltro ? null : s.id)}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border flex items-center gap-1.5"
              style={{
                borderColor:
                  sedeFiltro === s.id
                    ? sedeColor(data.sedes, s.id)
                    : COLORS.line,
                color:
                  sedeFiltro === s.id
                    ? sedeColor(data.sedes, s.id)
                    : COLORS.slate,
                background:
                  sedeFiltro === s.id
                    ? `${sedeColor(data.sedes, s.id)}12`
                    : "white",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: sedeColor(data.sedes, s.id) }}
              />
              {s.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Sin programar"
          value={pendientes}
          icon={<AlertTriangle size={14} />}
          color={COLORS.rojo}
          sub="Correctivos por activar"
        />
        <Stat
          label="Programadas"
          value={programadas}
          icon={<CalendarDays size={14} />}
          color={COLORS.ambar}
        />
        <Stat
          label="En proceso"
          value={enProceso}
          icon={<Clock size={14} />}
          color={COLORS.orange}
        />
        <Stat
          label="Completadas"
          value={completadas}
          icon={<CheckCircle2 size={14} />}
          color={COLORS.verde}
        />
      </div>

      {/* Actividades por sede + avance del plan preventivo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border rounded-md p-3" style={cardStyle}>
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={cSlate}
          >
            Actividades por sede
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porSede}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis
                dataKey="nombre"
                tick={{ fontSize: 11, fill: COLORS.slate }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: COLORS.slate }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="preventivos"
                name="Preventivos"
                fill={COLORS.orange}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="correctivos"
                name="Correctivos"
                fill={COLORS.charcoal}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="border rounded-md p-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={cSlate}
            >
              Cumplimiento del plan preventivo
            </p>
            {avanceGlobal.cumplimiento !== null && (
              <Chip color={colorCumpl(avanceGlobal.cumplimiento)}>
                {avanceGlobal.cumplimiento.toFixed(0)}% al día
              </Chip>
            )}
          </div>

          {avancePorSede.length > 0 ? (
            <div className="space-y-3">
              {avancePorSede.map((a) => (
                <div key={a.sedeId}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className="text-xs font-semibold truncate flex items-center gap-1.5"
                      style={cChar}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: sedeColor(data.sedes, a.sedeId) }}
                      />
                      {a.nombre}
                    </span>
                    <span
                      className="text-xs font-bold shrink-0"
                      style={{ color: colorCumpl(a.cumplimiento) }}
                    >
                      {a.cumplimiento === null
                        ? "—"
                        : `${a.cumplimiento.toFixed(0)}%`}
                    </span>
                  </div>
                  <div
                    className="h-3 rounded-sm overflow-hidden flex"
                    style={{ background: COLORS.line }}
                  >
                    <div
                      style={{
                        width: `${a.total ? (a.alDia / a.total) * 100 : 0}%`,
                        background: COLORS.verde,
                      }}
                      title={`${a.alDia} al día`}
                    />
                    <div
                      style={{
                        width: `${a.total ? (a.ejecucion / a.total) * 100 : 0}%`,
                        background: COLORS.orange,
                      }}
                      title={`${a.ejecucion} en ejecución`}
                    />
                    <div
                      style={{
                        width: `${a.total ? (a.porVencer / a.total) * 100 : 0}%`,
                        background: COLORS.ambar,
                      }}
                      title={`${a.porVencer} por vencer`}
                    />
                    <div
                      style={{
                        width: `${a.total ? ((a.vencido + a.muyVencido) / a.total) * 100 : 0}%`,
                        background: COLORS.rojo,
                      }}
                      title={`${a.vencido + a.muyVencido} vencidas`}
                    />
                  </div>
                  <p className="text-[10px] mt-1" style={cSlate}>
                    {a.total} tareas · {a.alDia} al día · {a.ejecucion} en
                    ejecución
                    {a.porVencer > 0 ? ` · ${a.porVencer} por vencer` : ""}
                    {a.vencido + a.muyVencido > 0
                      ? ` · ${a.vencido + a.muyVencido} vencidas`
                      : ""}
                  </p>
                </div>
              ))}

              <div
                className="flex items-center gap-3 flex-wrap pt-2 border-t"
                style={bLine}
              >
                {[
                  ["Al día (cuenta al %)", COLORS.verde],
                  ["En ejecución", COLORS.orange],
                  ["Por vencer", COLORS.ambar],
                  ["Vencidas", COLORS.rojo],
                ].map(([l, c]) => (
                  <span
                    key={l}
                    className="flex items-center gap-1 text-[10px]"
                    style={cSlate}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ background: c }}
                    />
                    {l}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <Empty>Aún no hay planes que apliquen a estas sedes.</Empty>
          )}
        </div>
      </div>

      {/* Indicadores de confiabilidad */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${mostrarSatisfaccion ? "lg:grid-cols-3" : ""} gap-3`}
      >
        <GaugeDonut
          titulo="MTBF · entre fallas"
          valor={kpi.mtbf}
          max={GAUGE_MAX_DIAS}
          color={colorMTBF(kpi.mtbf)}
          detalle={
            kpi.nFallas > 0
              ? `${kpi.diasTranscurridos} días ÷ ${kpi.nFallas} correctivos`
              : "Sin correctivos este mes"
          }
        />
        <GaugeDonut
          titulo="MTTR · de reparación"
          valor={kpi.mttr}
          max={GAUGE_MAX_DIAS}
          color={colorMTTR(kpi.mttr)}
          invertido
          detalle={
            kpi.cerrados > 0
              ? `${duracionTexto(kpi.mttr)} · promedio de ${kpi.cerrados} cierre(s)`
              : "Sin correctivos cerrados"
          }
        />
        {mostrarSatisfaccion && <TarjetaSatisfaccion sat={sat} />}
      </div>

      {/* Tendencia del costo por estudiante — solo para administración y cliente */}
      {mostrarCosto && (
        <div className="border rounded-md p-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={cSlate}
            >
              Costo por estudiante
            </p>
            <span className="text-sm font-bold" style={cOrange}>
              {kpi.costoPorEstudiante !== null
                ? money(kpi.costoPorEstudiante)
                : "—"}
            </span>
          </div>
          <p className="text-[10px] mb-2" style={cSlate}>
            Fee de servicio + materiales + servicios externos
          </p>
          <ResponsiveContainer width="100%" height={185}>
            <LineChart
              data={serieCosto}
              margin={{ top: 5, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 11, fill: COLORS.slate }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: COLORS.slate }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip formatter={(v) => [money(v), "Costo por estudiante"]} />
              <Line
                type="monotone"
                dataKey="costo"
                stroke={COLORS.orange}
                strokeWidth={2.5}
                dot={{ r: 3, fill: COLORS.orange }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          {kpi.costoTotal > 0 && (
            <div className="mt-2 pt-2 border-t space-y-1" style={bLine}>
              {[
                ["Fee de servicio", kpi.costoFee, COLORS.verde],
                ["Materiales", kpi.costoMateriales, COLORS.orange],
                ["Servicios externos", kpi.costoServicios, "#3B6EA5"],
              ].map(([label, val, color]) => (
                <div
                  key={label}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="flex items-center gap-1.5" style={cChar}>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: color }}
                    />
                    {label}
                  </span>
                  <span className="font-semibold" style={{ color }}>
                    {money(val)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mostrarPresupuesto && (
        <div className="border rounded-md p-3" style={cardStyle}>
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-3"
            style={cSlate}
          >
            Presupuesto de materiales {sedeSel ? `· ${sedeSel.nombre}` : ""}
          </p>
          <div className="flex items-baseline gap-2 mb-3 flex-wrap">
            <span
              className="text-2xl font-bold"
              style={{
                color: COLORS.charcoal,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {money(gastoMes)}
            </span>
            <span className="text-xs" style={cSlate}>
              de {money(presupuestoMes)} en materiales
            </span>
          </div>
          <div className="space-y-2.5">
            {presupuestos
              .filter((p) => !sedeFiltro || p.sedeId === sedeFiltro)
              .map((p) => (
                <PresupuestoBar key={p.sedeId} p={p} />
              ))}
          </div>
        </div>
      )}

      {mostrarCosto && (
        <TarjetaResumenMes
          data={data}
          persist={persist}
          sedes={sedes}
          mes={mes}
        />
      )}
    </div>
  );
}

/* ============================================================================
   9. VISTA SOLICITANTE  (una sede: dashboard + solicitudes)
   ========================================================================= */

function FormSolicitud({ ubicacion, user, sedes, onSubmit, onClose }) {
  const [descripcion, setDescripcion] = useState("");
  const [criticidad, setCriticidad] = useState("");
  const ahora = new Date();

  return (
    <div className="space-y-4">
      <ReadOnly>{ubicacionTexto(sedes, ubicacion)}</ReadOnly>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="font-semibold" style={cSlate}>
            Solicitante
          </p>
          <p style={cChar}>{user.nombre}</p>
        </div>
        <div>
          <p className="font-semibold" style={cSlate}>
            Fecha y hora
          </p>
          <p style={cChar}>
            {fmtDate(ahora)} · {fmtHora(ahora)}
          </p>
        </div>
      </div>

      <Field label="Detalle de la novedad">
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          placeholder="Describe lo que ocurre..."
          className={`${inputCls} resize-none`}
          style={inputStyle}
        />
      </Field>

      <Field label="Criticidad (opcional)">
        <div className="grid grid-cols-4 gap-1.5">
          {CRITICIDAD_IDS.map((c) => (
            <button
              key={c}
              onClick={() => setCriticidad(criticidad === c ? "" : c)}
              className="text-[11px] font-semibold py-2 rounded-md border"
              style={{
                borderColor:
                  criticidad === c ? CRITICIDAD[c].color : COLORS.line,
                background:
                  criticidad === c ? `${CRITICIDAD[c].color}15` : "white",
                color: criticidad === c ? CRITICIDAD[c].color : COLORS.slate,
              }}
            >
              {CRITICIDAD[c].label}
            </button>
          ))}
        </div>
      </Field>

      <button
        disabled={!descripcion.trim()}
        onClick={() => {
          onSubmit({ descripcion, criticidad });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: COLORS.orange }}
      >
        <Send size={14} /> Enviar solicitud
      </button>
    </div>
  );
}

function BuscadorQR({ sede, onFound }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const buscar = () => {
    setError("");
    const activos = flattenActivos([sede]);
    let id = value.trim();
    try {
      id = new URL(value.trim()).searchParams.get("activo") || id;
    } catch (_) {}
    const found =
      activos.find((a) => a.activoId === id) ||
      activos.find(
        (a) => a.activoNombre.toLowerCase() === value.trim().toLowerCase(),
      );
    if (found) onFound(found);
    else
      setError(
        "No se encontró ese activo. Verifica el enlace o el nombre exacto.",
      );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs" style={cSlate}>
        Al escanear el QR pegado en el activo, la app se abre directamente en su
        formulario. Si tu cámara no lo abre sola, pega aquí el enlace o escribe
        el nombre exacto del activo.
      </p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && buscar()}
        placeholder="Enlace del QR o nombre del activo"
        className={inputCls}
        style={inputStyle}
      />
      {error && (
        <p className="text-xs" style={{ color: COLORS.rojo }}>
          {error}
        </p>
      )}
      <button
        onClick={buscar}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white"
        style={{ background: COLORS.orange }}
      >
        Buscar activo
      </button>
    </div>
  );
}

function FaseActivos({ fase, onReportar }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-md overflow-hidden" style={cardStyle}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 p-3"
        style={{ background: open ? COLORS.cream : "white" }}
      >
        {open ? (
          <ChevronDown size={15} color={COLORS.charcoal} />
        ) : (
          <ChevronRight size={15} color={COLORS.charcoal} />
        )}
        <Layers size={14} color={COLORS.orange} />
        <span className="text-sm font-semibold flex-1 text-left" style={cChar}>
          {fase.nombre}
        </span>
        <span className="text-[10px]" style={cSlate}>
          {fase.activos.length} activos
        </span>
      </button>
      {open && (
        <div
          className="p-2.5 space-y-2"
          style={{ borderTop: `1px solid ${COLORS.line}` }}
        >
          {fase.activos.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 border rounded-md p-2.5"
              style={bLine}
            >
              <p className="text-xs font-semibold truncate" style={cChar}>
                {a.nombre}
              </p>
              <button
                onClick={() => onReportar(fase, a)}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded shrink-0"
                style={{ background: COLORS.orange, color: "white" }}
              >
                Reportar
              </button>
            </div>
          ))}
          {fase.activos.length === 0 && (
            <Empty>Sin activos en esta fase.</Empty>
          )}
        </div>
      )}
    </div>
  );
}

function VistaSolicitante({ data, persist, user, onLogout, ultimaSync }) {
  const sede = data.sedes.find((s) => s.id === user.sedeIds[0]);
  const [tab, setTab] = useState("dashboard");
  const [mes, setMes] = useState(mesKey(fmtDate(new Date())));
  const [target, setTarget] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!sede) return;
    try {
      const p = new URLSearchParams(window.location.search).get("activo");
      if (p) {
        const f = flattenActivos([sede]).find((a) => a.activoId === p);
        if (f) setTarget(f);
      }
    } catch (_) {}
  }, [sede?.id]);

  if (!sede) {
    return (
      <div className="max-w-sm mx-auto px-4 pt-14 text-center">
        <Empty>
          Tu usuario no tiene una sede asignada. Contacta al administrador.
        </Empty>
        <button
          onClick={onLogout}
          className="mt-4 text-xs font-semibold"
          style={cOrange}
        >
          Salir
        </button>
      </div>
    );
  }

  const misSolicitudes = data.solicitudes
    .filter((s) => s.solicitanteId === user.id)
    .sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? 1 : -1));

  const calificar = (id, patch) =>
    persist((data) => ({
      ...data,
      solicitudes: data.solicitudes.map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      ),
    }));

  const crearSolicitud = (ubic, form) => {
    const now = new Date();
    persist((d) => {
      const n = d.solCounter || 1;
      const nueva = {
        id: uid("sol"),
        codigo: `SOL-${String(n).padStart(4, "0")}`,
        sedeId: sede.id,
        faseId: ubic.faseId,
        activoId: ubic.activoId,
        descripcion: form.descripcion,
        criticidad: form.criticidad || "",
        solicitanteId: user.id,
        fecha: fmtDate(now),
        hora: fmtHora(now),
        estado: "pendiente",
        tecnicoId: "",
        fechaProgramada: "",
        fechaCompletada: "",
        observaciones: "",
        foto: "",
        resolucion: "",
        materiales: [],
        materialesEstado: "",
        calificacion: 0,
        comentarioCalif: "",
      };
      setMsg(`Solicitud ${nueva.codigo} enviada.`);
      setTimeout(() => setMsg(""), 4000);
      return {
        ...d,
        solicitudes: [nueva, ...d.solicitudes],
        solCounter: n + 1,
      };
    });
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={14} /> },
    {
      id: "solicitudes",
      label: "Solicitudes",
      icon: <ClipboardList size={14} />,
    },
  ];

  return (
    <ProveedorDetalle data={data}>
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <AppHeader
          user={user}
          onLogout={onLogout}
          ultimaSync={ultimaSync}
          sedesTexto={sede.nombre}
        />
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "dashboard" && (
          <Dashboard
            data={data}
            persist={persist}
            sedes={[sede]}
            mes={mes}
            onMesChange={setMes}
            mostrarPresupuesto
          />
        )}

        {tab === "solicitudes" && (
          <div className="mt-4">
            <button
              onClick={() => setQrOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-md border"
              style={{
                borderColor: COLORS.line,
                color: COLORS.charcoal,
                background: "white",
              }}
            >
              <QrCode size={14} /> Escanear QR de un activo
            </button>

            {msg && (
              <div
                className="mt-3 text-sm rounded-md p-3 flex items-center gap-2"
                style={{ background: `${COLORS.verde}15`, color: COLORS.verde }}
              >
                <CheckCircle2 size={16} /> {msg}
              </div>
            )}

            <SectionTitle>Fases y activos</SectionTitle>
            <div className="space-y-2">
              {sede.fases.map((f) => (
                <FaseActivos
                  key={f.id}
                  fase={f}
                  onReportar={(fase, act) =>
                    setTarget({
                      sedeId: sede.id,
                      faseId: fase.id,
                      activoId: act.id,
                    })
                  }
                />
              ))}
              {sede.fases.length === 0 && (
                <Empty>Esta sede aún no tiene fases configuradas.</Empty>
              )}
            </div>

            <SectionTitle count={misSolicitudes.length}>
              Mis solicitudes
            </SectionTitle>
            <div className="space-y-2">
              {misSolicitudes.map((s) => (
                <div
                  key={s.id}
                  className="border rounded-md p-3"
                  style={cardStyle}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold" style={cOrange}>
                        {s.codigo}
                      </span>
                      {s.criticidad && (
                        <Chip color={CRITICIDAD[s.criticidad].color}>
                          {CRITICIDAD[s.criticidad].label}
                        </Chip>
                      )}
                    </div>
                    <EstadoChip estado={s.estado} />
                  </div>
                  <p className="text-sm font-semibold mt-1" style={cChar}>
                    {ubicacionTexto(data.sedes, s)}
                  </p>
                  <p className="text-sm mt-0.5" style={cSlate}>
                    {s.descripcion}
                  </p>
                  <p className="text-[11px] mt-1" style={cSlate}>
                    {s.fecha} · {s.hora}
                    {s.tecnicoId
                      ? ` · Atiende: ${usuarioNombre(data.usuarios, s.tecnicoId)}`
                      : ""}
                    {s.fechaProgramada
                      ? ` · Programado: ${s.fechaProgramada}`
                      : ""}
                  </p>
                  {s.fechaCompletada && (
                    <p
                      className="text-[11px] mt-0.5 font-semibold"
                      style={{ color: COLORS.verde }}
                    >
                      Finalizada el {s.fechaCompletada}
                      {s.horaCompletada ? ` · ${s.horaCompletada}` : ""}
                      {` · atendida en ${duracionTexto(horasEntre(s.fecha, s.hora, s.fechaCompletada, s.horaCompletada) / 24)}`}
                    </p>
                  )}
                  {s.resolucion && (
                    <p
                      className="text-xs mt-2 rounded p-2"
                      style={{
                        background: COLORS.cream,
                        color: COLORS.charcoal,
                      }}
                    >
                      <strong>Resuelto:</strong> {s.resolucion}
                    </p>
                  )}
                  {s.estado === "completada" && (
                    <BloqueCalificacion
                      solicitud={s}
                      onCalificar={(patch) => calificar(s.id, patch)}
                    />
                  )}
                </div>
              ))}
              {misSolicitudes.length === 0 && (
                <Empty>Aún no has enviado solicitudes.</Empty>
              )}
            </div>
          </div>
        )}

        {target && (
          <Modal title="Reportar novedad" onClose={() => setTarget(null)}>
            <FormSolicitud
              ubicacion={target}
              user={user}
              sedes={data.sedes}
              onSubmit={(form) => crearSolicitud(target, form)}
              onClose={() => setTarget(null)}
            />
          </Modal>
        )}
        {qrOpen && (
          <Modal title="Escanear QR" onClose={() => setQrOpen(false)}>
            <BuscadorQR
              sede={sede}
              onFound={(a) => {
                setTarget(a);
                setQrOpen(false);
              }}
            />
          </Modal>
        )}
      </div>
    </ProveedorDetalle>
  );
}

/* ============================================================================
   10. VISTA TÉCNICO  (varias sedes: dashboard + pendientes + mis actividades)
   ========================================================================= */

function TarjetaPendiente({ item, sedes, usuarios, onActivar }) {
  const esPrev = item.tipo === "preventivo";
  const esServ = item.tipo === "servicio";
  const tipoColor = tipoMeta(item.tipo).color;
  const dur =
    DURACION_UNIDADES.find(([v]) => v === item.duracionUnidad)?.[1] ||
    item.duracionUnidad;
  const sem = semaforoDe(item);

  return (
    <div
      className="border rounded-md p-2.5"
      style={{
        borderColor: COLORS.line,
        borderLeft: `3px solid ${tipoColor}`,
        background: "white",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <TipoChip tipo={item.tipo} />
          {item.codigo && (
            <span className="text-[10px] font-bold" style={cChar}>
              {item.codigo}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <BotonDetalle item={item} size={13} />
          <Semaforo item={item} />
        </span>
      </div>
      <p className="text-xs font-semibold" style={cChar}>
        {item.tarea}
      </p>
      <p className="text-[10px] mt-0.5" style={cSlate}>
        {ubicacionTexto(sedes, item)}
      </p>

      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <Chip color={sem.color}>{sem.label}</Chip>
        {esPrev && (
          <>
            <Chip>{item.frecuencia}</Chip>
            {item.duracionValor ? (
              <Chip>
                ~{item.duracionValor} {dur}
              </Chip>
            ) : null}
          </>
        )}
        {esPrev && item.categoria && (
          <Chip color={COLORS.orange}>{item.categoria}</Chip>
        )}
        {esServ && Number(item.presupuesto) > 0 && (
          <Chip color={COLORS.orange}>{money(item.presupuesto)}</Chip>
        )}
        {esServ && item.estadoServicio && (
          <EstadoChip estado={item.estadoServicio} />
        )}
      </div>

      <p className="text-[10px] mt-1" style={cSlate}>
        {esPrev
          ? `Último mantenimiento: ${item.ultimoMantenimiento || "sin registro previo"}`
          : esServ
            ? `${item.proveedor || "Sin proveedor"} · programado ${item.fecha}`
            : `Reportó ${usuarioNombre(usuarios, item.solicitanteId)} · ${item.fecha} ${item.hora}`}
      </p>

      {esServ ? (
        <p
          className="text-[9px] mt-1.5 rounded px-2 py-1"
          style={{ background: COLORS.cream, color: COLORS.slate }}
        >
          Servicio externo — ya programado. Se gestiona desde la pestaña
          Servicios.
        </p>
      ) : (
        onActivar && (
          <button
            onClick={onActivar}
            className="mt-2 w-full text-[11px] font-semibold py-1.5 rounded"
            style={{ background: tipoColor, color: "white" }}
          >
            Activar
          </button>
        )
      )}
    </div>
  );
}

const TIPO_PLURAL = {
  preventivo: "Preventivos",
  correctivo: "Correctivos",
  servicio: "Servicios",
};

/* Grupo de un tipo dentro de una sede. Colapsado por defecto para mantener
   la vista corta; se abre solo si tiene actividades urgentes. */
function GrupoTipo({ tipo, items, todosLosSedes, usuarios, onActivar }) {
  const urgentes = items.filter((i) => semaforoDe(i).nivel >= 3).length;
  const [open, setOpen] = useState(urgentes > 0);
  const meta = tipoMeta(tipo);

  return (
    <div
      className="border rounded-md overflow-hidden"
      style={{
        borderColor: COLORS.line,
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-2"
        style={{ background: open ? COLORS.paper : "white" }}
      >
        {open ? (
          <ChevronDown size={13} color={COLORS.slate} />
        ) : (
          <ChevronRight size={13} color={COLORS.slate} />
        )}
        <span
          className="text-[11px] font-bold uppercase tracking-wide flex-1 text-left"
          style={{ color: meta.color }}
        >
          {TIPO_PLURAL[tipo]}
        </span>
        {urgentes > 0 && <Chip color={COLORS.rojo}>{urgentes} urg.</Chip>}
        <Chip color={meta.color}>{items.length}</Chip>
      </button>

      {open && (
        <div
          className="p-2 space-y-2"
          style={{ borderTop: `1px solid ${COLORS.line}` }}
        >
          {ordenarPorUrgencia(items).map((item) => (
            <TarjetaPendiente
              key={item.key}
              item={item}
              sedes={todosLosSedes}
              usuarios={usuarios}
              onActivar={onActivar ? () => onActivar(item) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ArbolPendientes({
  sedes,
  todosLosSedes,
  usuarios,
  pendientes,
  onActivar,
}) {
  const [abiertas, setAbiertas] = useState({});
  const toggle = (id) => setAbiertas((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="space-y-2">
      {sedes.map((sede) => {
        const items = pendientes.filter((p) => p.sedeId === sede.id);
        if (items.length === 0) return null;
        const abierta = !!abiertas[sede.id];
        const criticos = items.filter((i) => semaforoDe(i).nivel >= 3).length;

        return (
          <div
            key={sede.id}
            className="border rounded-md overflow-hidden"
            style={cardStyle}
          >
            <button
              onClick={() => toggle(sede.id)}
              className="w-full flex items-center gap-2.5 p-3"
              style={{ background: abierta ? COLORS.cream : "white" }}
            >
              {abierta ? (
                <ChevronDown size={15} color={COLORS.charcoal} />
              ) : (
                <ChevronRight size={15} color={COLORS.charcoal} />
              )}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: sedeColor(todosLosSedes, sede.id) }}
              />
              <span
                className="text-sm font-bold flex-1 text-left truncate"
                style={cChar}
              >
                {sede.nombre}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                {["preventivo", "correctivo", "servicio"].map((t) => {
                  const n = items.filter((i) => i.tipo === t).length;
                  return n > 0 ? (
                    <Chip key={t} color={tipoMeta(t).color}>
                      {n}
                    </Chip>
                  ) : null;
                })}
              </span>
              {criticos > 0 && <Chip color={COLORS.rojo}>{criticos} urg.</Chip>}
            </button>

            {abierta && (
              <div
                className="p-2.5 space-y-2"
                style={{ borderTop: `1px solid ${COLORS.line}` }}
              >
                {["preventivo", "correctivo", "servicio"].map((tipo) => {
                  const grupo = items.filter((i) => i.tipo === tipo);
                  if (grupo.length === 0) return null;
                  return (
                    <GrupoTipo
                      key={`${sede.id}_${tipo}`}
                      tipo={tipo}
                      items={grupo}
                      todosLosSedes={todosLosSedes}
                      usuarios={usuarios}
                      onActivar={onActivar}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {pendientes.length === 0 && (
        <Empty>No hay actividades pendientes en estas sedes.</Empty>
      )}
    </div>
  );
}

function TarjetaActividad({ item, data, acciones, rol = "tecnico" }) {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState(item.estado);
  const [observaciones, setObservaciones] = useState(item.observaciones || "");
  const [resolucion, setResolucion] = useState(item.resolucion || "");
  const [guardado, setGuardado] = useState(null);
  const esPrev = item.tipo === "preventivo";
  const stockSede = (data.stock || []).filter((x) => x.sedeId === item.sedeId);

  // Si otro usuario modifica este mismo registro, el formulario se pone al día
  // (solo cuando está cerrado, para no borrar lo que el técnico está escribiendo)
  useEffect(() => {
    if (open) return;
    setEstado(item.estado);
    setObservaciones(item.observaciones || "");
    setResolucion(item.resolucion || "");
  }, [item.estado, item.observaciones, item.resolucion, open]);

  const guardar = () => {
    setGuardado("guardando");
    const patch = { estado, observaciones };
    if (!esPrev) patch.resolucion = resolucion;
    // Sello de cierre: se graba al pasar a completada y se borra si se reabre
    if (estado === "completada") {
      if (!item.fechaCompletada) {
        const ahora = new Date();
        patch.fechaCompletada = fmtDate(ahora);
        patch.horaCompletada = fmtHora(ahora);
      }
    } else if (item.fechaCompletada) {
      patch.fechaCompletada = "";
      patch.horaCompletada = "";
    }
    acciones.updateActividad(item, patch);
    setGuardado("ok");
    setTimeout(() => setGuardado(null), 2500);
  };

  // Registrar consumo descuenta bodega y guarda el valor en la actividad
  const registrarConsumo = (art, cantidad) => {
    acciones.consumirStock(item, art, cantidad);
  };
  const quitarConsumo = (c) => {
    acciones.devolverStock(item, c);
  };

  // Hay cambios sin guardar si el formulario difiere de lo almacenado
  const sinGuardar =
    estado !== item.estado ||
    observaciones !== (item.observaciones || "") ||
    (!esPrev && resolucion !== (item.resolucion || ""));

  return (
    <div
      className="border rounded-md"
      style={{
        borderColor: COLORS.line,
        borderLeft: `3px solid ${tipoMeta(item.tipo).color}`,
        background: "white",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left gap-2"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {open ? (
            <ChevronDown
              size={16}
              color={COLORS.slate}
              className="mt-0.5 shrink-0"
            />
          ) : (
            <ChevronRight
              size={16}
              color={COLORS.slate}
              className="mt-0.5 shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TipoChip tipo={item.tipo} />
              <span className="text-[10px] font-bold" style={cChar}>
                {item.codigo}
              </span>
              {item.criticidad && (
                <Chip color={CRITICIDAD[item.criticidad].color}>
                  {CRITICIDAD[item.criticidad].label}
                </Chip>
              )}
            </div>
            <p className="font-semibold text-sm mt-1 truncate" style={cChar}>
              {item.tarea}
            </p>
            <p className="text-xs truncate" style={cSlate}>
              {ubicacionTexto(data.sedes, item)}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 shrink-0">
          <EstadoChip estado={item.estado} />
          <BotonDetalle item={item} />
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t pt-3" style={bLine}>
          <p className="text-xs" style={cSlate}>
            Programada: {item.fechaProgramada || "—"}
            {!esPrev && item.solicitanteId
              ? ` · Solicitó: ${usuarioNombre(data.usuarios, item.solicitanteId)}`
              : ""}
          </p>

          {item.fechaCompletada && (
            <div
              className="rounded-md p-2.5 flex items-center justify-between gap-2 flex-wrap"
              style={{ background: `${COLORS.verde}12` }}
            >
              <span className="text-[11px]" style={cChar}>
                <CheckCircle2
                  size={11}
                  style={{
                    display: "inline",
                    marginRight: 4,
                    color: COLORS.verde,
                  }}
                />
                Finalizada el {item.fechaCompletada}
                {item.horaCompletada ? ` · ${item.horaCompletada}` : ""}
              </span>
              {!esPrev && item.fecha && (
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: COLORS.verde }}
                >
                  Respuesta:{" "}
                  {duracionTexto(
                    horasEntre(
                      item.fecha,
                      item.hora,
                      item.fechaCompletada,
                      item.horaCompletada,
                    ) / 24,
                  )}
                </span>
              )}
            </div>
          )}

          {!esPrev && (
            <Field label="Descripción de la solicitud">
              <ReadOnly>{item.descripcion}</ReadOnly>
            </Field>
          )}

          {!esPrev && item.calificacion > 0 && (
            <div
              className="rounded-md p-2.5"
              style={{ background: `${COLORS.ambar}12` }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={cSlate}
              >
                Calificación del solicitante
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Estrellas valor={item.calificacion} size={15} readOnly />
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: COLORS.ambar }}
                >
                  {CALIF_TEXTO[item.calificacion]}
                </span>
              </div>
              {item.comentarioCalif && (
                <p className="text-xs mt-1.5" style={cChar}>
                  “{item.comentarioCalif}”
                </p>
              )}
            </div>
          )}
          {esPrev && item.procedimiento && (
            <Field label="Procedimiento">
              <p
                className="text-xs whitespace-pre-wrap rounded-md p-2.5"
                style={{ background: COLORS.cream, color: COLORS.charcoal }}
              >
                {item.procedimiento}
              </p>
            </Field>
          )}

          <Field label="Estado">
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="w-full border rounded-md px-2 py-2 text-sm"
              style={inputStyle}
            >
              {ESTADOS_EJECUCION.map((e) => (
                <option key={e} value={e}>
                  {ESTADOS[e].label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Observaciones">
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="Notas de campo, avance, hallazgos..."
              className={`${inputCls} resize-none`}
              style={inputStyle}
            />
          </Field>

          {!esPrev && (
            <Field label="Resolución">
              <textarea
                value={resolucion}
                onChange={(e) => setResolucion(e.target.value)}
                rows={2}
                placeholder="Qué se hizo para resolverlo"
                className={`${inputCls} resize-none`}
                style={inputStyle}
              />
            </Field>
          )}

          <FotoUploader
            foto={item.foto}
            onChange={(foto) => acciones.updateActividad(item, { foto })}
          />
          {esPrev && (
            <ConsumoStock
              item={item}
              stockSede={stockSede}
              onRegistrar={registrarConsumo}
              onQuitar={quitarConsumo}
              readOnly={item.estado === "completada"}
            />
          )}

          <MaterialesPanel
            item={item}
            rol={rol}
            onUpdate={(patch) => acciones.updateActividad(item, patch)}
            puedeEnviar={estado === "en_proceso"}
          />

          <div>
            <button
              onClick={guardar}
              disabled={guardado === "ok"}
              className="w-full py-2 rounded-md text-sm font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
              style={{
                background:
                  guardado === "ok"
                    ? COLORS.verde
                    : sinGuardar
                      ? COLORS.orange
                      : COLORS.charcoal,
              }}
            >
              {guardado === "ok" ? (
                <>
                  <CheckCircle2 size={14} /> Cambios guardados
                </>
              ) : sinGuardar ? (
                "Guardar cambios"
              ) : (
                "Sin cambios por guardar"
              )}
            </button>
            {sinGuardar && guardado !== "ok" && (
              <p
                className="text-[10px] mt-1 text-center"
                style={{ color: COLORS.orange }}
              >
                Tienes cambios sin guardar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Hallazgo de inspección: el técnico levanta un correctivo en sus sedes. */
function FormHallazgoTecnico({ sedes, user, onSubmit, onClose }) {
  const [sedeId, setSedeId] = useState(sedes[0]?.id || "");
  const [faseId, setFaseId] = useState("");
  const [activoId, setActivoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [criticidad, setCriticidad] = useState("");

  const sede = sedes.find((s) => s.id === sedeId);
  const fase = sede?.fases.find((f) => f.id === faseId);
  const ahora = new Date();
  const valido = sedeId && faseId && activoId && descripcion.trim();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="font-semibold" style={cSlate}>
            Reporta
          </p>
          <p style={cChar}>{user.nombre}</p>
        </div>
        <div>
          <p className="font-semibold" style={cSlate}>
            Fecha y hora
          </p>
          <p style={cChar}>
            {fmtDate(ahora)} · {fmtHora(ahora)}
          </p>
        </div>
      </div>

      <Field label="Sede">
        <select
          value={sedeId}
          onChange={(e) => {
            setSedeId(e.target.value);
            setFaseId("");
            setActivoId("");
          }}
          className="w-full border rounded-md px-2 py-2 text-sm"
          style={inputStyle}
        >
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Fase">
        <select
          value={faseId}
          onChange={(e) => {
            setFaseId(e.target.value);
            setActivoId("");
          }}
          className="w-full border rounded-md px-2 py-2 text-sm"
          style={inputStyle}
        >
          <option value="">Selecciona una fase</option>
          {(sede?.fases || []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </select>
      </Field>

      {faseId && (
        <Field label="Activo">
          <select
            value={activoId}
            onChange={(e) => setActivoId(e.target.value)}
            className="w-full border rounded-md px-2 py-2 text-sm"
            style={inputStyle}
          >
            <option value="">Selecciona un activo</option>
            {(fase?.activos || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Hallazgo">
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          placeholder="Describe lo encontrado en la inspección..."
          className={`${inputCls} resize-none`}
          style={inputStyle}
        />
      </Field>

      <Field label="Criticidad (opcional)">
        <div className="grid grid-cols-4 gap-1.5">
          {CRITICIDAD_IDS.map((c) => (
            <button
              key={c}
              onClick={() => setCriticidad(criticidad === c ? "" : c)}
              className="text-[11px] font-semibold py-2 rounded-md border"
              style={{
                borderColor:
                  criticidad === c ? CRITICIDAD[c].color : COLORS.line,
                background:
                  criticidad === c ? `${CRITICIDAD[c].color}15` : "white",
                color: criticidad === c ? CRITICIDAD[c].color : COLORS.slate,
              }}
            >
              {CRITICIDAD[c].label}
            </button>
          ))}
        </div>
      </Field>

      <button
        disabled={!valido}
        onClick={() => {
          onSubmit({ sedeId, faseId, activoId, descripcion, criticidad });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: COLORS.orange }}
      >
        <Send size={14} /> Registrar hallazgo
      </button>
    </div>
  );
}

function VistaTecnico({ data, persist, user, onLogout, ultimaSync }) {
  const acciones = useAcciones(data, persist);
  const [tab, setTab] = useState("dashboard");
  const [mes, setMes] = useState(mesKey(fmtDate(new Date())));
  const [hallazgo, setHallazgo] = useState(false);
  const [activar, setActivar] = useState(null);
  const [msg, setMsg] = useState("");

  const misSedes = sedesVisibles(data, user);
  const misSedeIds = misSedes.map((s) => s.id);
  const pendientes = getPendientes(data).filter((p) =>
    misSedeIds.includes(p.sedeId),
  );
  const activables = pendientes.filter((p) => p.tipo !== "servicio").length;
  const actividades = actividadesDeTecnico(data, user.id);
  const activas = actividades.filter((a) => a.estado !== "completada");
  const cerradas = actividades.filter((a) => a.estado === "completada");

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={14} /> },
    {
      id: "mias",
      label: `Mis actividades (${activas.length})`,
      icon: <Wrench size={14} />,
    },
    {
      id: "programacion",
      label: `Programación (${activables})`,
      icon: <CalendarDays size={14} />,
    },
    { id: "bodega", label: "Bodega", icon: <Layers size={14} /> },
    { id: "reportes", label: "Reportes", icon: <Download size={14} /> },
    { id: "historico", label: "Histórico", icon: <ClipboardList size={14} /> },
  ];

  // El técnico adelanta una actividad pendiente y queda asignada a él
  const activarActividad = (item, tecnicoId, fecha) => {
    if (item.tipo === "correctivo") {
      persist((data) => ({
        ...data,
        solicitudes: data.solicitudes.map((x) =>
          x.id === item.solicitudId
            ? { ...x, tecnicoId, fechaProgramada: fecha, estado: "programada" }
            : x,
        ),
      }));
    } else {
      persist((d) => {
        const n = d.otCounter || 1;
        return {
        ...d,
        ordenes: [
          ...d.ordenes,
          {
            id: uid("ot"),
            codigo: `OT-${String(n).padStart(4, "0")}`,
            planId: item.planId,
            tarea: item.tarea,
            procedimiento: item.procedimiento,
            categoria: item.categoria,
            frecuencia: item.frecuencia,
            duracionValor: item.duracionValor,
            duracionUnidad: item.duracionUnidad,
            sedeId: item.sedeId,
            faseId: item.faseId,
            activoId: item.activoId,
            tecnicoId,
            fechaProgramada: fecha,
            fechaCompletada: "",
            estado: "programada",
            observaciones: "",
            foto: "",
            materiales: [],
            materialesEstado: "",
            consumos: [],
            createdAt: fmtDate(new Date()),
          },
        ],
        otCounter: n + 1,
        };
      });
    }
    setMsg("Actividad activada y asignada a ti. Ya aparece en el calendario.");
    setTimeout(() => setMsg(""), 4000);
  };

  const crearHallazgo = (form) => {
    const now = new Date();
    persist((d) => {
      const n = d.solCounter || 1;
      const nueva = {
        id: uid("sol"),
        codigo: `SOL-${String(n).padStart(4, "0")}`,
        sedeId: form.sedeId,
        faseId: form.faseId,
        activoId: form.activoId,
        descripcion: form.descripcion,
        criticidad: form.criticidad || "",
        solicitanteId: user.id,
        fecha: fmtDate(now),
        hora: fmtHora(now),
        estado: "pendiente",
        tecnicoId: "",
        fechaProgramada: "",
        fechaCompletada: "",
        observaciones: "",
        foto: "",
        resolucion: "",
        materiales: [],
        materialesEstado: "",
        calificacion: 0,
        comentarioCalif: "",
      };
      setMsg(
        `Hallazgo ${nueva.codigo} registrado. Queda pendiente de programación.`,
      );
      setTimeout(() => setMsg(""), 4000);
      return {
        ...d,
        solicitudes: [nueva, ...d.solicitudes],
        solCounter: n + 1,
      };
    });
  };

  return (
    <ProveedorDetalle data={data}>
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <AppHeader
          user={user}
          onLogout={onLogout}
          ultimaSync={ultimaSync}
          sedesTexto={`${misSedes.length} sede${misSedes.length === 1 ? "" : "s"}`}
        />
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {msg && (
          <div
            className="mt-3 text-sm rounded-md p-3 flex items-center gap-2"
            style={{ background: `${COLORS.verde}15`, color: COLORS.verde }}
          >
            <CheckCircle2 size={16} /> {msg}
          </div>
        )}

        {tab === "dashboard" && (
          <Dashboard
            data={data}
            persist={persist}
            sedes={misSedes}
            mes={mes}
            onMesChange={setMes}
            mostrarPresupuesto
            mostrarSatisfaccion
          />
        )}

        {tab === "mias" && (
          <div className="mt-4">
            <button
              onClick={() => setHallazgo(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-md border"
              style={{
                borderColor: COLORS.orange,
                color: COLORS.orange,
                background: "white",
              }}
            >
              <Plus size={14} /> Registrar hallazgo de inspección
            </button>
            <SectionTitle count={activas.length}>Por ejecutar</SectionTitle>
            <div className="space-y-2">
              {activas.map((a) => (
                <TarjetaActividad
                  key={a.id}
                  item={a}
                  data={data}
                  acciones={acciones}
                />
              ))}
              {activas.length === 0 && (
                <Empty>No tienes actividades activas asignadas.</Empty>
              )}
            </div>

            {cerradas.length > 0 && (
              <>
                <SectionTitle count={cerradas.length}>Completadas</SectionTitle>
                <div className="space-y-2">
                  {cerradas.map((a) => (
                    <TarjetaActividad
                      key={a.id}
                      item={a}
                      data={data}
                      acciones={acciones}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "bodega" && (
          <VistaBodega
            data={data}
            persist={persist}
            sedes={misSedes}
            editable={false}
          />
        )}
        {tab === "reportes" && (
          <VistaReportes data={data} sedes={misSedes} user={user} />
        )}
        {tab === "historico" && (
          <VistaHistorico data={data} sedes={misSedes} rol="tecnico" />
        )}

        {tab === "programacion" && (
          <PanelProgramacion
            data={data}
            sedes={misSedes}
            pendientes={pendientes}
            onActivar={setActivar}
            tecnicoDefault={user.id}
            nota="Sin programar en tus sedes. Al activar una queda asignada a ti y aparece en el calendario."
          />
        )}

        {activar && (
          <Modal title="Adelantar actividad" onClose={() => setActivar(null)}>
            <FormActivar
              item={activar}
              data={data}
              soloTecnico={user}
              onConfirm={({ tecnicoId, fecha }) => {
                activarActividad(activar, tecnicoId, fecha);
                setActivar(null);
              }}
              onClose={() => setActivar(null)}
            />
          </Modal>
        )}

        {hallazgo && (
          <Modal title="Registrar hallazgo" onClose={() => setHallazgo(false)}>
            <FormHallazgoTecnico
              sedes={misSedes}
              user={user}
              onSubmit={crearHallazgo}
              onClose={() => setHallazgo(false)}
            />
          </Modal>
        )}
      </div>
    </ProveedorDetalle>
  );
}

/* ============================================================================
   11. ADMIN · Edición de la jerarquía de sedes
   ========================================================================= */

function EditableLabel({ value, onSave, className, style }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => {
          const v = val.trim();
          if (v) onSave(v);
          else setVal(value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setVal(value);
            setEditing(false);
          }
        }}
        className="border rounded px-1.5 py-0.5 text-sm outline-none w-full"
        style={{ borderColor: COLORS.orange, ...style }}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 cursor-text ${className}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Toca para renombrar"
    >
      {value}
      <Pencil size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
    </span>
  );
}

function InlineAdd({ placeholder, onAdd, small }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const submit = () => {
    if (value.trim()) onAdd(value.trim());
    setValue("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={`flex items-center gap-1.5 font-semibold ${small ? "text-[11px] py-1" : "text-xs py-2"}`}
        style={cOrange}
      >
        <Plus size={small ? 12 : 14} /> {placeholder}
      </button>
    );
  }
  return (
    <div
      className="flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setValue("");
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className="flex-1 border rounded px-2 py-1 text-xs outline-none"
        style={{ borderColor: COLORS.orange }}
      />
      <button
        onClick={submit}
        className="text-xs font-semibold px-2 py-1 rounded text-white shrink-0"
        style={{ background: COLORS.orange }}
      >
        OK
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setValue("");
        }}
        className="shrink-0"
      >
        <X size={14} color={COLORS.slate} />
      </button>
    </div>
  );
}

function DeleteBtn({ onConfirm, size = 13 }) {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setAsk(true);
        }}
        className="shrink-0 opacity-50 hover:opacity-100"
      >
        <Trash2 size={size} color={COLORS.slate} />
      </button>
    );
  return (
    <div
      className="flex items-center gap-1 shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onConfirm}
        className="text-[9px] font-semibold px-1.5 py-1 rounded text-white"
        style={{ background: COLORS.rojo }}
      >
        Sí
      </button>
      <button
        onClick={() => setAsk(false)}
        className="text-[9px] font-semibold"
        style={cSlate}
      >
        No
      </button>
    </div>
  );
}

/* Ficha de la sede: datos maestros que alimentan presupuesto y costo/estudiante. */
function FormSede({ initial, onSave, onClose }) {
  const [nombre, setNombre] = useState(initial?.nombre || "");
  const [estudiantes, setEstudiantes] = useState(initial?.estudiantes ?? "");
  const [presupuesto, setPresupuesto] = useState(
    initial?.presupuestoPreventivo ?? PRESUPUESTO_MENSUAL_SEDE,
  );
  const [fee, setFee] = useState(initial?.feeServicio ?? "");
  const [constructor, setConstructor] = useState(initial?.constructor || "");
  const est = Number(estudiantes) || 0;

  return (
    <div className="space-y-3">
      <Field label="Nombre de la sede">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Quitumbe"
          className={inputCls}
          style={inputStyle}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="N° de estudiantes">
          <input
            type="number"
            min="0"
            value={estudiantes}
            onChange={(e) => setEstudiantes(e.target.value)}
            placeholder="0"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="Presupuesto materiales (USD/mes)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={presupuesto}
            onChange={(e) => setPresupuesto(e.target.value)}
            placeholder="100"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Fee de servicio (USD/mes)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="450"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="Constructor">
          <input
            value={constructor}
            onChange={(e) => setConstructor(e.target.value)}
            placeholder="Constructora"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      </div>

      {est > 0 && (
        <p
          className="text-[10px] rounded-md p-2"
          style={{ background: COLORS.cream, color: COLORS.slate }}
        >
          Base fija: fee {money(fee)} ÷ {est} estudiantes ={" "}
          <strong>{money((Number(fee) || 0) / est)}</strong> por estudiante al
          mes.
        </p>
      )}

      <button
        disabled={!nombre.trim()}
        onClick={() => {
          onSave({
            nombre: nombre.trim(),
            estudiantes: Number(estudiantes) || 0,
            presupuestoPreventivo: Number(presupuesto) || 0,
            feeServicio: Number(fee) || 0,
            constructor: constructor.trim(),
          });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
        style={{ background: COLORS.orange }}
      >
        {initial ? "Guardar cambios" : "Crear sede"}
      </button>
    </div>
  );
}

function AdminSedes({ data, persist }) {
  const [abiertas, setAbiertas] = useState({});
  const [qr, setQr] = useState(null);
  const [fichaSede, setFichaSede] = useState(null);
  const toggle = (id) => setAbiertas((p) => ({ ...p, [id]: !p[id] }));

  const setSedes = (sedes) => persist((data) => ({ ...data, sedes }));
  const mapSede = (sedeId, fn) =>
    setSedes(data.sedes.map((s) => (s.id === sedeId ? fn(s) : s)));
  const mapFase = (sedeId, faseId, fn) =>
    mapSede(sedeId, (s) => ({
      ...s,
      fases: s.fases.map((f) => (f.id === faseId ? fn(f) : f)),
    }));

  const resumen = (sedeId, faseId, activoId) => {
    const match = (x) =>
      x.sedeId === sedeId &&
      (!faseId || x.faseId === faseId) &&
      (!activoId || x.activoId === activoId);
    const prev = data.planes.filter((p) =>
      (p.aplicaciones || []).some(match),
    ).length;
    const cor = data.solicitudes.filter(match);
    return {
      prev,
      cor: cor.length,
      abiertas: cor.filter((c) => c.estado === "pendiente").length,
    };
  };

  const Resumen = ({ r }) => (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
      <Chip>
        <Wrench size={9} /> {r.prev} prev.
      </Chip>
      <Chip color={r.abiertas > 0 ? COLORS.rojo : COLORS.slate}>
        <AlertTriangle size={9} /> {r.cor} correc.
        {r.abiertas > 0 ? ` · ${r.abiertas} sin programar` : ""}
      </Chip>
    </div>
  );

  const qrUrl = qr
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`https://tudominio.com/reportar?activo=${qr.activoId}`)}`
    : null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs mb-1" style={cSlate}>
        Cada sede guarda su ficha (estudiantes, presupuesto de materiales, fee
        de servicio y constructor) y su árbol de fases y activos.
      </p>
      {data.sedes.map((sede) => {
        const abierta = !!abiertas[sede.id];
        return (
          <div
            key={sede.id}
            className="border rounded-md overflow-hidden"
            style={cardStyle}
          >
            <div
              className="flex items-center gap-2.5 p-3"
              style={{ background: abierta ? COLORS.cream : "white" }}
            >
              <button onClick={() => toggle(sede.id)} className="shrink-0">
                {abierta ? (
                  <ChevronDown size={16} color={COLORS.charcoal} />
                ) : (
                  <ChevronRight size={16} color={COLORS.charcoal} />
                )}
              </button>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: sedeColor(data.sedes, sede.id) }}
              />
              <div
                className="min-w-0 flex-1 cursor-pointer"
                onClick={() => toggle(sede.id)}
              >
                <p className="text-sm font-bold" style={cChar}>
                  {sede.nombre}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <Chip>
                    <Users size={9} /> {sede.estudiantes || 0} est.
                  </Chip>
                  <Chip color={COLORS.orange}>
                    {money(sede.presupuestoPreventivo)}/mes mat.
                  </Chip>
                  <Chip color={COLORS.verde}>
                    fee {money(sede.feeServicio)}
                  </Chip>
                </div>
                <Resumen r={resumen(sede.id)} />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFichaSede({ sede });
                }}
                title="Editar ficha de la sede"
              >
                <Pencil size={14} color={COLORS.slate} />
              </button>
              <DeleteBtn
                size={14}
                onConfirm={() =>
                  setSedes(data.sedes.filter((s) => s.id !== sede.id))
                }
              />
            </div>

            {abierta && (
              <div
                className="pl-4 pr-3 pb-3"
                style={{ borderTop: `1px solid ${COLORS.line}` }}
              >
                {sede.fases.map((fase) => (
                  <FaseAdmin
                    key={fase.id}
                    sede={sede}
                    fase={fase}
                    resumen={resumen}
                    Resumen={Resumen}
                    mapFase={mapFase}
                    mapSede={mapSede}
                    setQr={setQr}
                  />
                ))}
                {sede.fases.length === 0 && (
                  <Empty>Esta sede aún no tiene fases.</Empty>
                )}
                <div className="mt-2">
                  <InlineAdd
                    placeholder="Agregar fase"
                    onAdd={(nombre) =>
                      mapSede(sede.id, (s) => ({
                        ...s,
                        fases: [
                          ...s.fases,
                          { id: uid("fase"), nombre, activos: [] },
                        ],
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => setFichaSede({})}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white mt-1"
        style={{ background: COLORS.orange }}
      >
        <Plus size={13} /> Nueva sede
      </button>

      {fichaSede && (
        <Modal
          title={fichaSede.sede ? "Ficha de la sede" : "Nueva sede"}
          onClose={() => setFichaSede(null)}
          wide
        >
          <FormSede
            initial={fichaSede.sede}
            onClose={() => setFichaSede(null)}
            onSave={(f) =>
              fichaSede.sede
                ? mapSede(fichaSede.sede.id, (s) => ({ ...s, ...f }))
                : setSedes([
                    ...data.sedes,
                    { id: uid("sede"), ...f, fases: [] },
                  ])
            }
          />
        </Modal>
      )}

      {qr && (
        <Modal title="Código QR del activo" onClose={() => setQr(null)}>
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold" style={cChar}>
              {qr.activoNombre}
            </p>
            <p className="text-xs" style={cSlate}>
              {qr.sedeNombre} · {qr.faseNombre}
            </p>
            <img
              src={qrUrl}
              alt="QR"
              className="mx-auto rounded border"
              style={bLine}
            />
            <p className="text-xs" style={cSlate}>
              Imprime y pega este QR en el activo. Al escanearlo, el solicitante
              abre el formulario ya ubicado.
            </p>
            <a
              href={qrUrl}
              download={`qr-${qr.activoNombre}.png`}
              className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-md text-white"
              style={{ background: COLORS.charcoal }}
            >
              <Download size={13} /> Descargar QR
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FaseAdmin({ sede, fase, resumen, Resumen, mapFase, mapSede, setQr }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-l-2 pl-3 mt-2" style={bLine}>
      <div className="flex items-center justify-between py-2 gap-2">
        <div
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown size={14} color={COLORS.slate} />
          ) : (
            <ChevronRight size={14} color={COLORS.slate} />
          )}
          <Layers size={13} color={COLORS.orange} />
          <div className="min-w-0">
            <EditableLabel
              value={fase.nombre}
              className="text-sm font-semibold block"
              style={cChar}
              onSave={(nombre) =>
                mapFase(sede.id, fase.id, (f) => ({ ...f, nombre }))
              }
            />
            <Resumen r={resumen(sede.id, fase.id)} />
          </div>
        </div>
        <DeleteBtn
          onConfirm={() =>
            mapSede(sede.id, (s) => ({
              ...s,
              fases: s.fases.filter((f) => f.id !== fase.id),
            }))
          }
        />
      </div>

      {open && (
        <div className="pb-2">
          <p
            className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
            style={cSlate}
          >
            Activos
          </p>
          <div className="space-y-2">
            {fase.activos.map((act) => (
              <div
                key={act.id}
                className="rounded-md p-2.5 border flex items-center justify-between gap-3"
                style={{ borderColor: COLORS.line, background: COLORS.paper }}
              >
                <div className="min-w-0 flex-1">
                  <EditableLabel
                    value={act.nombre}
                    className="text-xs font-semibold"
                    style={cChar}
                    onSave={(nombre) =>
                      mapFase(sede.id, fase.id, (f) => ({
                        ...f,
                        activos: f.activos.map((a) =>
                          a.id === act.id ? { ...a, nombre } : a,
                        ),
                      }))
                    }
                  />
                  <Resumen r={resumen(sede.id, fase.id, act.id)} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() =>
                      setQr({
                        activoId: act.id,
                        activoNombre: act.nombre,
                        sedeNombre: sede.nombre,
                        faseNombre: fase.nombre,
                      })
                    }
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded flex items-center gap-1"
                    style={{ background: COLORS.charcoal, color: "white" }}
                  >
                    <QrCode size={11} /> QR
                  </button>
                  <DeleteBtn
                    onConfirm={() =>
                      mapFase(sede.id, fase.id, (f) => ({
                        ...f,
                        activos: f.activos.filter((a) => a.id !== act.id),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            {fase.activos.length === 0 && <Empty>Sin activos todavía.</Empty>}
          </div>
          <div className="mt-2">
            <InlineAdd
              placeholder="Agregar activo"
              small
              onAdd={(nombre) =>
                mapFase(sede.id, fase.id, (f) => ({
                  ...f,
                  activos: [...f.activos, { id: uid("act"), nombre }],
                }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   12. ADMIN · Planes de mantenimiento
   ========================================================================= */

const TODO = "__TODO__";

function FilaAplicacion({ row, index, sedes, onChange, onRemove, canRemove }) {
  const sede = sedes.find((s) => s.id === row.sedeId);
  const faseEsp = row.faseId !== TODO;
  const fase = faseEsp ? sede?.fases.find((f) => f.id === row.faseId) : null;
  const activoEsp = row.activoId !== TODO;

  return (
    <div className="border rounded-md p-2.5" style={bLine}>
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={cSlate}
        >
          Ubicación {index + 1}
        </span>
        {canRemove && (
          <button onClick={() => onRemove(row.id)}>
            <X size={14} color={COLORS.slate} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Sede">
          <select
            value={row.sedeId}
            onChange={(e) =>
              onChange(row.id, {
                sedeId: e.target.value,
                faseId: TODO,
                activoId: TODO,
                fechaInicial: "",
              })
            }
            className="w-full border rounded-md px-2 py-1.5 text-xs"
            style={inputStyle}
          >
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fase">
          <select
            value={row.faseId}
            onChange={(e) =>
              onChange(row.id, {
                faseId: e.target.value,
                activoId: TODO,
                fechaInicial: "",
              })
            }
            className="w-full border rounded-md px-2 py-1.5 text-xs"
            style={inputStyle}
          >
            <option value={TODO}>Toda la sede</option>
            {(sede?.fases || []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {faseEsp && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Field label="Activo">
            <select
              value={row.activoId}
              onChange={(e) =>
                onChange(row.id, {
                  activoId: e.target.value,
                  fechaInicial:
                    e.target.value !== TODO
                      ? row.fechaInicial || fmtDate(new Date())
                      : "",
                })
              }
              className="w-full border rounded-md px-2 py-1.5 text-xs"
              style={inputStyle}
            >
              <option value={TODO}>Toda la fase</option>
              {(fase?.activos || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </Field>
          {activoEsp && (
            <Field label="Fecha inicial">
              <input
                type="date"
                value={row.fechaInicial}
                onChange={(e) =>
                  onChange(row.id, { fechaInicial: e.target.value })
                }
                className="w-full border rounded-md px-2 py-1.5 text-xs"
                style={inputStyle}
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function FormPlan({ data, initial, onSave, onClose, onAddCategoria }) {
  const categorias = data.categorias || CATEGORIAS_BASE;
  const [tarea, setTarea] = useState(initial?.tarea || "");
  const [procedimiento, setProcedimiento] = useState(
    initial?.procedimiento || "",
  );
  const [categoria, setCategoria] = useState(
    initial?.categoria || categorias[0] || "",
  );
  const [nuevaCat, setNuevaCat] = useState(null);
  const [frecuencia, setFrecuencia] = useState(
    initial?.frecuencia || FRECUENCIAS[0],
  );
  const [durVal, setDurVal] = useState(initial?.duracionValor ?? 30);
  const [durUni, setDurUni] = useState(initial?.duracionUnidad || "minutos");

  const emptyRow = () => ({
    id: uid("row"),
    sedeId: data.sedes[0]?.id || "",
    faseId: TODO,
    activoId: TODO,
    fechaInicial: "",
  });
  const [rows, setRows] = useState(
    initial?.aplicaciones?.length
      ? initial.aplicaciones.map((a) => ({
          id: uid("row"),
          sedeId: a.sedeId,
          faseId: a.faseId || TODO,
          activoId: a.activoId || TODO,
          fechaInicial: a.fechaInicial || "",
        }))
      : [emptyRow()],
  );

  const submit = () => {
    onSave({
      id: initial?.id || uid("plan"),
      tarea: tarea.trim(),
      procedimiento: procedimiento.trim(),
      categoria,
      frecuencia,
      duracionValor: Number(durVal) || 0,
      duracionUnidad: durUni,
      aplicaciones: rows
        .filter((r) => r.sedeId)
        .map((r) => ({
          sedeId: r.sedeId,
          faseId: r.faseId === TODO ? "" : r.faseId,
          activoId: r.activoId === TODO ? "" : r.activoId,
          fechaInicial: r.activoId !== TODO ? r.fechaInicial : "",
        })),
    });
    onClose();
  };

  return (
    <div className="space-y-3">
      <Field label="Tarea">
        <input
          value={tarea}
          onChange={(e) => setTarea(e.target.value)}
          placeholder="Ej. Revisión de luminarias"
          className={inputCls}
          style={inputStyle}
        />
      </Field>

      <Field
        label="Procedimiento"
        hint="Guía paso a paso para cualquier técnico."
      >
        <textarea
          value={procedimiento}
          onChange={(e) => setProcedimiento(e.target.value)}
          rows={4}
          placeholder="1. ...&#10;2. ..."
          className={`${inputCls} resize-none`}
          style={inputStyle}
        />
      </Field>

      <Field label="Categoría">
        {nuevaCat === null ? (
          <select
            value={categoria}
            onChange={(e) =>
              e.target.value === "__NEW__"
                ? setNuevaCat("")
                : setCategoria(e.target.value)
            }
            className="w-full border rounded-md px-2 py-2 text-sm"
            style={inputStyle}
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__NEW__">+ Nueva categoría…</option>
          </select>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nuevaCat}
              onChange={(e) => setNuevaCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNuevaCat(null);
              }}
              placeholder="Nombre de la categoría"
              className={inputCls}
              style={{ borderColor: COLORS.orange }}
            />
            <button
              onClick={() => {
                const v = nuevaCat.trim().toUpperCase();
                if (v) {
                  onAddCategoria(v);
                  setCategoria(v);
                }
                setNuevaCat(null);
              }}
              className="text-xs font-semibold px-2.5 py-2 rounded-md text-white shrink-0"
              style={{ background: COLORS.orange }}
            >
              OK
            </button>
            <button onClick={() => setNuevaCat(null)} className="shrink-0">
              <X size={16} color={COLORS.slate} />
            </button>
          </div>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Frecuencia">
          <select
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value)}
            className="w-full border rounded-md px-2 py-2 text-sm"
            style={inputStyle}
          >
            {FRECUENCIAS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duración aprox.">
          <div className="flex gap-1.5">
            <input
              type="number"
              min="0"
              value={durVal}
              onChange={(e) => setDurVal(e.target.value)}
              className="w-16 border rounded-md px-2 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <select
              value={durUni}
              onChange={(e) => setDurUni(e.target.value)}
              className="flex-1 border rounded-md px-2 py-2 text-sm"
              style={inputStyle}
            >
              {DURACION_UNIDADES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>

      <div className="border-t pt-3" style={bLine}>
        <p
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={cSlate}
        >
          ¿Dónde aplica?
        </p>
        <p className="text-[10px] mb-2" style={cSlate}>
          Una fila por ubicación; pueden ser de sedes distintas. La fecha
          inicial solo aplica al elegir un activo específico.
        </p>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <FilaAplicacion
              key={row.id}
              row={row}
              index={i}
              sedes={data.sedes}
              canRemove={rows.length > 1}
              onChange={(id, patch) =>
                setRows((p) =>
                  p.map((r) => (r.id === id ? { ...r, ...patch } : r)),
                )
              }
              onRemove={(id) => setRows((p) => p.filter((r) => r.id !== id))}
            />
          ))}
        </div>
        <button
          onClick={() => setRows((p) => [...p, emptyRow()])}
          className="flex items-center gap-1.5 text-xs font-semibold mt-2"
          style={cOrange}
        >
          <Plus size={13} /> Agregar ubicación
        </button>
      </div>

      <button
        disabled={!tarea.trim()}
        onClick={submit}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
        style={{ background: COLORS.orange }}
      >
        {initial ? "Guardar cambios" : "Crear plan"}
      </button>
    </div>
  );
}

function TarjetaPlan({ plan, sedes, onEdit, onDelete }) {
  const [verProc, setVerProc] = useState(false);
  const [verUbic, setVerUbic] = useState(false);
  const dur =
    DURACION_UNIDADES.find(([v]) => v === plan.duracionUnidad)?.[1] ||
    plan.duracionUnidad;
  const aps = plan.aplicaciones || [];
  const resumenUbic =
    aps.length === 1
      ? ubicacionTexto(sedes, aps[0])
      : `${aps.length} ubicaciones`;

  return (
    <div className="border rounded-md p-3" style={cardStyle}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={cChar}>
            {plan.tarea}
          </p>
          {plan.categoria && (
            <div className="mt-1">
              <Chip color={COLORS.orange}>{plan.categoria}</Chip>
            </div>
          )}
          <p className="text-xs mt-1" style={cSlate}>
            {resumenUbic}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Chip>{plan.frecuencia}</Chip>
            {plan.duracionValor ? (
              <Chip>
                ~{plan.duracionValor} {dur}
              </Chip>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onEdit}>
            <Pencil size={13} color={COLORS.slate} />
          </button>
          <DeleteBtn onConfirm={onDelete} />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {plan.procedimiento && (
          <button
            onClick={() => setVerProc(!verProc)}
            className="flex items-center gap-1 text-[11px] font-semibold"
            style={cOrange}
          >
            {verProc ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}
            Procedimiento
          </button>
        )}
        {aps.length > 0 && (
          <button
            onClick={() => setVerUbic(!verUbic)}
            className="flex items-center gap-1 text-[11px] font-semibold"
            style={cOrange}
          >
            {verUbic ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}
            Activos relacionados ({aps.length})
          </button>
        )}
      </div>

      {verProc && (
        <p
          className="text-xs whitespace-pre-wrap mt-2 pt-2.5"
          style={{
            borderTop: `1px solid ${COLORS.line}`,
            color: COLORS.charcoal,
          }}
        >
          {plan.procedimiento}
        </p>
      )}
      {verUbic && (
        <div
          className="mt-2 pt-2.5 space-y-1"
          style={{ borderTop: `1px solid ${COLORS.line}` }}
        >
          {aps.map((ap, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs gap-2"
            >
              <span className="min-w-0 truncate" style={cChar}>
                {ubicacionTexto(sedes, ap)}
              </span>
              {ap.fechaInicial && (
                <span className="font-semibold shrink-0" style={cOrange}>
                  {ap.fechaInicial}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   13. ADMIN · Programación (activar pendientes + calendario)
   ========================================================================= */

function FormActivar({ item, data, onConfirm, onClose, soloTecnico }) {
  const tecnicos = soloTecnico
    ? [soloTecnico]
    : tecnicosDeSede(data.usuarios, item.sedeId);
  const [tecnicoId, setTecnicoId] = useState(tecnicos[0]?.id || "");
  const [fecha, setFecha] = useState(item.fechaInicial || fmtDate(new Date()));
  const esPrev = item.tipo === "preventivo";
  const sem = semaforoDe(item);

  return (
    <div className="space-y-3">
      <div className="rounded-md p-3" style={{ background: COLORS.cream }}>
        <div className="flex items-center gap-1.5 mb-1">
          <TipoChip tipo={item.tipo} />
          {item.codigo && (
            <span className="text-[10px] font-bold" style={cChar}>
              {item.codigo}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold" style={cChar}>
          {item.tarea}
        </p>
        <p className="text-xs" style={cSlate}>
          {ubicacionTexto(data.sedes, item)}
        </p>
        {esPrev ? (
          <p
            className="text-xs mt-1.5 flex items-center gap-1.5"
            style={cSlate}
          >
            Último mantenimiento:{" "}
            <span className="font-semibold" style={cChar}>
              {item.ultimoMantenimiento || "sin registro previo"}
            </span>
            <Semaforo item={item} showLabel />
          </p>
        ) : (
          <p className="text-xs mt-1.5" style={cSlate}>
            Solicitó{" "}
            <span className="font-semibold" style={cChar}>
              {usuarioNombre(data.usuarios, item.solicitanteId)}
            </span>{" "}
            · {item.fecha} {item.hora}
          </p>
        )}
      </div>

      {soloTecnico ? (
        <div
          className="text-xs rounded-md p-2.5"
          style={{ background: COLORS.cream, color: COLORS.slate }}
        >
          Quedará asignada a{" "}
          <span className="font-semibold" style={cChar}>
            {soloTecnico.nombre}
          </span>
          .
        </div>
      ) : (
        <Field
          label="Técnico asignado"
          hint={
            tecnicos.length === 0
              ? "No hay técnicos con esta sede a cargo. Asígnala en Configuración → Usuarios."
              : `Técnicos con ${sedeNombre(data.sedes, item.sedeId)} a cargo.`
          }
        >
          <select
            value={tecnicoId}
            onChange={(e) => setTecnicoId(e.target.value)}
            className="w-full border rounded-md px-2 py-2 text-sm"
            style={inputStyle}
          >
            {tecnicos.length === 0 && (
              <option value="">Sin técnicos disponibles</option>
            )}
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Fecha programada">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full border rounded-md px-2 py-2 text-sm"
          style={inputStyle}
        />
      </Field>

      <button
        disabled={!tecnicoId}
        onClick={() => {
          onConfirm({ tecnicoId, fecha });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
        style={{ background: esPrev ? COLORS.orange : COLORS.charcoal }}
      >
        {soloTecnico
          ? "Adelantar y asignarme"
          : esPrev
            ? "Crear orden de trabajo"
            : "Programar atención"}
      </button>
    </div>
  );
}

function TarjetaAgenda({ act, data }) {
  const esServicio = act.tipo === "servicio";
  const esPrev = act.tipo === "preventivo";
  const ver = useDetalle();
  return (
    <div
      onClick={() => ver(act)}
      title="Ver detalle completo"
      className="border rounded-md p-2.5 cursor-pointer hover:shadow-sm transition-shadow"
      style={{
        ...cardStyle,
        borderLeft: `3px solid ${tipoMeta(act.tipo).color}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TipoChip tipo={act.tipo} />
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0"
            style={{ background: sedeColor(data.sedes, act.sedeId) }}
          >
            {act.codigo}
          </span>
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <EstadoChip estado={act.estado} />
          <Info size={13} color={COLORS.slate} />
        </span>
      </div>
      <p className="text-xs font-semibold mt-1" style={cChar}>
        {act.tarea}
      </p>
      <p className="text-[10px] mt-0.5" style={cSlate}>
        {ubicacionTexto(data.sedes, act)}
      </p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="text-[10px] min-w-0 truncate" style={cSlate}>
          {esServicio
            ? act.proveedor || "Sin proveedor"
            : usuarioNombre(data.usuarios, act.tecnicoId)}
          {!esPrev && !esServicio && act.solicitanteId
            ? ` · Solicitó: ${usuarioNombre(data.usuarios, act.solicitanteId)}`
            : ""}
        </p>
        {esServicio && Number(act.presupuesto) > 0 && (
          <span className="text-[10px] font-bold shrink-0" style={cOrange}>
            {money(act.presupuesto)}
          </span>
        )}
      </div>
    </div>
  );
}

/* Calendario de la agenda. Se puede acotar a un grupo de sedes (técnico) y
   preseleccionar un responsable para que vea primero lo suyo. */
function Calendario({ data, sedes, tecnicoDefault }) {
  const sedesVista = sedes || data.sedes;
  const sedeIds = sedesVista.map((s) => s.id);

  const [modo, setModo] = useState("mes");
  const [ancla, setAncla] = useState(new Date());
  const [fSede, setFSede] = useState("todas");
  const [fTecnico, setFTecnico] = useState(tecnicoDefault || "todos");
  const [fSolicitante, setFSolicitante] = useState("todos");
  const [fTipo, setFTipo] = useState("todos");
  const [diaModal, setDiaModal] = useState(null);
  const [abiertos, setAbiertos] = useState({});

  const agenda = useMemo(() => {
    const enAlcance = (x) => sedeIds.includes(x.sedeId);
    const pre = data.ordenes
      .filter(enAlcance)
      .map((o) => ({ ...o, tipo: "preventivo" }));
    const cor = data.solicitudes
      .filter((s) => s.fechaProgramada && enAlcance(s))
      .map((s) => ({ ...s, tipo: "correctivo", tarea: s.descripcion }));
    // Los servicios externos se agendan por su fecha programada
    const srv = (data.servicios || [])
      .filter((x) => x.fecha && enAlcance(x))
      .map((x) => ({
        ...x,
        tipo: "servicio",
        tarea: x.trabajo,
        fechaProgramada: x.fecha,
        tecnicoId: "",
      }));
    return [...pre, ...cor, ...srv];
  }, [data.ordenes, data.solicitudes, data.servicios, sedeIds.join(",")]);

  const tecnicos = data.usuarios.filter((u) => u.rol === "tecnico");
  const solicitantes = data.usuarios.filter((u) => u.rol === "solicitante");

  const filtrada = agenda.filter(
    (a) =>
      (fSede === "todas" || a.sedeId === fSede) &&
      (fTecnico === "todos" || a.tecnicoId === fTecnico) &&
      (fSolicitante === "todos" || a.solicitanteId === fSolicitante) &&
      (fTipo === "todos" || a.tipo === fTipo),
  );

  const porFecha = useMemo(() => {
    const m = {};
    filtrada.forEach((a) => {
      if (a.fechaProgramada)
        (m[a.fechaProgramada] = m[a.fechaProgramada] || []).push(a);
    });
    return m;
  }, [filtrada]);

  const shift = (d) => {
    const n = new Date(ancla);
    if (modo === "mes") n.setMonth(n.getMonth() + d);
    else n.setDate(n.getDate() + d * 7);
    setAncla(n);
  };

  const semanas = useMemo(() => {
    if (modo !== "mes") return null;
    const y = ancla.getFullYear(),
      m = ancla.getMonth();
    const inicio = (new Date(y, m, 1).getDay() + 6) % 7;
    const dias = new Date(y, m + 1, 0).getDate();
    const cells = Array(inicio).fill(null);
    for (let d = 1; d <= dias; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [ancla, modo]);

  const diasSemana = useMemo(() => {
    if (modo !== "semana") return null;
    const lunes = new Date(ancla);
    lunes.setDate(ancla.getDate() - ((ancla.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      return d;
    });
  }, [ancla, modo]);

  const hoyStr = fmtDate(new Date());
  const titulo =
    modo === "mes"
      ? `${MESES[ancla.getMonth()]} ${ancla.getFullYear()}`
      : (() => {
          const d = diasSemana;
          return `${d[0].getDate()} ${MESES[d[0].getMonth()].slice(0, 3)} — ${d[6].getDate()} ${MESES[d[6].getMonth()].slice(0, 3)}`;
        })();

  const selectCls = "text-xs border rounded-md px-2 py-1.5 bg-white";

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shift(-1)}
            className="w-7 h-7 rounded-md border flex items-center justify-center bg-white"
            style={bLine}
          >
            <ChevronLeft size={14} color={COLORS.charcoal} />
          </button>
          <p
            className="text-sm font-bold capitalize text-center"
            style={{ color: COLORS.charcoal, minWidth: 130 }}
          >
            {titulo}
          </p>
          <button
            onClick={() => shift(1)}
            className="w-7 h-7 rounded-md border flex items-center justify-center bg-white"
            style={bLine}
          >
            <ChevronRight size={14} color={COLORS.charcoal} />
          </button>
          <button
            onClick={() => setAncla(new Date())}
            className="text-[11px] font-semibold px-2 py-1 rounded-md border bg-white"
            style={{ borderColor: COLORS.line, color: COLORS.slate }}
          >
            Hoy
          </button>
        </div>
        <div className="flex gap-1">
          {["mes", "semana"].map((v) => (
            <button
              key={v}
              onClick={() => setModo(v)}
              className="text-xs font-semibold px-3 py-1.5 rounded-md border capitalize"
              style={{
                background: modo === v ? COLORS.charcoal : "white",
                color: modo === v ? "white" : COLORS.slate,
                borderColor: modo === v ? COLORS.charcoal : COLORS.line,
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <Filter size={12} color={COLORS.slate} />
        <select
          value={fTipo}
          onChange={(e) => setFTipo(e.target.value)}
          className={selectCls}
          style={inputStyle}
        >
          <option value="todos">Todo tipo</option>
          <option value="preventivo">Preventivos</option>
          <option value="correctivo">Correctivos</option>
          <option value="servicio">Servicios</option>
        </select>
        <select
          value={fSede}
          onChange={(e) => setFSede(e.target.value)}
          className={selectCls}
          style={inputStyle}
        >
          <option value="todas">
            {sedesVista.length > 1 ? "Todas mis sedes" : "Sede"}
          </option>
          {sedesVista.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <select
          value={fTecnico}
          onChange={(e) => setFTecnico(e.target.value)}
          className={selectCls}
          style={inputStyle}
        >
          <option value="todos">Todos los técnicos</option>
          {tecnicoDefault && (
            <option value={tecnicoDefault}>Solo mis actividades</option>
          )}
          {tecnicos
            .filter((t) => t.id !== tecnicoDefault)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
        </select>
        <select
          value={fSolicitante}
          onChange={(e) => setFSolicitante(e.target.value)}
          className={selectCls}
          style={inputStyle}
        >
          <option value="todos">Todos los solicitantes</option>
          {solicitantes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-[10px]" style={cSlate}>
          Tipo:
          {Object.entries(TIPO_META).map(([k, m]) => (
            <span key={k} className="flex items-center gap-1">
              <span
                className="w-2.5 h-1 rounded-sm"
                style={{ background: m.color }}
              />
              {m.label}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1.5 text-[10px]" style={cSlate}>
          Sede:
          {sedesVista.map((s) => (
            <span key={s.id} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: sedeColor(data.sedes, s.id) }}
              />
              {s.nombre}
            </span>
          ))}
        </span>
      </div>

      {modo === "mes" && (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map((d, i) => (
              <div
                key={i}
                className="text-center text-[10px] font-semibold"
                style={cSlate}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {semanas.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = fmtDate(d);
              const dia = porFecha[k] || [];
              const sedesDia = [...new Set(dia.map((o) => o.sedeId))];
              const hoy = k === hoyStr;
              return (
                <button
                  key={i}
                  onClick={() => dia.length && setDiaModal(k)}
                  className="aspect-square rounded-md border p-1 flex flex-col items-center justify-start"
                  style={{
                    borderColor: hoy ? COLORS.orange : COLORS.line,
                    background: dia.length ? COLORS.cream : "white",
                  }}
                >
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: hoy ? COLORS.orange : COLORS.charcoal }}
                  >
                    {d.getDate()}
                  </span>
                  {sedesDia.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                      {sedesDia.slice(0, 3).map((sid) => (
                        <span
                          key={sid}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: sedeColor(data.sedes, sid) }}
                        />
                      ))}
                    </div>
                  )}
                  {dia.length > 0 && (
                    <span
                      className="text-[9px] mt-0.5 font-semibold"
                      style={cSlate}
                    >
                      {dia.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {modo === "semana" && (
        <div className="space-y-1.5">
          {diasSemana.map((d) => {
            const k = fmtDate(d);
            const dia = porFecha[k] || [];
            const hoy = k === hoyStr;
            const open = !!abiertos[k];
            return (
              <div
                key={k}
                className="border rounded-md overflow-hidden"
                style={{
                  borderColor: hoy ? COLORS.orange : COLORS.line,
                  background: "white",
                }}
              >
                <button
                  onClick={() =>
                    dia.length && setAbiertos((p) => ({ ...p, [k]: !p[k] }))
                  }
                  className="w-full flex items-center justify-between px-3 py-2"
                  style={{ background: hoy ? `${COLORS.orange}0D` : "white" }}
                >
                  <div className="flex items-center gap-2">
                    {dia.length > 0 &&
                      (open ? (
                        <ChevronDown size={13} color={COLORS.slate} />
                      ) : (
                        <ChevronRight size={13} color={COLORS.slate} />
                      ))}
                    <span
                      className="text-xs font-semibold"
                      style={{ color: hoy ? COLORS.orange : COLORS.charcoal }}
                    >
                      {
                        ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][
                          (d.getDay() + 6) % 7
                        ]
                      }{" "}
                      {d.getDate()} {MESES[d.getMonth()].slice(0, 3)}
                    </span>
                  </div>
                  {dia.length > 0 && (
                    <Chip color={COLORS.orange}>{dia.length}</Chip>
                  )}
                </button>
                {open && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {dia.map((a) => (
                      <TarjetaAgenda key={a.id} act={a} data={data} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {diaModal && (
        <Modal title={`Agenda · ${diaModal}`} onClose={() => setDiaModal(null)}>
          <div className="space-y-2">
            {(porFecha[diaModal] || []).map((a) => (
              <TarjetaAgenda key={a.id} act={a} data={data} />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Layout de Programación: panel de actividades por activar a la izquierda y
   calendario a la derecha (apilados en móvil). Lo comparten admin y técnico. */
function PanelProgramacion({
  data,
  sedes,
  pendientes,
  onActivar,
  tecnicoDefault,
  nota,
}) {
  return (
    <div className="mt-4 flex flex-col lg:flex-row gap-4">
      <div className="w-full lg:w-1/3 xl:w-1/4">
        <SectionTitle count={pendientes.length}>
          Actividades por sede
        </SectionTitle>
        <p className="text-[10px] mb-2" style={cSlate}>
          {nota}
        </p>
        <ArbolPendientes
          sedes={sedes}
          todosLosSedes={data.sedes}
          usuarios={data.usuarios}
          pendientes={pendientes}
          onActivar={onActivar}
        />
      </div>
      <div className="w-full lg:w-2/3 xl:w-3/4">
        <SectionTitle>Calendario de programación</SectionTitle>
        <Calendario data={data} sedes={sedes} tecnicoDefault={tecnicoDefault} />
      </div>
    </div>
  );
}

function AdminProgramacion({ data, persist }) {
  const [activar, setActivar] = useState(null);
  const pendientes = getPendientes(data);

  const confirmar = ({ tecnicoId, fecha }) => {
    const item = activar;
    if (item.tipo === "correctivo") {
      persist((data) => ({
        ...data,
        solicitudes: data.solicitudes.map((s) =>
          s.id === item.solicitudId
            ? { ...s, tecnicoId, fechaProgramada: fecha, estado: "programada" }
            : s,
        ),
      }));
    } else {
      persist((d) => {
        const n = d.otCounter || 1;
        const orden = {
          id: uid("ot"),
          codigo: `OT-${String(n).padStart(4, "0")}`,
          planId: item.planId,
          tarea: item.tarea,
          procedimiento: item.procedimiento,
          categoria: item.categoria,
          frecuencia: item.frecuencia,
          duracionValor: item.duracionValor,
          duracionUnidad: item.duracionUnidad,
          sedeId: item.sedeId,
          faseId: item.faseId,
          activoId: item.activoId,
          tecnicoId,
          fechaProgramada: fecha,
          fechaCompletada: "",
          estado: "programada",
          observaciones: "",
          foto: "",
          materiales: [],
          materialesEstado: "",
          consumos: [],
          createdAt: fmtDate(new Date()),
        };
        return {
          ...d,
          ordenes: [...d.ordenes, orden],
          otCounter: n + 1,
        };
      });
    }
    setActivar(null);
  };

  return (
    <div>
      <PanelProgramacion
        data={data}
        sedes={data.sedes}
        pendientes={pendientes}
        onActivar={setActivar}
        nota="Preventivos y correctivos sin programar (se activan aquí) y servicios externos ya agendados."
      />

      {activar && (
        <Modal title="Activar actividad" onClose={() => setActivar(null)}>
          <FormActivar
            item={activar}
            data={data}
            onConfirm={confirmar}
            onClose={() => setActivar(null)}
          />
        </Modal>
      )}
    </div>
  );
}

/* ============================================================================
   14. ADMIN · Correctivos y control de costos
   ========================================================================= */

function TarjetaCosto({ item, data, rol, onUpdate, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const info = MAT_ESTADO[item.materialesEstado];
  return (
    <div className="border rounded-md" style={cardStyle}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left gap-2"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {open ? (
            <ChevronDown
              size={16}
              color={COLORS.slate}
              className="mt-0.5 shrink-0"
            />
          ) : (
            <ChevronRight
              size={16}
              color={COLORS.slate}
              className="mt-0.5 shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TipoChip tipo={item.tipo} />
              <span className="text-[10px] font-bold" style={cChar}>
                {item.codigo}
              </span>
            </div>
            <p className="font-semibold text-sm mt-1 truncate" style={cChar}>
              {item.tarea}
            </p>
            <p className="text-xs truncate" style={cSlate}>
              {ubicacionTexto(data.sedes, item)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-end gap-1">
            {info && <Chip color={info.color}>{info.label}</Chip>}
            <span className="text-xs font-bold" style={cOrange}>
              {money(costoEstimado(item))}
            </span>
          </div>
          <BotonDetalle item={item} />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t pt-3 space-y-3" style={bLine}>
          <p className="text-xs" style={cSlate}>
            Técnico: {usuarioNombre(data.usuarios, item.tecnicoId)}
            {item.solicitanteId
              ? ` · Solicitó: ${usuarioNombre(data.usuarios, item.solicitanteId)}`
              : ""}
            {item.fechaProgramada ? ` · ${item.fechaProgramada}` : ""}
          </p>
          {item.observaciones && (
            <Field label="Observaciones del técnico">
              <ReadOnly>{item.observaciones}</ReadOnly>
            </Field>
          )}
          <FotoUploader foto={item.foto} onChange={() => {}} readOnly />
          <MaterialesPanel item={item} rol={rol} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

function AdminCorrectivos({ data, persist }) {
  const acciones = useAcciones(data, persist);
  const [fSede, setFSede] = useState("todas");
  const [fEstado, setFEstado] = useState("todos");

  const correctivos = data.solicitudes
    .filter(
      (s) =>
        (fSede === "todas" || s.sedeId === fSede) &&
        (fEstado === "todos" || s.estado === fEstado),
    )
    .sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? 1 : -1));

  const enCosteo = itemsConMateriales(data, ["pendiente_costeo"]);
  const enAprobacion = itemsConMateriales(data, [
    "pendiente_aprobacion",
    "en_espera",
  ]);
  const resueltos = itemsConMateriales(data, ["aprobado", "rechazado"]);

  return (
    <div className="mt-4 space-y-5">
      <div>
        <SectionTitle count={enCosteo.length}>
          Materiales pendientes de costeo
        </SectionTitle>
        <div className="space-y-2">
          {enCosteo.map((i) => (
            <TarjetaCosto
              key={i.id}
              item={i}
              data={data}
              rol="admin"
              defaultOpen
              onUpdate={(p) => acciones.updateActividad(i, p)}
            />
          ))}
          {enCosteo.length === 0 && <Empty>Nada esperando precios.</Empty>}
        </div>
      </div>

      {enAprobacion.length > 0 && (
        <div>
          <SectionTitle count={enAprobacion.length}>
            Enviados al cliente
          </SectionTitle>
          <div className="space-y-2">
            {enAprobacion.map((i) => (
              <TarjetaCosto
                key={i.id}
                item={i}
                data={data}
                rol="admin"
                onUpdate={(p) => acciones.updateActividad(i, p)}
              />
            ))}
          </div>
        </div>
      )}

      {resueltos.length > 0 && (
        <div>
          <SectionTitle count={resueltos.length}>Resueltos</SectionTitle>
          <div className="space-y-2">
            {resueltos.map((i) => (
              <TarjetaCosto
                key={i.id}
                item={i}
                data={data}
                rol="admin"
                onUpdate={(p) => acciones.updateActividad(i, p)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle count={correctivos.length}>
          Todas las solicitudes correctivas
        </SectionTitle>
        <p className="text-xs mb-2" style={cSlate}>
          Puedes editarlas como técnico (estado, observaciones, foto,
          materiales) y aprobar sus costos.
        </p>
        <div className="flex gap-2 mb-2 flex-wrap">
          <select
            value={fSede}
            onChange={(e) => setFSede(e.target.value)}
            className="flex-1 min-w-32 border rounded-md px-2 py-2 text-sm bg-white"
            style={inputStyle}
          >
            <option value="todas">Todas las sedes</option>
            {data.sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <select
            value={fEstado}
            onChange={(e) => setFEstado(e.target.value)}
            className="flex-1 min-w-32 border rounded-md px-2 py-2 text-sm bg-white"
            style={inputStyle}
          >
            <option value="todos">Todos los estados</option>
            {Object.keys(ESTADOS).map((e) => (
              <option key={e} value={e}>
                {ESTADOS[e].label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          {correctivos.map((sol) => (
            <TarjetaActividad
              key={sol.id}
              rol="admin"
              data={data}
              acciones={acciones}
              item={{ ...sol, tipo: "correctivo", tarea: sol.descripcion }}
            />
          ))}
          {correctivos.length === 0 && (
            <Empty>No hay correctivos con este filtro.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   15. Presupuesto  (visible para admin y supervisor cliente)
   ========================================================================= */

function VistaPresupuesto({ data, mes, onMesChange }) {
  const g = presupuestoGlobalMes(data, mes);
  const [detalle, setDetalle] = useState(null);

  const historico = useMemo(() => {
    const out = [];
    const [y, m] = mes.split("-").map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const gm = presupuestoGlobalMes(data, k);
      out.push({
        mes: MESES[d.getMonth()].slice(0, 3),
        gastado: Number(gm.gastado.toFixed(2)),
        presupuesto: gm.presupuesto,
      });
    }
    return out;
  }, [data, mes]);

  const actividadesDetalle = detalle
    ? actividadesDeSedeMes(data, detalle, mes).filter(
        (a) => costoEstimado(a) > 0,
      )
    : [];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs" style={cSlate}>
          Presupuesto de{" "}
          <span className="font-semibold" style={cChar}>
            {money(PRESUPUESTO_MENSUAL_SEDE)}
          </span>{" "}
          por sede al mes.
        </p>
        <MesSelector mes={mes} onChange={onMesChange} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Presupuesto total"
          value={money(g.presupuesto)}
          icon={<Wallet size={14} />}
          color={COLORS.charcoal}
          sub={`${data.sedes.length} sedes`}
        />
        <Stat
          label="Gastado (aprobado)"
          value={money(g.gastado)}
          icon={<DollarSign size={14} />}
          color={COLORS.orange}
          sub={`${g.pct.toFixed(0)}% del total`}
        />
        <Stat
          label="Comprometido"
          value={money(g.comprometido)}
          icon={<Clock size={14} />}
          color={COLORS.ambar}
          sub="Sin aprobar aún"
        />
        <Stat
          label="Disponible"
          value={money(g.disponible)}
          icon={<TrendingUp size={14} />}
          color={g.disponible >= 0 ? COLORS.verde : COLORS.rojo}
          sub={
            g.excedidas > 0
              ? `${g.excedidas} sede(s) excedida(s)`
              : g.enRiesgo > 0
                ? `${g.enRiesgo} sede(s) en riesgo`
                : "Todo en orden"
          }
        />
      </div>

      <div className="border rounded-md p-3" style={cardStyle}>
        <p
          className="text-xs font-semibold uppercase tracking-wide mb-3"
          style={cSlate}
        >
          Control por sede · {mesLabel(mes)}
        </p>
        <div className="space-y-3">
          {g.porSede.map((p) => {
            const est = ESTADO_PRESUPUESTO[p.estado];
            return (
              <button
                key={p.sedeId}
                onClick={() =>
                  setDetalle(detalle === p.sedeId ? null : p.sedeId)
                }
                className="w-full text-left"
              >
                <PresupuestoBar p={p} />
                {detalle === p.sedeId && (
                  <div
                    className="mt-2 pl-2 border-l-2 space-y-1"
                    style={{ borderColor: est.color }}
                  >
                    {actividadesDetalle.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between text-[11px] gap-2"
                      >
                        <span className="min-w-0 truncate" style={cChar}>
                          {a.codigo} · {a.tarea || a.descripcion}
                        </span>
                        <span
                          className="shrink-0 font-semibold"
                          style={{
                            color:
                              a.materialesEstado === "aprobado"
                                ? COLORS.orange
                                : COLORS.slate,
                          }}
                        >
                          {money(costoEstimado(a))}
                          {a.materialesEstado !== "aprobado"
                            ? " (sin aprobar)"
                            : ""}
                        </span>
                      </div>
                    ))}
                    {actividadesDetalle.length === 0 && (
                      <p className="text-[11px]" style={cSlate}>
                        Sin gastos registrados este mes.
                      </p>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border rounded-md p-3" style={cardStyle}>
        <p
          className="text-xs font-semibold uppercase tracking-wide mb-2"
          style={cSlate}
        >
          Últimos 6 meses
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={historico}>
            <CartesianGrid stroke={COLORS.line} vertical={false} />
            <XAxis
              dataKey="mes"
              tick={{ fontSize: 11, fill: COLORS.slate }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: COLORS.slate }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip formatter={(v) => money(v)} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="gastado"
              name="Gastado"
              fill={COLORS.orange}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="presupuesto"
              name="Presupuesto"
              fill={`${COLORS.charcoal}30`}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================================================================
   15b. ADMIN · Servicios externos de especialidad (presupuesto manual)
   ========================================================================= */

const ESTADOS_SERVICIO = ["programada", "en_proceso", "completada"];

function FormServicio({ data, initial, onSave, onClose }) {
  const [sedeId, setSedeId] = useState(
    initial?.sedeId || data.sedes[0]?.id || "",
  );
  const [faseId, setFaseId] = useState(initial?.faseId || "");
  const [activoId, setActivoId] = useState(initial?.activoId || "");
  const [trabajo, setTrabajo] = useState(initial?.trabajo || "");
  const [proveedor, setProveedor] = useState(initial?.proveedor || "");
  const [presupuesto, setPresupuesto] = useState(initial?.presupuesto ?? "");
  const [fecha, setFecha] = useState(initial?.fecha || fmtDate(new Date()));
  const [estado, setEstado] = useState(initial?.estado || "programada");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const sede = data.sedes.find((s) => s.id === sedeId);
  const fase = sede?.fases?.find((f) => f.id === faseId);
  const faltantes = [];
  if (!sedeId) faltantes.push("sede");
  if (!faseId) faltantes.push("fase");
  if (!activoId) faltantes.push("activo");
  if (!trabajo.trim()) faltantes.push("trabajo");
  if (!(Number(presupuesto) > 0)) faltantes.push("presupuesto > 0");
  const valido = faltantes.length === 0;

  return (
    <div className="space-y-3">
      <Field label="Sede">
        <select
          value={sedeId}
          onChange={(e) => {
            setSedeId(e.target.value);
            setFaseId("");
            setActivoId("");
          }}
          className="w-full border rounded-md px-2 py-2 text-sm"
          style={inputStyle}
        >
          {data.sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Fase">
          <select
            value={faseId}
            onChange={(e) => {
              setFaseId(e.target.value);
              setActivoId("");
            }}
            className="w-full border rounded-md px-2 py-2 text-sm"
            style={inputStyle}
          >
            <option value="">Selecciona…</option>
            {(sede?.fases || []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Activo">
          <select
            value={activoId}
            onChange={(e) => setActivoId(e.target.value)}
            disabled={!faseId}
            className="w-full border rounded-md px-2 py-2 text-sm disabled:opacity-50"
            style={inputStyle}
          >
            <option value="">Selecciona…</option>
            {(fase?.activos || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Trabajo a realizar">
        <textarea
          value={trabajo}
          onChange={(e) => setTrabajo(e.target.value)}
          rows={3}
          placeholder="Ej. Mantenimiento y recarga de aire acondicionado"
          className={`${inputCls} resize-none`}
          style={inputStyle}
        />
      </Field>

      <Field label="Proveedor / especialista">
        <input
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          placeholder="Ej. Clima Andino S.A."
          className={inputCls}
          style={inputStyle}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Presupuesto (USD)" hint="Valor digitado manualmente.">
          <input
            type="number"
            min="0"
            step="0.01"
            value={presupuesto}
            onChange={(e) => setPresupuesto(e.target.value)}
            placeholder="0.00"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="Fecha">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full border rounded-md px-2 py-2 text-sm"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Estado">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="w-full border rounded-md px-2 py-2 text-sm"
          style={inputStyle}
        >
          {ESTADOS_SERVICIO.map((e) => (
            <option key={e} value={e}>
              {ESTADOS[e].label}
            </option>
          ))}
        </select>
      </Field>

      {!valido && (
        <p className="text-[11px]" style={{ color: COLORS.rojo }}>
          Completa: {faltantes.join(", ")}.
        </p>
      )}
      {saveError && (
        <p className="text-[11px]" style={{ color: COLORS.rojo }}>
          {saveError}
        </p>
      )}
      <button
        type="button"
        disabled={!valido || saving}
        onClick={async () => {
          setSaving(true);
          setSaveError("");
          try {
            const ok = await onSave({
              id: initial?.id,
              sedeId,
              faseId,
              activoId,
              trabajo: trabajo.trim(),
              proveedor: proveedor.trim(),
              presupuesto: Number(presupuesto) || 0,
              fecha,
              estado,
              observaciones: initial?.observaciones || "",
            });
            if (ok === false) {
              setSaveError(
                "No se pudo guardar en la base. Verifica que PostgREST esté en el puerto 3000.",
              );
              return;
            }
            onClose();
          } catch (e) {
            setSaveError(e?.message || "Error al guardar.");
          } finally {
            setSaving(false);
          }
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
        style={{ background: COLORS.orange }}
      >
        {saving
          ? "Guardando…"
          : initial
            ? "Guardar cambios"
            : "Crear servicio"}
      </button>
    </div>
  );
}

function AdminServicios({ data, persist }) {
  const [modal, setModal] = useState(null);
  const [fSede, setFSede] = useState("todas");

  const servicios = (data.servicios || [])
    .filter((s) => fSede === "todas" || s.sedeId === fSede)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const total = servicios.reduce((a, s) => a + (Number(s.presupuesto) || 0), 0);

  const guardar = (srv) => {
    if (srv.id) {
      return persist((data) => ({
        ...data,
        servicios: data.servicios.map((x) =>
          x.id === srv.id ? { ...x, ...srv } : x,
        ),
      }));
    }
    return persist((d) => {
      const n = d.srvCounter || 1;
      return {
        ...d,
        servicios: [
          ...(d.servicios || []),
          {
            ...srv,
            id: uid("srv"),
            codigo: `SRV-${String(n).padStart(4, "0")}`,
          },
        ],
        srvCounter: n + 1,
      };
    });
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <select
          value={fSede}
          onChange={(e) => setFSede(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm bg-white"
          style={inputStyle}
        >
          <option value="todas">Todas las sedes</option>
          {data.sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white"
          style={{ background: COLORS.orange }}
        >
          <Plus size={13} /> Nuevo servicio
        </button>
      </div>

      <p className="text-xs mb-3" style={cSlate}>
        Trabajos externos de especialidad con presupuesto propio. No consumen el
        presupuesto mensual de materiales, pero sí entran en el costo de
        mantenimiento por estudiante.
      </p>

      <div className="space-y-2">
        {servicios.map((srv) => (
          <div
            key={srv.id}
            className="border rounded-md p-3"
            style={{
              borderColor: COLORS.line,
              borderLeft: `3px solid #3B6EA5`,
              background: "white",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Chip solid color="#3B6EA5">
                    Servicio
                  </Chip>
                  <span className="text-[10px] font-bold" style={cChar}>
                    {srv.codigo}
                  </span>
                  <EstadoChip estado={srv.estado} />
                </div>
                <p className="text-sm font-semibold mt-1" style={cChar}>
                  {srv.trabajo}
                </p>
                <p className="text-xs mt-0.5" style={cSlate}>
                  {ubicacionTexto(data.sedes, srv)}
                </p>
                <p className="text-[10px] mt-1" style={cSlate}>
                  {srv.proveedor || "Sin proveedor"} · {srv.fecha}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-sm font-bold" style={cOrange}>
                  {money(srv.presupuesto)}
                </span>
                <div className="flex items-center gap-1.5">
                  <BotonDetalle
                    item={{
                      ...srv,
                      tipo: "servicio",
                      tarea: srv.trabajo,
                      fechaProgramada: srv.fecha,
                    }}
                    size={13}
                  />
                  <button onClick={() => setModal({ srv })}>
                    <Pencil size={13} color={COLORS.slate} />
                  </button>
                  <DeleteBtn
                    onConfirm={() =>
                      persist((data) => ({
                        ...data,
                        servicios: data.servicios.filter(
                          (x) => x.id !== srv.id,
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
        {servicios.length === 0 && (
          <Empty>Aún no hay servicios registrados.</Empty>
        )}

        {servicios.length > 0 && (
          <div
            className="border-t pt-3 flex items-center justify-between"
            style={bLine}
          >
            <p className="text-sm font-bold" style={cChar}>
              Total presupuestado
            </p>
            <p className="text-lg font-bold" style={cOrange}>
              {money(total)}
            </p>
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.srv ? "Editar servicio" : "Nuevo servicio externo"}
          onClose={() => setModal(null)}
          wide
        >
          <FormServicio
            data={data}
            initial={modal.srv}
            onSave={guardar}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

/* ============================================================================
   15c. ADMIN · Configuración por sede (estudiantes, presupuesto, constructor)
   ========================================================================= */

function AdminConfiguracion({ data, persist, setPlanModal }) {
  const [sub, setSub] = useState("usuarios");
  const subs = [
    { id: "usuarios", label: "Usuarios", icon: <Users size={14} /> },
    {
      id: "planes",
      label: "Planes de mantenimiento",
      icon: <ClipboardList size={14} />,
    },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-1 mb-1 overflow-x-auto pb-1">
        {subs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap shrink-0"
            style={{
              background: sub === t.id ? `${COLORS.orange}15` : "white",
              color: sub === t.id ? COLORS.orange : COLORS.slate,
              border: `1px solid ${sub === t.id ? COLORS.orange : COLORS.line}`,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {sub === "usuarios" && <AdminUsuarios data={data} persist={persist} />}

      {sub === "planes" && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <p className="text-xs" style={cSlate}>
              Catálogo de tareas preventivas y dónde aplican.
            </p>
            <button
              onClick={() => setPlanModal({})}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white"
              style={{ background: COLORS.orange }}
            >
              <Plus size={13} /> Nuevo plan
            </button>
          </div>
          <div className="space-y-2">
            {data.planes.map((p) => (
              <TarjetaPlan
                key={p.id}
                plan={p}
                sedes={data.sedes}
                onEdit={() => setPlanModal({ plan: p })}
                onDelete={() =>
                  persist((data) => ({
                    ...data,
                    planes: data.planes.filter((x) => x.id !== p.id),
                  }))
                }
              />
            ))}
            {data.planes.length === 0 && (
              <Empty>
                Aún no hay planes. Crea el primero con "Nuevo plan".
              </Empty>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   15d. ADMIN · Stock por sede  (bodega de insumos de uso frecuente)
   ========================================================================= */

/* Bodega por sede, en formato de tabla.
   Admin edita; el técnico solo consulta y no ve costos. */
function VistaBodega({ data, persist, sedes, editable }) {
  const [sedeId, setSedeId] = useState(sedes[0]?.id || "");
  const [nuevo, setNuevo] = useState(null);

  useEffect(() => {
    if (!sedes.some((s) => s.id === sedeId)) setSedeId(sedes[0]?.id || "");
  }, [sedes.map((s) => s.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = (data.stock || []).filter((x) => x.sedeId === sedeId);
  const valorTotal = items.reduce(
    (a, x) => a + x.cantidad * x.costoUnitario,
    0,
  );
  const bajos = items.filter((x) => x.cantidad <= x.minimo);
  const agotados = items.filter((x) => x.cantidad <= 0);

  const setItem = (id, patch) =>
    persist((data) => ({
      ...data,
      stock: data.stock.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));

  const th =
    "text-left text-[10px] font-semibold uppercase tracking-wide px-2.5 py-2 whitespace-nowrap";
  const td = "px-2.5 py-2 text-xs align-middle";
  const cellInput =
    "w-full border rounded px-1.5 py-1 text-xs outline-none bg-white";

  return (
    <div className="mt-4">
      <p className="text-xs mb-3" style={cSlate}>
        {editable
          ? "Insumos ya comprados. El técnico los consume directo en preventivos: el consumo descuenta existencias y carga su valor al presupuesto de la sede, sin aprobación."
          : "Existencias disponibles en tus sedes. Se descuentan solas cuando cargas un consumo en una actividad preventiva."}
      </p>

      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <select
          value={sedeId}
          onChange={(e) => setSedeId(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm bg-white"
          style={inputStyle}
        >
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        {editable && (
          <button
            onClick={() =>
              setNuevo({
                nombre: "",
                unidad: "u",
                cantidad: 0,
                costoUnitario: 0,
                minimo: 0,
              })
            }
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white"
            style={{ background: COLORS.orange }}
          >
            <Plus size={13} /> Agregar artículo
          </button>
        )}
      </div>

      <div
        className={`grid ${editable ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2"} gap-3 mb-3`}
      >
        <Stat
          label="Artículos"
          value={items.length}
          icon={<ClipboardList size={14} />}
          color={COLORS.charcoal}
          sub={
            agotados.length
              ? `${agotados.length} agotado(s)`
              : "Todos con existencias"
          }
        />
        <Stat
          label="Bajo mínimo"
          value={bajos.length}
          icon={<AlertTriangle size={14} />}
          color={bajos.length ? COLORS.rojo : COLORS.verde}
          sub={
            bajos.length
              ? bajos
                  .map((b) => b.nombre)
                  .slice(0, 2)
                  .join(", ")
              : "Todo abastecido"
          }
        />
        {editable && (
          <Stat
            label="Valor en bodega"
            value={money(valorTotal)}
            icon={<Wallet size={14} />}
            color={COLORS.orange}
            sub="Existencias × costo"
          />
        )}
      </div>

      <div className="border rounded-md overflow-x-auto" style={cardStyle}>
        <table
          className="w-full border-collapse"
          style={{ minWidth: editable ? 640 : 420 }}
        >
          <thead>
            <tr style={{ background: COLORS.charcoal }}>
              <th className={th} style={{ color: "white" }}>
                Artículo
              </th>
              <th className={th} style={{ color: "white" }}>
                Existencias
              </th>
              <th className={th} style={{ color: "white" }}>
                Unidad
              </th>
              <th className={th} style={{ color: "white" }}>
                Mínimo
              </th>
              {editable && (
                <th className={th} style={{ color: "white" }}>
                  Costo unit.
                </th>
              )}
              {editable && (
                <th className={th} style={{ color: "white" }}>
                  Valor
                </th>
              )}
              <th className={th} style={{ color: "white" }}>
                Estado
              </th>
              {editable && <th className={th} style={{ color: "white" }}></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => {
              const agotado = x.cantidad <= 0;
              const bajo = !agotado && x.cantidad <= x.minimo;
              const color = agotado
                ? COLORS.rojo
                : bajo
                  ? COLORS.ambar
                  : COLORS.verde;
              return (
                <tr
                  key={x.id}
                  style={{
                    background: i % 2 ? COLORS.paper : "white",
                    borderTop: `1px solid ${COLORS.line}`,
                  }}
                >
                  <td className={td} style={{ ...cChar, fontWeight: 600 }}>
                    {editable ? (
                      <input
                        value={x.nombre}
                        onChange={(e) =>
                          setItem(x.id, { nombre: e.target.value })
                        }
                        className={cellInput}
                        style={bLine}
                      />
                    ) : (
                      x.nombre
                    )}
                  </td>
                  <td className={td}>
                    {editable ? (
                      <input
                        type="number"
                        min="0"
                        value={x.cantidad}
                        onChange={(e) =>
                          setItem(x.id, {
                            cantidad: Number(e.target.value) || 0,
                          })
                        }
                        className={cellInput}
                        style={{ borderColor: COLORS.line, width: 68 }}
                      />
                    ) : (
                      <span style={{ color, fontWeight: 700 }}>
                        {x.cantidad}
                      </span>
                    )}
                  </td>
                  <td className={td} style={cSlate}>
                    {editable ? (
                      <input
                        value={x.unidad}
                        onChange={(e) =>
                          setItem(x.id, { unidad: e.target.value })
                        }
                        className={cellInput}
                        style={{ borderColor: COLORS.line, width: 74 }}
                      />
                    ) : (
                      x.unidad
                    )}
                  </td>
                  <td className={td} style={cSlate}>
                    {editable ? (
                      <input
                        type="number"
                        min="0"
                        value={x.minimo}
                        onChange={(e) =>
                          setItem(x.id, { minimo: Number(e.target.value) || 0 })
                        }
                        className={cellInput}
                        style={{ borderColor: COLORS.line, width: 62 }}
                      />
                    ) : (
                      x.minimo
                    )}
                  </td>
                  {editable && (
                    <td className={td}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={x.costoUnitario}
                        onChange={(e) =>
                          setItem(x.id, {
                            costoUnitario: Number(e.target.value) || 0,
                          })
                        }
                        className={cellInput}
                        style={{ borderColor: COLORS.line, width: 78 }}
                      />
                    </td>
                  )}
                  {editable && (
                    <td className={td} style={{ ...cOrange, fontWeight: 700 }}>
                      {money(x.cantidad * x.costoUnitario)}
                    </td>
                  )}
                  <td className={td}>
                    <Chip color={color}>
                      {agotado
                        ? "Agotado"
                        : bajo
                          ? "Bajo mínimo"
                          : "Disponible"}
                    </Chip>
                  </td>
                  {editable && (
                    <td className={td}>
                      <DeleteBtn
                        onConfirm={() =>
                          persist((data) => ({
                            ...data,
                            stock: data.stock.filter((y) => y.id !== x.id),
                          }))
                        }
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={editable ? 8 : 5}
                  className="px-3 py-5 text-sm text-center"
                  style={cSlate}
                >
                  Esta sede aún no tiene artículos en bodega.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {nuevo && (
        <Modal title="Nuevo artículo de bodega" onClose={() => setNuevo(null)}>
          <div className="space-y-3">
            <Field label="Nombre del artículo">
              <input
                autoFocus
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                placeholder="Ej. Foco LED 18W"
                className={inputCls}
                style={inputStyle}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cantidad inicial">
                <input
                  type="number"
                  min="0"
                  value={nuevo.cantidad}
                  onChange={(e) =>
                    setNuevo({
                      ...nuevo,
                      cantidad: Number(e.target.value) || 0,
                    })
                  }
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
              <Field label="Unidad">
                <input
                  value={nuevo.unidad}
                  onChange={(e) =>
                    setNuevo({ ...nuevo, unidad: e.target.value })
                  }
                  placeholder="u, galón, rollo…"
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Costo unitario (USD)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevo.costoUnitario}
                  onChange={(e) =>
                    setNuevo({
                      ...nuevo,
                      costoUnitario: Number(e.target.value) || 0,
                    })
                  }
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
              <Field label="Mínimo de alerta">
                <input
                  type="number"
                  min="0"
                  value={nuevo.minimo}
                  onChange={(e) =>
                    setNuevo({ ...nuevo, minimo: Number(e.target.value) || 0 })
                  }
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
            </div>
            <button
              disabled={!nuevo.nombre.trim()}
              onClick={() => {
                persist((data) => ({
                  ...data,
                  stock: [
                    ...(data.stock || []),
                    {
                      ...nuevo,
                      id: uid("stk"),
                      sedeId,
                      nombre: nuevo.nombre.trim(),
                    },
                  ],
                }));
                setNuevo(null);
              }}
              className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
              style={{ background: COLORS.orange }}
            >
              Agregar a bodega
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================================
   15e. HISTÓRICO · Todo lo ejecutado, buscable por código
   ========================================================================= */

/* El histórico no es una tabla nueva: son las mismas órdenes, solicitudes y
   servicios ya cerrados. Esta vista los unifica y los hace buscables. */
function historicoDe(data, sedeIds) {
  const dentro = (x) => !sedeIds || sedeIds.includes(x.sedeId);
  const pre = (data.ordenes || [])
    .filter((o) => o.estado === "completada" && dentro(o))
    .map((o) => ({ ...o, tipo: "preventivo" }));
  const cor = (data.solicitudes || [])
    .filter((s) => s.estado === "completada" && dentro(s))
    .map((s) => ({ ...s, tipo: "correctivo", tarea: s.descripcion }));
  const srv = (data.servicios || [])
    .filter((s) => s.estado === "completada" && dentro(s))
    .map((s) => ({
      ...s,
      tipo: "servicio",
      tarea: s.trabajo,
      fechaCompletada: s.fecha,
    }));
  return [...pre, ...cor, ...srv].sort((a, b) =>
    (b.fechaCompletada || "").localeCompare(a.fechaCompletada || ""),
  );
}

/* Exporta el histórico a CSV. Formato simple de tabla, una fila por tarea. */
function exportarCSV(filas, data) {
  const cols = [
    "Tipo",
    "Codigo",
    "Tarea",
    "Sede",
    "Ubicacion",
    "Categoria",
    "Fecha solicitud",
    "Fecha cierre",
    "Hora cierre",
    "Tiempo respuesta (dias)",
    "Responsable",
    "Solicitante",
    "Costo USD",
    "Calificacion",
    "Observaciones",
    "Resolucion",
  ];
  const esc = (v) => {
    const t = String(v ?? "")
      .replace(/"/g, '""')
      .replace(/\r?\n/g, " ");
    return /[",;]/.test(t) ? `"${t}"` : t;
  };

  const filasCsv = filas.map((h) => {
    const esServ = h.tipo === "servicio";
    const costo = esServ
      ? Number(h.presupuesto) || 0
      : costoAprobado(h) + costoConsumos(h);
    const resp =
      h.tipo === "correctivo" && h.fecha && h.fechaCompletada
        ? (
            horasEntre(h.fecha, h.hora, h.fechaCompletada, h.horaCompletada) /
            24
          ).toFixed(2)
        : "";
    return [
      tipoMeta(h.tipo).label,
      h.codigo,
      h.tarea,
      sedeNombre(data.sedes, h.sedeId),
      ubicacionTexto(data.sedes, h),
      h.categoria || "",
      h.fecha || "",
      h.fechaCompletada || "",
      h.horaCompletada || "",
      resp,
      esServ ? h.proveedor || "" : usuarioNombre(data.usuarios, h.tecnicoId),
      h.solicitanteId ? usuarioNombre(data.usuarios, h.solicitanteId) : "",
      costo.toFixed(2),
      h.calificacion || "",
      h.observaciones || "",
      h.resolucion || "",
    ]
      .map(esc)
      .join(",");
  });

  // BOM para que Excel respete tildes
  const csv = "\uFEFF" + [cols.join(","), ...filasCsv].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `historico-mantenimiento-${fmtDate(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Grupo desplegable de un tipo dentro del histórico. */
function GrupoHistorico({ tipo, items, data, abiertoInicial }) {
  const [open, setOpen] = useState(abiertoInicial);
  const meta = tipoMeta(tipo);
  const costo = items.reduce(
    (a, h) =>
      a +
      (h.tipo === "servicio"
        ? Number(h.presupuesto) || 0
        : costoAprobado(h) + costoConsumos(h)),
    0,
  );

  return (
    <div
      className="border rounded-md overflow-hidden"
      style={{
        borderColor: COLORS.line,
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5"
        style={{ background: open ? COLORS.paper : "white" }}
      >
        {open ? (
          <ChevronDown size={14} color={COLORS.slate} />
        ) : (
          <ChevronRight size={14} color={COLORS.slate} />
        )}
        <span
          className="text-xs font-bold uppercase tracking-wide flex-1 text-left"
          style={{ color: meta.color }}
        >
          {TIPO_PLURAL[tipo]}
        </span>
        {costo > 0 && <Chip color={COLORS.orange}>{money(costo)}</Chip>}
        <Chip color={meta.color}>{items.length}</Chip>
      </button>
      {open && (
        <div
          className="p-2 space-y-2"
          style={{ borderTop: `1px solid ${COLORS.line}` }}
        >
          {items.map((h) => (
            <RegistroHistorico key={h.id} h={h} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}

function VistaHistorico({ data, sedes, rol }) {
  const [q, setQ] = useState("");
  const [fSede, setFSede] = useState("todas");
  const [orden, setOrden] = useState("reciente");
  const sedeIds = sedes.map((s) => s.id);

  const todo = useMemo(
    () => historicoDe(data, sedeIds),
    [data, sedeIds.join(",")],
  );

  const filtrado = todo.filter((h) => {
    if (fSede !== "todas" && h.sedeId !== fSede) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return (
      (h.codigo || "").toLowerCase().includes(t) ||
      (h.tarea || "").toLowerCase().includes(t) ||
      (h.proveedor || "").toLowerCase().includes(t) ||
      usuarioNombre(data.usuarios, h.tecnicoId).toLowerCase().includes(t) ||
      ubicacionTexto(data.sedes, h).toLowerCase().includes(t)
    );
  });

  const ordenar = (arr) =>
    [...arr].sort((a, b) => {
      const fa = a.fechaCompletada || "",
        fb = b.fechaCompletada || "";
      return orden === "reciente" ? fb.localeCompare(fa) : fa.localeCompare(fb);
    });

  const costoTotal = filtrado.reduce(
    (a, h) =>
      a +
      (h.tipo === "servicio"
        ? Number(h.presupuesto) || 0
        : costoAprobado(h) + costoConsumos(h)),
    0,
  );

  const grupos = ["preventivo", "correctivo", "servicio"]
    .map((t) => ({
      tipo: t,
      items: ordenar(filtrado.filter((h) => h.tipo === t)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-4">
      <p className="text-xs mb-3" style={cSlate}>
        Todo lo ejecutado y cerrado, agrupado por tipo. Busca por código (OT,
        SOL, SRV), tarea, activo, técnico o proveedor.
      </p>

      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar: OT-0001, SOL-0003, luminarias, Cristian…"
          className="flex-1 min-w-48 border rounded-md px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
        {sedes.length > 1 && (
          <select
            value={fSede}
            onChange={(e) => setFSede(e.target.value)}
            className="border rounded-md px-2 py-2 text-sm bg-white"
            style={inputStyle}
          >
            <option value="todas">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm bg-white"
          style={inputStyle}
        >
          <option value="reciente">Más reciente primero</option>
          <option value="antiguo">Más antiguo primero</option>
        </select>
        <button
          onClick={() => exportarCSV(ordenar(filtrado), data)}
          disabled={filtrado.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white disabled:opacity-40"
          style={{ background: COLORS.charcoal }}
        >
          <Download size={13} /> Descargar CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Stat
          label="Tareas cerradas"
          value={filtrado.length}
          icon={<CheckCircle2 size={14} />}
          color={COLORS.verde}
          sub={
            q.trim() || fSede !== "todas"
              ? `de ${todo.length} en total`
              : "Histórico completo"
          }
        />
        <Stat
          label="Costo acumulado"
          value={money(costoTotal)}
          icon={<DollarSign size={14} />}
          color={COLORS.orange}
          sub="Materiales, bodega y servicios"
        />
      </div>

      <div className="space-y-2">
        {grupos.map((g, i) => (
          <GrupoHistorico
            key={g.tipo}
            tipo={g.tipo}
            items={g.items}
            data={data}
            abiertoInicial={grupos.length === 1 || i === 0}
          />
        ))}
        {grupos.length === 0 && (
          <Empty>
            {q.trim()
              ? `Sin resultados para “${q}”.`
              : "Todavía no hay tareas cerradas."}
          </Empty>
        )}
      </div>
    </div>
  );
}

function RegistroHistorico({ h, data }) {
  const [open, setOpen] = useState(false);
  const esServ = h.tipo === "servicio";
  const costo = esServ
    ? Number(h.presupuesto) || 0
    : costoAprobado(h) + costoConsumos(h);
  const respuesta =
    h.tipo === "correctivo" && h.fecha && h.fechaCompletada
      ? duracionTexto(
          horasEntre(h.fecha, h.hora, h.fechaCompletada, h.horaCompletada) / 24,
        )
      : null;

  return (
    <div
      className="border rounded-md"
      style={{
        ...cardStyle,
        borderLeft: `3px solid ${tipoMeta(h.tipo).color}`,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left gap-2"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {open ? (
            <ChevronDown
              size={16}
              color={COLORS.slate}
              className="mt-0.5 shrink-0"
            />
          ) : (
            <ChevronRight
              size={16}
              color={COLORS.slate}
              className="mt-0.5 shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TipoChip tipo={h.tipo} />
              <span className="text-[10px] font-bold" style={cChar}>
                {h.codigo}
              </span>
              {h.calificacion > 0 && (
                <Estrellas valor={h.calificacion} size={11} readOnly />
              )}
            </div>
            <p className="font-semibold text-sm mt-1 truncate" style={cChar}>
              {h.tarea}
            </p>
            <p className="text-xs truncate" style={cSlate}>
              {ubicacionTexto(data.sedes, h)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <span
              className="text-[11px] font-semibold"
              style={{ color: COLORS.verde }}
            >
              {h.fechaCompletada || "—"}
            </span>
            {costo > 0 && (
              <span className="text-xs font-bold" style={cOrange}>
                {money(costo)}
              </span>
            )}
          </div>
          <BotonDetalle item={h} />
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t pt-3 space-y-2.5" style={bLine}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="font-semibold" style={cSlate}>
                {esServ ? "Proveedor" : "Ejecutó"}
              </p>
              <p style={cChar}>
                {esServ
                  ? h.proveedor || "—"
                  : usuarioNombre(data.usuarios, h.tecnicoId)}
              </p>
            </div>
            <div>
              <p className="font-semibold" style={cSlate}>
                Cierre
              </p>
              <p style={cChar}>
                {h.fechaCompletada || "—"}
                {h.horaCompletada ? ` · ${h.horaCompletada}` : ""}
              </p>
            </div>
            {h.tipo === "correctivo" && (
              <>
                <div>
                  <p className="font-semibold" style={cSlate}>
                    Solicitó
                  </p>
                  <p style={cChar}>
                    {usuarioNombre(data.usuarios, h.solicitanteId)} · {h.fecha}
                  </p>
                </div>
                <div>
                  <p className="font-semibold" style={cSlate}>
                    Tiempo de respuesta
                  </p>
                  <p style={{ color: COLORS.verde, fontWeight: 600 }}>
                    {respuesta || "—"}
                  </p>
                </div>
              </>
            )}
          </div>

          {h.observaciones && (
            <Field label="Observaciones">
              <ReadOnly>{h.observaciones}</ReadOnly>
            </Field>
          )}
          {h.resolucion && (
            <Field label="Resolución">
              <ReadOnly>{h.resolucion}</ReadOnly>
            </Field>
          )}
          {h.comentarioCalif && (
            <Field label="Comentario del solicitante">
              <ReadOnly>“{h.comentarioCalif}”</ReadOnly>
            </Field>
          )}

          {(h.consumos || []).length > 0 && (
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={cSlate}
              >
                Consumo de bodega
              </p>
              {h.consumos.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span style={cChar}>
                    {c.nombre} · {c.cantidad} {c.unidad}
                  </span>
                  <span className="font-semibold" style={cOrange}>
                    {money(c.cantidad * c.costoUnitario)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(h.materiales || []).length > 0 && (
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={cSlate}
              >
                Materiales{" "}
                {h.materialesEstado === "aprobado"
                  ? "(aprobados)"
                  : `(${MAT_ESTADO[h.materialesEstado]?.label || "sin aprobar"})`}
              </p>
              {h.materiales.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span style={cChar}>
                    {m.nombre} · {m.cantidad} {m.unidad}
                  </span>
                  <span className="font-semibold" style={cOrange}>
                    {money(m.cantidad * m.costoUnitario)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {h.foto && (
            <img
              src={h.foto}
              alt="Evidencia"
              className="rounded-md max-h-40 border"
              style={bLine}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   RESUMEN DE GESTIÓN  ·  narrativa automática basada en los indicadores reales

   No hay redacción libre: cada oración se arma a partir de datos calculados
   (KPIs, cumplimiento, presupuesto, recurrencias). Mismo generador para la
   tarjeta del Dashboard y para el reporte impreso, así siempre coinciden.
   ========================================================================= */

/* Activos con 2 o más correctivos en la ventana de meses reciente: la señal
   de que algo se sigue dañando en vez de resolverse de fondo. */
function recurrenciasCorrectivos(data, sedeIds, mesFinal, ventanaMeses = 3) {
  const [y, m] = mesFinal.split("-").map(Number);
  const claves = new Set();
  for (let i = 0; i < ventanaMeses; i++) {
    const d = new Date(y, m - 1 - i, 1);
    claves.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const activos = flattenActivos(data.sedes);
  const enVentana = (data.solicitudes || []).filter(
    (s) => sedeIds.includes(s.sedeId) && claves.has(mesKey(s.fecha)),
  );

  const porActivo = {};
  enVentana.forEach((s) => {
    const k = `${s.sedeId}|${s.activoId}`;
    (porActivo[k] = porActivo[k] || {
      sedeId: s.sedeId,
      activoId: s.activoId,
      count: 0,
    }).count++;
  });

  return Object.values(porActivo)
    .filter((x) => x.count >= 2)
    .map((x) => ({
      ...x,
      nombre:
        activos.find((a) => a.activoId === x.activoId)?.activoNombre ||
        "un activo",
      sede: sedeNombre(data.sedes, x.sedeId),
    }))
    .sort((a, b) => b.count - a.count);
}

/* Resumen ejecutivo único del mes: un párrafo general (con los indicadores
   clave y el remanente de presupuesto en negrita) más una viñeta corta por
   sede, enfocada solo en recurrencias, servicios que subieron el costo y el
   costo por estudiante. Devuelve datos estructurados, no HTML ni JSX, para
   que la tarjeta (React) y el reporte (HTML impreso) lo rendericen cada uno
   a su manera con el mismo contenido. Tope ~200 palabras.
   ========================================================================= */
function generarResumenUnificado(data, sedes, mes) {
  const sedeIds = sedes.map((s) => s.id);
  const kpi = indicadoresMes(data, sedeIds, mes);
  const sat = satisfaccion(data, sedeIds);
  const avance = avancePlan(data, sedeIds);
  const presu =
    sedeIds.length > 1
      ? presupuestoGlobalMes(data, mes)
      : { ...presupuestoSedeMes(data, sedeIds[0], mes) };
  const ambito =
    sedes.length > 1 ? "el conjunto de sedes" : sedes[0]?.nombre || "la sede";

  // --- Párrafo general: texto plano + tramos en negrita (indicadores y remanente) ---
  const p = [];
  const txt = (t) => p.push({ t, b: false });
  const neg = (t) => p.push({ t, b: true });

  txt(`En ${mesLabel(mes)}, ${ambito} registró `);
  neg(
    `${kpi.nFallas} correctivo${kpi.nFallas === 1 ? "" : "s"} (${kpi.cerrados} cerrado${kpi.cerrados === 1 ? "" : "s"})`,
  );
  txt(avance.total > 0 ? " y un cumplimiento del plan preventivo de " : ". ");
  if (avance.total > 0) {
    neg(`${avance.cumplimiento.toFixed(0)}%`);
    txt(". ");
  }
  if (kpi.mtbf !== null) {
    txt("El tiempo medio entre fallas fue de ");
    neg(`${kpi.mtbf.toFixed(1)} días`);
    txt(kpi.mttr !== null ? " y el de respuesta de " : ". ");
  }
  if (kpi.mtbf !== null && kpi.mttr !== null) {
    neg(duracionTexto(kpi.mttr));
    txt(". ");
  }
  txt("El presupuesto de materiales cerró con ");
  neg(`${money(Math.max(0, presu.disponible))} disponibles`);
  txt(` de ${money(presu.presupuesto)}. `);
  if (sat.promedio !== null) {
    txt("La satisfacción promedio fue de ");
    neg(`${sat.promedio.toFixed(1)}/5`);
    txt(".");
  }

  // --- Viñetas por sede: solo recurrencias, servicios que subieron el costo, costo/estudiante ---
  const vinetas = sedes.map((s) => {
    const recurr = recurrenciasCorrectivos(data, [s.id], mes);
    const serviciosMes = (data.servicios || []).filter(
      (x) =>
        x.sedeId === s.id &&
        mesKey(x.fecha) === mes &&
        Number(x.presupuesto) > 0,
    );
    const kSede = indicadoresMes(data, [s.id], mes);

    const partes = [];
    partes.push(
      recurr.length > 0
        ? `falla recurrente en ${recurr[0].nombre} (${recurr[0].count}×)`
        : "sin fallas recurrentes",
    );
    partes.push(
      serviciosMes.length > 0
        ? `${serviciosMes.length > 1 ? `${serviciosMes.length} servicios externos, el mayor` : "servicio externo"} ${serviciosMes[0].trabajo.length > 28 ? serviciosMes[0].trabajo.slice(0, 26) + "…" : serviciosMes[0].trabajo} (${money(serviciosMes[0].presupuesto)}) subió el costo`
        : "sin servicios externos este mes",
    );
    partes.push(
      kSede.costoPorEstudiante !== null
        ? `${money(kSede.costoPorEstudiante)}/estudiante`
        : "sin estudiantes registrados",
    );

    return { sedeId: s.id, nombre: s.nombre, texto: partes.join(" · ") };
  });

  return { parrafo: p, vinetas };
}

/* ============================================================================
   GRÁFICOS EN SVG PARA IMPRESIÓN
   El documento imprimible es HTML autónomo, así que las gráficas se dibujan
   a mano en SVG en lugar de usar la librería de la pantalla.
   ========================================================================= */

const _esc = (v) =>
  String(v ?? "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );

/* Barras verticales agrupadas. series: [{nombre,color,valores[]}] */
function svgBarras(labels, series, { w = 500, h = 150, fmt = (v) => v } = {}) {
  const pad = { t: 12, r: 8, b: 26, l: 34 };
  const iw = w - pad.l - pad.r,
    ih = h - pad.t - pad.b;
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const paso = iw / Math.max(1, labels.length);
  const bw = Math.min(26, (paso * 0.62) / series.length);

  const ejes = [0, 0.5, 1]
    .map((f) => {
      const y = pad.t + ih - f * ih;
      return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#E3E0D8"/>
            <text x="${pad.l - 5}" y="${y + 3}" text-anchor="end" font-size="7" fill="#8D939B">${fmt(Math.round(max * f))}</text>`;
    })
    .join("");

  const barras = labels
    .map((l, i) => {
      const cx = pad.l + paso * i + paso / 2;
      const grupo = series
        .map((s, j) => {
          const v = s.valores[i] || 0;
          const bh = (v / max) * ih;
          const x = cx - (bw * series.length) / 2 + bw * j;
          return (
            `<rect x="${x}" y="${pad.t + ih - bh}" width="${bw - 1.5}" height="${Math.max(0, bh)}" fill="${s.color}" rx="1"/>` +
            (v > 0
              ? `<text x="${x + bw / 2 - 0.75}" y="${pad.t + ih - bh - 2.5}" text-anchor="middle" font-size="6.5" fill="#35383C">${fmt(v)}</text>`
              : "")
          );
        })
        .join("");
      return (
        grupo +
        `<text x="${cx}" y="${h - 8}" text-anchor="middle" font-size="7" fill="#787D85">${_esc(l)}</text>`
      );
    })
    .join("");

  const leyenda =
    series.length > 1
      ? `<g>${series
          .map(
            (s, i) =>
              `<rect x="${pad.l + i * 78}" y="2" width="7" height="7" fill="${s.color}" rx="1"/>
         <text x="${pad.l + i * 78 + 10}" y="8.5" font-size="7" fill="#787D85">${_esc(s.nombre)}</text>`,
          )
          .join("")}</g>`
      : "";

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${ejes}${barras}${leyenda}</svg>`;
}

/* Medidor semicircular para MTBF / MTTR */
function svgMedidor(valor, max, color, unidad = "d") {
  const w = 150,
    h = 88,
    cx = w / 2,
    cy = 74,
    r = 52,
    gr = 13;
  const frac = valor === null ? 0 : Math.max(0, Math.min(valor / max, 1));
  const arco = (desde, hasta, col) => {
    const a1 = Math.PI - desde * Math.PI,
      a2 = Math.PI - hasta * Math.PI;
    const p = (a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    const [x1, y1] = p(a1),
      [x2, y2] = p(a2);
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}" stroke="${col}" stroke-width="${gr}" fill="none" stroke-linecap="butt"/>`;
  };
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">
    ${arco(0, 1, "#E3E0D8")}
    ${frac > 0 ? arco(0, frac, color) : ""}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="21" font-weight="bold" fill="${valor === null ? "#8D939B" : color}">
      ${valor === null ? "—" : valor.toFixed(1)}</text>
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="7.5" fill="#8D939B">${valor === null ? "sin datos" : _esc(unidad)}</text>
    <text x="${cx - r}" y="${cy + 12}" text-anchor="middle" font-size="6.5" fill="#8D939B">0</text>
    <text x="${cx + r}" y="${cy + 12}" text-anchor="middle" font-size="6.5" fill="#8D939B">${max}</text>
  </svg>`;
}

/* Línea de evolución (costo por estudiante) */
function svgLinea(
  puntos,
  { w = 500, h = 150, color = "#ED5B23", fmt = (v) => v } = {},
) {
  const pad = { t: 14, r: 12, b: 24, l: 40 };
  const iw = w - pad.l - pad.r,
    ih = h - pad.t - pad.b;
  const vals = puntos.map((p) => p.v);
  const max = Math.max(0.001, ...vals) * 1.15;
  const paso = puntos.length > 1 ? iw / (puntos.length - 1) : 0;
  const xy = (p, i) => [pad.l + paso * i, pad.t + ih - (p.v / max) * ih];

  const grid = [0, 0.5, 1]
    .map((f) => {
      const y = pad.t + ih - f * ih;
      return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#E3E0D8"/>
            <text x="${pad.l - 5}" y="${y + 3}" text-anchor="end" font-size="7" fill="#8D939B">${fmt(max * f)}</text>`;
    })
    .join("");

  const d = puntos
    .map((p, i) => {
      const [x, y] = xy(p, i);
      return `${i ? "L" : "M"} ${x} ${y}`;
    })
    .join(" ");
  const pts = puntos
    .map((p, i) => {
      const [x, y] = xy(p, i);
      return `<circle cx="${x}" cy="${y}" r="2.6" fill="${color}"/>
            <text x="${x}" y="${y - 6}" text-anchor="middle" font-size="6.5" fill="#35383C">${fmt(p.v)}</text>
            <text x="${x}" y="${h - 7}" text-anchor="middle" font-size="7" fill="#787D85">${_esc(p.label)}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}
    <path d="${d}" stroke="${color}" stroke-width="2" fill="none"/>${pts}</svg>`;
}

/* Barra apilada horizontal (cumplimiento del plan, presupuesto) */
function barraApilada(segmentos, { alto = 11 } = {}) {
  const total = segmentos.reduce((a, s) => a + s.v, 0) || 1;
  return (
    `<div class="stack" style="height:${alto}px">` +
    segmentos
      .filter((s) => s.v > 0)
      .map(
        (s) =>
          `<span style="width:${(s.v / total) * 100}%;background:${s.c}" title="${_esc(s.n)}"></span>`,
      )
      .join("") +
    `</div>`
  );
}

/* ============================================================================
   REPORTE DE GESTIÓN MENSUAL
   Sección 1: consolidado de todas las sedes.
   Sección 2: una página por sede, corta pero con sus gráficas e indicadores.
   ========================================================================= */

/* Bloque del resumen unificado para el reporte impreso: si ya hay uno
   generado desde el Dashboard para este mes, se reutiliza tal cual (mismo
   texto en pantalla e impreso); si no, se genera al momento de imprimir. */
function bloqueResumenUnificado(data, sedes, mes) {
  const r =
    data.resumenesMes?.[mes] || generarResumenUnificado(data, sedes, mes);
  const parrafoHTML = r.parrafo
    .map((seg) => (seg.b ? `<b>${_esc(seg.t)}</b>` : _esc(seg.t)))
    .join("");
  const vinetasHTML = r.vinetas
    .map((v) => `<li><b>${_esc(v.nombre)}:</b> ${_esc(v.texto)}</li>`)
    .join("");
  return `<div class="resumen-txt">
    <h4>Resumen del mes${data.resumenesMes?.[mes] ? "" : " (generado al imprimir)"}</h4>
    <p>${parrafoHTML}</p>
    <ul>${vinetasHTML}</ul>
  </div>`;
}

function bloqueIndicadores(kpi, sat, { compacto } = {}) {
  const cel = (t, v, s, c) =>
    `<div class="kpi"><span class="k-lbl">${_esc(t)}</span><b style="color:${c}">${_esc(v)}</b>${s ? `<span class="k-sub">${_esc(s)}</span>` : ""}</div>`;
  return `<div class="kpis${compacto ? " mini" : ""}">
    ${cel(
      "MTBF",
      kpi.mtbf !== null ? `${kpi.mtbf.toFixed(1)} d` : "—",
      kpi.nFallas > 0
        ? `${kpi.diasTranscurridos} d ÷ ${kpi.nFallas} correctivos`
        : "sin correctivos",
      colorMTBF(kpi.mtbf),
    )}
    ${cel(
      "MTTR",
      kpi.mttr !== null ? duracionTexto(kpi.mttr) : "—",
      kpi.cerrados > 0
        ? `promedio de ${kpi.cerrados} cierre(s)`
        : "sin cierres",
      colorMTTR(kpi.mttr),
    )}
    ${cel(
      "Satisfacción",
      sat.promedio !== null ? `${sat.promedio.toFixed(1)} / 5` : "—",
      sat.total > 0
        ? `${sat.total} de ${sat.cerradas} calificadas`
        : "sin calificaciones",
      sat.promedio === null
        ? "#8D939B"
        : sat.promedio >= 4.5
          ? "#2E7D5B"
          : sat.promedio >= 3.5
            ? "#D9A441"
            : "#C1442D",
    )}
  </div>`;
}

function filaCumplimiento(a, nombre) {
  const pct = a.cumplimiento;
  const c =
    pct === null
      ? "#8D939B"
      : pct >= 80
        ? "#2E7D5B"
        : pct >= 50
          ? "#D9A441"
          : "#C1442D";
  return `<div class="cump">
    <div class="cump-h"><span>${_esc(nombre)}</span><b style="color:${c}">${pct === null ? "—" : pct.toFixed(0) + "%"}</b></div>
    ${barraApilada([
      { n: "Al día", v: a.alDia, c: "#2E7D5B" },
      { n: "En ejecución", v: a.ejecucion, c: "#ED5B23" },
      { n: "Por vencer", v: a.porVencer, c: "#D9A441" },
      { n: "Vencidas", v: a.vencido + a.muyVencido, c: "#C1442D" },
    ])}
    <span class="cump-d">${a.total} tareas · ${a.alDia} al día · ${a.ejecucion} en ejecución${a.porVencer ? ` · ${a.porVencer} por vencer` : ""}${a.vencido + a.muyVencido ? ` · ${a.vencido + a.muyVencido} vencidas` : ""}</span>
  </div>`;
}

function filaPresupuesto(p) {
  const est = ESTADO_PRESUPUESTO[p.estado];
  return `<div class="cump">
    <div class="cump-h"><span>${_esc(p.nombre)}</span><b style="color:${est.color}">${money(p.gastado)} / ${money(p.presupuesto)}</b></div>
    ${barraApilada([
      { n: "Gastado", v: p.gastado, c: est.color },
      { n: "Comprometido", v: p.comprometido, c: est.color + "66" },
      { n: "Disponible", v: Math.max(0, p.disponible), c: "#E3E0D8" },
    ])}
    <span class="cump-d">${est.label}${p.comprometido > 0 ? ` · ${money(p.comprometido)} comprometido` : ""}${p.costoServicios > 0 ? ` · servicios externos ${money(p.costoServicios)}` : ""}</span>
  </div>`;
}

function tablaCostos(kpi) {
  const fila = (l, v, c) =>
    v > 0
      ? `<tr><td><span class="pt" style="background:${c}"></span>${_esc(l)}</td><td class="r">${money(v)}</td>
       <td class="r mut">${kpi.costoTotal ? ((v / kpi.costoTotal) * 100).toFixed(0) : 0}%</td></tr>`
      : "";
  return `<table class="mini">
    <tbody>
      ${fila("Fee de servicio", kpi.costoFee, "#2E7D5B")}
      ${fila("Materiales y bodega", kpi.costoMateriales, "#ED5B23")}
      ${fila("Servicios externos", kpi.costoServicios, "#3B6EA5")}
      <tr class="tot-r"><td>Total del mes</td><td class="r">${money(kpi.costoTotal)}</td><td></td></tr>
      ${
        kpi.costoPorEstudiante !== null
          ? `<tr><td>Costo por estudiante</td><td class="r">${money(kpi.costoPorEstudiante)}</td><td class="r mut">${kpi.estudiantes} est.</td></tr>`
          : ""
      }
    </tbody></table>`;
}

function construirReporteMensualHTML(data, mes) {
  const sedes = data.sedes;
  const ids = sedes.map((s) => s.id);
  const kpi = indicadoresMes(data, ids, mes);
  const sat = satisfaccion(data, ids);
  const glob = presupuestoGlobalMes(data, mes);
  const avanceG = avancePlan(data, ids);
  const serie = serieCostoEstudiante(data, ids, mes).map((p) => ({
    label: p.mes,
    v: p.costo,
  }));

  // Conteo de actividades del mes
  const delMes = (arr, campo) =>
    arr.filter((x) => mesKey(x[campo] || "") === mes);
  const ordMes = data.ordenes.filter((o) => mesContable(o) === mes);
  const solMes = data.solicitudes.filter((s) => mesContable(s) === mes);
  const srvMes = (data.servicios || []).filter((s) => mesKey(s.fecha) === mes);
  const cerradas = [...ordMes, ...solMes, ...srvMes].filter(
    (x) => x.estado === "completada",
  ).length;
  const totalAct = ordMes.length + solMes.length + srvMes.length;

  const porSede = sedes.map((s) => ({
    nombre: s.nombre,
    prev: data.ordenes.filter(
      (o) => o.sedeId === s.id && mesContable(o) === mes,
    ).length,
    corr: data.solicitudes.filter(
      (x) => x.sedeId === s.id && mesContable(x) === mes,
    ).length,
    serv: (data.servicios || []).filter(
      (x) => x.sedeId === s.id && mesKey(x.fecha) === mes,
    ).length,
  }));

  const graficaActividades = svgBarras(
    porSede.map((p) =>
      p.nombre.length > 11 ? p.nombre.slice(0, 10) + "…" : p.nombre,
    ),
    [
      {
        nombre: "Preventivos",
        color: "#ED5B23",
        valores: porSede.map((p) => p.prev),
      },
      {
        nombre: "Correctivos",
        color: "#35383C",
        valores: porSede.map((p) => p.corr),
      },
      {
        nombre: "Servicios",
        color: "#3B6EA5",
        valores: porSede.map((p) => p.serv),
      },
    ],
    { w: 500, h: 155 },
  );

  /* --- Desglose por sede --- */
  const seccionesSede = sedes
    .map((s) => {
      const k = indicadoresMes(data, [s.id], mes);
      const st = satisfaccion(data, [s.id]);
      const p = { ...presupuestoSedeMes(data, s.id, mes), nombre: s.nombre };
      const a = avancePlan(data, [s.id]);
      const acts = [
        ...data.ordenes
          .filter((o) => o.sedeId === s.id && mesContable(o) === mes)
          .map((o) => ({ ...o, tipo: "preventivo" })),
        ...data.solicitudes
          .filter((x) => x.sedeId === s.id && mesContable(x) === mes)
          .map((x) => ({ ...x, tipo: "correctivo", tarea: x.descripcion })),
        ...(data.servicios || [])
          .filter((x) => x.sedeId === s.id && mesKey(x.fecha) === mes)
          .map((x) => ({ ...x, tipo: "servicio", tarea: x.trabajo })),
      ].sort((x, y) =>
        (x.fechaProgramada || x.fecha || "").localeCompare(
          y.fechaProgramada || y.fecha || "",
        ),
      );

      const filas = acts
        .map(
          (x) => `<tr>
        <td><b>${_esc(x.codigo)}</b></td>
        <td>${_esc(tipoMeta(x.tipo).label)}</td>
        <td>${_esc(x.tarea)}</td>
        <td class="c">${_esc(ESTADOS[x.estado]?.label || x.estado)}</td>
        <td class="r">${costoActividad(x) > 0 ? money(costoActividad(x)) : "—"}</td>
      </tr>`,
        )
        .join("");

      return `<section class="sede">
      <div class="sede-h">
        <div><h2>${_esc(s.nombre)}</h2>
          <p class="mut">${s.estudiantes || 0} estudiantes${s.constructor ? ` · ${_esc(s.constructor)}` : ""}</p></div>
        <div class="sede-tot"><span>Costo del mes</span><b>${money(k.costoTotal)}</b></div>
      </div>

      ${bloqueIndicadores(k, st, { compacto: true })}

      <div class="cols2">
        <div><h4>Cumplimiento del plan</h4>${a.total ? filaCumplimiento(a, s.nombre) : '<p class="mut">Sin plan asignado.</p>'}</div>
        <div><h4>Presupuesto de materiales</h4>${filaPresupuesto(p)}</div>
      </div>

      <div class="cols2">
        <div><h4>Composición del costo</h4>${tablaCostos(k)}</div>
        <div><h4>Actividades del mes (${acts.length})</h4>
          ${
            filas
              ? `<table class="mini act"><thead><tr><th>Código</th><th>Tipo</th><th>Trabajo</th><th class="c">Estado</th><th class="r">Costo</th></tr></thead><tbody>${filas}</tbody></table>`
              : '<p class="mut">Sin actividades registradas este mes.</p>'
          }</div>
      </div>
    </section>`;
    })
    .join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Reporte de gestión · ${_esc(mesLabel(mes))}</title>
<style>
@page { size: A4; margin: 13mm 11mm; }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;color:#35383C;font-size:9pt;line-height:1.42}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #35383C;padding-bottom:8px;margin-bottom:12px}
.hdr h1{font-size:16pt;text-transform:uppercase;letter-spacing:.02em}
.hdr .sub{font-size:9pt;color:#787D85;margin-top:2px}
.marca{text-align:right;font-size:8pt;color:#787D85}
.marca b{display:block;font-size:12pt;color:#ED5B23;letter-spacing:.06em}
h2{font-size:12pt;text-transform:uppercase;letter-spacing:.03em}
h3{font-size:10pt;text-transform:uppercase;letter-spacing:.05em;margin:16px 0 7px;padding-bottom:3px;border-bottom:1px solid #D8D4CB}
h4{font-size:8pt;text-transform:uppercase;letter-spacing:.05em;color:#787D85;margin-bottom:5px}
.mut{color:#8D939B;font-size:7.5pt}
.r{text-align:right}.c{text-align:center}
.res{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.res div{border:1px solid #D8D4CB;border-radius:2px;padding:7px 9px}
.res span{display:block;font-size:7pt;text-transform:uppercase;letter-spacing:.05em;color:#8D939B}
.res b{font-size:16pt;line-height:1.1}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.kpis.mini .kpi{padding:5px 8px}
.kpi{border:1px solid #D8D4CB;border-radius:2px;padding:7px 9px}
.k-lbl{display:block;font-size:7pt;text-transform:uppercase;letter-spacing:.05em;color:#8D939B}
.kpi b{font-size:13pt;display:block;line-height:1.25}
.k-sub{font-size:6.8pt;color:#8D939B}
.cols2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:10px}
.cump{margin-bottom:8px}
.cump-h{display:flex;justify-content:space-between;font-size:8pt;margin-bottom:2px}
.cump-h span{font-weight:600}
.cump-d{font-size:6.8pt;color:#8D939B;display:block;margin-top:2px}
.stack{display:flex;width:100%;border-radius:2px;overflow:hidden;background:#E3E0D8}
.stack span{display:block;height:100%}
table{width:100%;border-collapse:collapse;font-size:8pt}
.mini td,.mini th{padding:3px 5px;border-bottom:1px solid #EFEDE8}
.mini th{background:#F2F0EB;text-align:left;font-size:7pt;text-transform:uppercase;letter-spacing:.04em;color:#787D85}
.act td{font-size:7.5pt}
.tot-r td{font-weight:bold;border-top:1px solid #D8D4CB;background:#F7F6F3}
.pt{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px}
.graf{border:1px solid #D8D4CB;border-radius:2px;padding:8px;margin-bottom:10px}
.sede{page-break-before:always;break-before:page}
.resumen-txt{border:1px solid #D8D4CB;border-left:3px solid #ED5B23;border-radius:2px;padding:10px 12px;margin-bottom:14px;background:#FBFAF7}
.resumen-txt h4{margin-bottom:5px}
.resumen-txt p{font-size:8.6pt;line-height:1.55;text-align:justify;margin-bottom:6px}
.resumen-txt ul{list-style:none;padding:0}
.resumen-txt li{font-size:8.3pt;line-height:1.5;padding-left:11px;position:relative;margin-bottom:2px}
.resumen-txt li::before{content:"";position:absolute;left:0;top:6px;width:5px;height:5px;border-radius:50%;background:#ED5B23}
.sede-h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #ED5B23;padding-bottom:5px;margin-bottom:10px}
.sede-tot{text-align:right}
.sede-tot span{display:block;font-size:7pt;text-transform:uppercase;color:#8D939B;letter-spacing:.05em}
.sede-tot b{font-size:14pt;color:#ED5B23}
.pie{margin-top:14px;padding-top:6px;border-top:1px solid #D8D4CB;font-size:7pt;color:#8D939B;display:flex;justify-content:space-between}
</style></head><body>

<div class="hdr">
  <div><h1>Reporte de gestión mensual</h1>
    <p class="sub">${_esc(mesLabel(mes))} · ${sedes.length} sede(s) · ${kpi.estudiantes} estudiantes</p></div>
  <div class="marca"><b>IndustriaMe</b>Gestión de mantenimiento<br>${_esc(fmtDate(new Date()))}</div>
</div>

${bloqueResumenUnificado(data, sedes, mes)}

<h3>1. Consolidado general</h3>

<div class="res">
  <div><span>Actividades</span><b>${totalAct}</b><span class="mut">${cerradas} completadas</span></div>
  <div><span>Correctivos</span><b>${solMes.length}</b><span class="mut">${kpi.nFallas} reportados</span></div>
  <div><span>Costo total</span><b style="color:#ED5B23;font-size:13pt">${money(kpi.costoTotal)}</b><span class="mut">${money(kpi.costoPorEstudiante || 0)} / estudiante</span></div>
  <div><span>Presupuesto materiales</span><b style="font-size:13pt">${money(glob.gastado)}</b><span class="mut">de ${money(glob.presupuesto)}</span></div>
</div>

${bloqueIndicadores(kpi, sat)}

<div class="cols2">
  <div class="graf"><h4>Actividades por sede</h4>${graficaActividades}</div>
  <div class="graf"><h4>Confiabilidad</h4>
    <div style="display:flex;gap:6px">
      <div style="flex:1;text-align:center"><span class="mut">MTBF</span>${svgMedidor(kpi.mtbf, GAUGE_MAX_DIAS, colorMTBF(kpi.mtbf))}</div>
      <div style="flex:1;text-align:center"><span class="mut">MTTR</span>${svgMedidor(kpi.mttr, GAUGE_MAX_DIAS, colorMTTR(kpi.mttr))}</div>
    </div></div>
</div>

<div class="cols2">
  <div><h4>Cumplimiento del plan preventivo</h4>
    ${
      sedes
        .map((s) => {
          const a = avancePlan(data, [s.id]);
          return a.total ? filaCumplimiento(a, s.nombre) : "";
        })
        .join("") || '<p class="mut">Sin planes asignados.</p>'
    }
    <p class="mut">Global: ${avanceG.cumplimiento === null ? "—" : avanceG.cumplimiento.toFixed(0) + "% al día"} sobre ${avanceG.total} tareas.</p>
  </div>
  <div><h4>Presupuesto de materiales por sede</h4>
    ${glob.porSede.map((p) => filaPresupuesto(p)).join("")}
  </div>
</div>

<div class="cols2">
  <div><h4>Composición del costo</h4>${tablaCostos(kpi)}</div>
  <div class="graf"><h4>Costo por estudiante · últimos 6 meses</h4>
    ${svgLinea(serie, { w: 480, h: 140, fmt: (v) => "$" + Number(v).toFixed(2) })}</div>
</div>

<h3>2. Desglose por sede</h3>
<p class="mut">Cada sede se presenta en su propia página con sus indicadores, cumplimiento, presupuesto y actividades del mes.</p>

${seccionesSede}

<div class="pie"><span>IndustriaMe S.A.S. · Reporte de gestión ${_esc(mesLabel(mes))}</span><span>Generado el ${_esc(fmtDate(new Date()))} ${_esc(fmtHora(new Date()))}</span></div>
</body></html>`;
}

/* ============================================================================
   15f. REPORTES · Impresión de órdenes de trabajo en A4
   ========================================================================= */

/* Reúne órdenes, solicitudes y servicios en una lista única para el reporte,
   sin importar su estado (a diferencia del histórico, que solo trae cerradas). */
function actividadesReporte(data, sedeIds) {
  const dentro = (x) => sedeIds.includes(x.sedeId);
  const pre = (data.ordenes || [])
    .filter(dentro)
    .map((o) => ({ ...o, tipo: "preventivo" }));
  const cor = (data.solicitudes || [])
    .filter((s) => dentro(s) && s.estado !== "pendiente")
    .map((s) => ({ ...s, tipo: "correctivo", tarea: s.descripcion }));
  const srv = (data.servicios || [])
    .filter(dentro)
    .map((s) => ({
      ...s,
      tipo: "servicio",
      tarea: s.trabajo,
      fechaProgramada: s.fecha,
    }));
  return [...pre, ...cor, ...srv];
}

/* Tiempo a mostrar: real si ya cerró, estimado si aún no. */
function tiempoActividad(a) {
  if (a.tipo === "servicio") return { txt: "Según proveedor", real: false };
  if (a.fechaCompletada && a.fecha) {
    const d =
      horasEntre(a.fecha, a.hora, a.fechaCompletada, a.horaCompletada) / 24;
    if (d > 0) return { txt: duracionTexto(d), real: true };
  }
  if (a.duracionValor) {
    const u =
      DURACION_UNIDADES.find(([v]) => v === a.duracionUnidad)?.[1] ||
      a.duracionUnidad;
    return { txt: `${a.duracionValor} ${u}`, real: false };
  }
  // Correctivo abierto: lo útil es cuánto lleva esperando
  if (a.fecha && !a.fechaCompletada) {
    const d =
      horasEntre(a.fecha, a.hora, fmtDate(new Date()), fmtHora(new Date())) /
      24;
    if (d > 0) return { txt: `${duracionTexto(d)} abierta`, real: false };
  }
  return { txt: "—", real: false };
}

const costoActividad = (a) =>
  a.tipo === "servicio"
    ? Number(a.presupuesto) || 0
    : costoAprobado(a) + costoConsumos(a);

/* Documento HTML autónomo en A4 listo para imprimir o guardar como PDF. */
function construirReporteHTML(items, data, meta) {
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );
  const nom = (id) => esc(usuarioNombre(data.usuarios, id));

  const filas = items
    .map((a, i) => {
      const t = tiempoActividad(a);
      return `<tr>
      <td class="c">${i + 1}</td>
      <td><b>${esc(a.codigo)}</b><br><span class="mut">${esc(tipoMeta(a.tipo).label)}</span></td>
      <td>${esc(sedeNombre(data.sedes, a.sedeId))}</td>
      <td>${esc(a.tarea)}<br><span class="mut">${esc(ubicacionTexto(data.sedes, a))}</span></td>
      <td class="c">${esc(t.txt)}<br><span class="mut">${t.real ? "real" : "estimado"}</span></td>
      <td>${a.tipo === "servicio" ? esc(a.proveedor || "—") : nom(a.tecnicoId)}</td>
      <td class="c">${esc(ESTADOS[a.estado]?.label || a.estado)}</td>
    </tr>`;
    })
    .join("");

  const detalles = items
    .map((a, i) => {
      const t = tiempoActividad(a);
      const costo = costoActividad(a);
      const linea = (k, v) =>
        v ? `<div class="dl"><span>${k}</span><b>${esc(v)}</b></div>` : "";
      const consumos = (a.consumos || [])
        .map(
          (c) =>
            `<tr><td>${esc(c.nombre)}</td><td class="c">${c.cantidad} ${esc(c.unidad)}</td><td class="r">${money(c.cantidad * c.costoUnitario)}</td></tr>`,
        )
        .join("");
      const materiales = (a.materiales || [])
        .map(
          (m) =>
            `<tr><td>${esc(m.nombre)}</td><td class="c">${m.cantidad} ${esc(m.unidad)}</td><td class="r">${money(m.cantidad * m.costoUnitario)}</td></tr>`,
        )
        .join("");

      return `<section class="det">
      <div class="det-h">
        <div><span class="tag" style="background:${tipoMeta(a.tipo).color}">${esc(tipoMeta(a.tipo).label)}</span>
             <b class="cod">${esc(a.codigo)}</b></div>
        <span class="est">${esc(ESTADOS[a.estado]?.label || a.estado)}</span>
      </div>
      <h3>${esc(a.tarea)}</h3>
      <p class="ubi">${esc(ubicacionTexto(data.sedes, a))}</p>

      <div class="grid">
        ${linea("Responsable", a.tipo === "servicio" ? a.proveedor || "—" : usuarioNombre(data.usuarios, a.tecnicoId))}
        ${linea("Programada", a.fechaProgramada)}
        ${a.solicitanteId ? linea("Solicitó", `${usuarioNombre(data.usuarios, a.solicitanteId)} · ${a.fecha || ""}`) : ""}
        ${a.criticidad ? linea("Criticidad", CRITICIDAD[a.criticidad].label) : ""}
        ${a.frecuencia ? linea("Frecuencia", a.frecuencia) : ""}
        ${a.categoria ? linea("Categoría", a.categoria) : ""}
        ${linea("Tiempo", `${t.txt} (${t.real ? "real" : "estimado"})`)}
        ${a.fechaCompletada ? linea("Cierre", `${a.fechaCompletada}${a.horaCompletada ? " · " + a.horaCompletada : ""}`) : ""}
        ${costo > 0 ? linea("Costo", money(costo)) : ""}
        ${a.calificacion ? linea("Calificación", "★".repeat(a.calificacion) + "☆".repeat(5 - a.calificacion)) : ""}
      </div>

      ${a.procedimiento ? `<div class="blk"><h4>Procedimiento</h4><pre>${esc(a.procedimiento)}</pre></div>` : ""}
      ${a.observaciones ? `<div class="blk"><h4>Observaciones</h4><p>${esc(a.observaciones)}</p></div>` : ""}
      ${a.resolucion ? `<div class="blk"><h4>Resolución</h4><p>${esc(a.resolucion)}</p></div>` : ""}
      ${consumos ? `<div class="blk"><h4>Consumo de bodega</h4><table class="mini"><tbody>${consumos}</tbody></table></div>` : ""}
      ${materiales ? `<div class="blk"><h4>Materiales</h4><table class="mini"><tbody>${materiales}</tbody></table></div>` : ""}

      <div class="firma">
        <div><span></span><p>Ejecutado por</p></div>
        <div><span></span><p>Recibido conforme</p></div>
      </div>
    </section>`;
    })
    .join("");

  const totalCosto = items.reduce((s, a) => s + costoActividad(a), 0);

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${esc(meta.titulo)}</title>
<style>
@page { size: A4; margin: 14mm 12mm; }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;color:#35383C;font-size:9.5pt;line-height:1.45}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #35383C;padding-bottom:8px;margin-bottom:12px}
.hdr h1{font-size:15pt;letter-spacing:.02em;text-transform:uppercase}
.hdr .sub{font-size:8.5pt;color:#787D85;margin-top:2px}
.hdr .marca{text-align:right;font-size:8.5pt;color:#787D85}
.hdr .marca b{display:block;font-size:12pt;color:#ED5B23;letter-spacing:.06em}
.resumen{margin-bottom:16px}
h2{font-size:10.5pt;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px;padding-bottom:3px;border-bottom:1px solid #D8D4CB}
table{width:100%;border-collapse:collapse;font-size:8.5pt}
thead th{background:#35383C;color:#fff;text-align:left;padding:5px 6px;font-size:8pt;text-transform:uppercase;letter-spacing:.04em}
tbody td{padding:5px 6px;border-bottom:1px solid #E3E0D8;vertical-align:top}
tbody tr:nth-child(even){background:#F7F6F3}
.c{text-align:center}.r{text-align:right}
.mut{color:#8D939B;font-size:7.5pt}
.tot{display:flex;justify-content:space-between;padding:6px;background:#F2F0EB;font-weight:bold;font-size:9pt;margin-top:4px}
.det{border:1px solid #D8D4CB;border-radius:2px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid;break-inside:avoid}
.det-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.tag{color:#fff;font-size:7.5pt;padding:2px 6px;border-radius:2px;text-transform:uppercase;letter-spacing:.05em}
.cod{margin-left:6px;font-size:10pt}
.est{font-size:8pt;color:#787D85;text-transform:uppercase;letter-spacing:.04em}
.det h3{font-size:11pt;margin-bottom:2px}
.ubi{color:#787D85;font-size:8.5pt;margin-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px;margin-bottom:8px}
.dl{font-size:8.5pt;border-bottom:1px dotted #E3E0D8;padding-bottom:2px}
.dl span{color:#8D939B;display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.04em}
.blk{margin-top:7px}
.blk h4{font-size:8pt;text-transform:uppercase;letter-spacing:.05em;color:#787D85;margin-bottom:3px}
.blk p,.blk pre{font-size:8.5pt;white-space:pre-wrap;font-family:inherit}
.mini td{padding:3px 5px;border-bottom:1px solid #EFEDE8;font-size:8pt}
.firma{display:flex;gap:30px;margin-top:14px;padding-top:6px}
.firma div{flex:1;text-align:center}
.firma span{display:block;border-bottom:1px solid #8D939B;height:22px}
.firma p{font-size:7.5pt;color:#8D939B;margin-top:3px;text-transform:uppercase;letter-spacing:.04em}
.pie{margin-top:14px;padding-top:6px;border-top:1px solid #D8D4CB;font-size:7.5pt;color:#8D939B;display:flex;justify-content:space-between}
@media print{ .det{page-break-inside:avoid} }
</style></head><body>
<div class="hdr">
  <div><h1>${esc(meta.titulo)}</h1><p class="sub">${esc(meta.subtitulo)}</p></div>
  <div class="marca"><b>IndustriaMe</b>Gestión de mantenimiento<br>${esc(meta.emitido)}</div>
</div>

<div class="resumen">
  <h2>1. Resumen de órdenes (${items.length})</h2>
  <table>
    <thead><tr><th class="c">#</th><th>Orden</th><th>Sede</th><th>Descripción del trabajo</th><th class="c">Tiempo</th><th>Responsable</th><th class="c">Estado</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="7" class="c">Sin órdenes seleccionadas</td></tr>'}</tbody>
  </table>
  ${totalCosto > 0 ? `<div class="tot"><span>Costo total del reporte</span><span>${money(totalCosto)}</span></div>` : ""}
</div>

<h2>2. Detalle de cada orden</h2>
${detalles || "<p>Sin detalle.</p>"}

<div class="pie"><span>IndustriaMe S.A.S. · ${esc(meta.subtitulo)}</span><span>Generado el ${esc(meta.emitido)}</span></div>
</body></html>`;
}

/* Imprime el documento en un iframe oculto: no requiere ventanas emergentes.
   Desde el diálogo del navegador se puede elegir "Guardar como PDF". */
/* Imprime/gena PDF de un documento HTML. Se intenta en este orden:
   1) pestaña nueva (la vía más confiable: el navegador la trata como
      navegación normal, no como popup, y siempre permite imprimir)
   2) iframe oculto (respaldo si el navegador bloqueó la pestaña)
   3) descarga directa del archivo (nunca falla; el usuario lo abre e imprime)
   Devuelve qué vía usó, para poder avisarle al usuario si tocó el respaldo. */
function imprimirHTML(html, nombreRespaldo = "reporte.html") {
  try {
    const ventana = window.open("", "_blank");
    if (ventana && !ventana.closed) {
      ventana.document.open();
      ventana.document.write(html);
      ventana.document.close();
      setTimeout(() => {
        try {
          ventana.focus();
          ventana.print();
        } catch (e) {
          /* el usuario aún puede imprimir manualmente desde la pestaña */
        }
      }, 350);
      return "ventana";
    }
  } catch (e) {
    console.error("No se pudo abrir la pestaña de impresión", e);
  }

  try {
    const marco = document.createElement("iframe");
    marco.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(marco);
    marco.srcdoc = html;
    marco.onload = () => {
      try {
        marco.contentWindow.focus();
        marco.contentWindow.print();
      } catch (e) {
        console.error(e);
      }
      setTimeout(() => document.body.removeChild(marco), 1000);
    };
    return "iframe";
  } catch (e) {
    console.error(
      "No se pudo preparar la impresión, se intenta descargar el archivo",
      e,
    );
    try {
      descargarHTML(html, nombreRespaldo);
      return "descarga";
    } catch (e2) {
      console.error("Tampoco se pudo descargar automáticamente", e2);
      return "fallo";
    }
  }
}

function descargarHTML(html, nombre) {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PRESETS = {
  hoy_plan: { label: "Trabajo de hoy", desc: "Programado para hoy" },
  hoy_hecho: { label: "Ejecutado hoy", desc: "Cerrado hoy" },
  semana: { label: "Esta semana", desc: "Programado en los próximos 7 días" },
  libre: { label: "Rango libre", desc: "Rango de fechas definido" },
};

function VistaReportes({ data, sedes, user }) {
  const hoy = fmtDate(new Date());
  const [preset, setPreset] = useState("hoy_plan");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [fSede, setFSede] = useState("todas");
  const [fTecnico, setFTecnico] = useState("todos");
  const [fTipo, setFTipo] = useState("todos");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null); // null = todas las filtradas
  const sedeIds = sedes.map((s) => s.id);

  const todas = useMemo(
    () => actividadesReporte(data, sedeIds),
    [data, sedeIds.join(",")],
  );

  const rango = useMemo(() => {
    if (preset === "semana") {
      const f = new Date();
      f.setDate(f.getDate() + 7);
      return { d: hoy, h: fmtDate(f), campo: "fechaProgramada" };
    }
    if (preset === "hoy_hecho")
      return { d: hoy, h: hoy, campo: "fechaCompletada" };
    if (preset === "hoy_plan")
      return { d: hoy, h: hoy, campo: "fechaProgramada" };
    return { d: desde, h: hasta, campo: "fechaProgramada" };
  }, [preset, desde, hasta, hoy]);

  const filtradas = todas
    .filter((a) => {
      if (q.trim()) {
        const t = q.trim().toLowerCase();
        const hit =
          (a.codigo || "").toLowerCase().includes(t) ||
          (a.tarea || "").toLowerCase().includes(t);
        if (!hit) return false;
        return true; // al buscar por código se ignora el rango de fechas
      }
      const f = a[rango.campo] || "";
      if (!f || f < rango.d || f > rango.h) return false;
      if (fSede !== "todas" && a.sedeId !== fSede) return false;
      if (fTecnico !== "todos" && a.tecnicoId !== fTecnico) return false;
      if (fTipo !== "todos" && a.tipo !== fTipo) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (a.fechaProgramada || "").localeCompare(b.fechaProgramada || "") ||
        (a.codigo || "").localeCompare(b.codigo || ""),
    );

  const marcadas =
    sel === null ? filtradas : filtradas.filter((a) => sel.includes(a.id));
  const alternar = (id) => {
    const base = sel === null ? filtradas.map((x) => x.id) : sel;
    setSel(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };
  const todasMarcadas = sel === null || marcadas.length === filtradas.length;

  const meta = {
    titulo: q.trim()
      ? `Orden de trabajo · ${q.trim().toUpperCase()}`
      : preset === "hoy_hecho"
        ? "Reporte de trabajo ejecutado"
        : "Programa de trabajo",
    subtitulo: [
      q.trim()
        ? `Búsqueda: ${q.trim()}`
        : `${PRESETS[preset].desc}: ${rango.d}${rango.h !== rango.d ? ` a ${rango.h}` : ""}`,
      fSede !== "todas"
        ? sedeNombre(data.sedes, fSede)
        : `${sedes.length} sede(s)`,
      fTecnico !== "todos" ? usuarioNombre(data.usuarios, fTecnico) : null,
    ]
      .filter(Boolean)
      .join(" · "),
    emitido: `${hoy} ${fmtHora(new Date())}`,
  };

  const generar = () => construirReporteHTML(marcadas, data, meta);
  const tecnicos = data.usuarios.filter((u) => u.rol === "tecnico");

  return (
    <div className="mt-4">
      <p className="text-xs mb-3" style={cSlate}>
        Arma el parte de trabajo: elige el alcance, marca las órdenes y descarga
        el PDF en A4 para imprimir o compartir.
      </p>

      {/* Alcance rápido */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {Object.entries(PRESETS).map(([k, p]) => (
          <button
            key={k}
            onClick={() => {
              setPreset(k);
              setQ("");
              setSel(null);
            }}
            className="text-xs font-semibold px-3 py-2 rounded-md border"
            style={{
              background: preset === k && !q.trim() ? COLORS.charcoal : "white",
              color: preset === k && !q.trim() ? "white" : COLORS.slate,
              borderColor:
                preset === k && !q.trim() ? COLORS.charcoal : COLORS.line,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "libre" && !q.trim() && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label="Desde">
            <input
              type="date"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setSel(null);
              }}
              className="w-full border rounded-md px-2 py-2 text-sm"
              style={inputStyle}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
                setSel(null);
              }}
              className="w-full border rounded-md px-2 py-2 text-sm"
              style={inputStyle}
            />
          </Field>
        </div>
      )}

      {/* Filtros finos */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(null);
          }}
          placeholder="O busca una orden puntual: OT-0003, SOL-0002…"
          className="flex-1 min-w-44 border rounded-md px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
        <select
          value={fTipo}
          onChange={(e) => {
            setFTipo(e.target.value);
            setSel(null);
          }}
          className="border rounded-md px-2 py-2 text-sm bg-white"
          style={inputStyle}
        >
          <option value="todos">Todo tipo</option>
          <option value="preventivo">Preventivos</option>
          <option value="correctivo">Correctivos</option>
          <option value="servicio">Servicios</option>
        </select>
        {sedes.length > 1 && (
          <select
            value={fSede}
            onChange={(e) => {
              setFSede(e.target.value);
              setSel(null);
            }}
            className="border rounded-md px-2 py-2 text-sm bg-white"
            style={inputStyle}
          >
            <option value="todas">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
        <select
          value={fTecnico}
          onChange={(e) => {
            setFTecnico(e.target.value);
            setSel(null);
          }}
          className="border rounded-md px-2 py-2 text-sm bg-white"
          style={inputStyle}
        >
          <option value="todos">Todos los responsables</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => imprimirHTML(generar())}
          disabled={marcadas.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white disabled:opacity-40"
          style={{ background: COLORS.orange }}
        >
          <Download size={13} /> Imprimir / Guardar PDF
        </button>
        <button
          onClick={() => descargarHTML(generar(), `orden-trabajo-${hoy}.html`)}
          disabled={marcadas.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border disabled:opacity-40"
          style={{ borderColor: COLORS.line, color: COLORS.charcoal }}
        >
          Descargar archivo
        </button>
        <span className="text-[11px]" style={cSlate}>
          {marcadas.length} de {filtradas.length} orden(es) en el reporte
        </span>
      </div>

      {/* Selección */}
      <div className="border rounded-md overflow-x-auto" style={cardStyle}>
        <table className="w-full border-collapse" style={{ minWidth: 620 }}>
          <thead>
            <tr style={{ background: COLORS.charcoal }}>
              <th className="px-2.5 py-2 w-8">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={() => setSel(todasMarcadas ? [] : null)}
                />
              </th>
              {[
                "Orden",
                "Sede",
                "Descripción del trabajo",
                "Tiempo",
                "Responsable",
                "Estado",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left text-[10px] font-semibold uppercase tracking-wide px-2.5 py-2 whitespace-nowrap"
                  style={{ color: "white" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((a, i) => {
              const marcada = sel === null || sel.includes(a.id);
              const t = tiempoActividad(a);
              return (
                <tr
                  key={a.id}
                  style={{
                    background: i % 2 ? COLORS.paper : "white",
                    borderTop: `1px solid ${COLORS.line}`,
                    opacity: marcada ? 1 : 0.45,
                  }}
                >
                  <td className="px-2.5 py-2">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(a.id)}
                    />
                  </td>
                  <td className="px-2.5 py-2 text-xs">
                    <span className="font-bold" style={cChar}>
                      {a.codigo}
                    </span>
                    <span className="block">
                      <Chip color={tipoMeta(a.tipo).color}>
                        {tipoMeta(a.tipo).label}
                      </Chip>
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-xs" style={cSlate}>
                    {sedeNombre(data.sedes, a.sedeId)}
                  </td>
                  <td className="px-2.5 py-2 text-xs" style={cChar}>
                    {a.tarea}
                    <span className="block text-[10px]" style={cSlate}>
                      {ubicacionTexto(data.sedes, a)}
                    </span>
                  </td>
                  <td
                    className="px-2.5 py-2 text-xs whitespace-nowrap"
                    style={cSlate}
                  >
                    {t.txt}
                    <span className="block text-[10px]">
                      {t.real ? "real" : "estimado"}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-xs" style={cSlate}>
                    {a.tipo === "servicio"
                      ? a.proveedor || "—"
                      : usuarioNombre(data.usuarios, a.tecnicoId)}
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="flex items-center gap-1.5">
                      <EstadoChip estado={a.estado} />
                      <BotonDetalle item={a} size={13} />
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-sm text-center"
                  style={cSlate}
                >
                  {q.trim()
                    ? `Sin resultados para “${q}”.`
                    : "No hay órdenes en este rango. Prueba otro alcance."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] mt-2" style={cSlate}>
        El reporte incluye el resumen en tabla y el desglose de cada orden, con
        espacio para firmas. En el diálogo de impresión elige “Guardar como PDF”
        para compartirlo.
      </p>
    </div>
  );
}

/* ============================================================================
   16. ADMIN · Usuarios  (rol = tipo = permiso, todo en un solo campo)
   ========================================================================= */

function FormUsuario({ initial, sedes, onSave, onClose }) {
  const [nombre, setNombre] = useState(initial?.nombre || "");
  const [rol, setRol] = useState(initial?.rol || "solicitante");
  const [clave, setClave] = useState(initial?.clave || "");
  const [showClave, setShowClave] = useState(false);
  const [sedeIds, setSedeIds] = useState(initial?.sedeIds || []);

  const modoSedes = ROLES[rol].sedes; // 'una' | 'varias' | 'todas'
  const cambiarRol = (r) => {
    setRol(r);
    setSedeIds(
      ROLES[r].sedes === "todas"
        ? []
        : sedeIds.slice(0, ROLES[r].sedes === "una" ? 1 : undefined),
    );
  };
  const toggleSede = (id) =>
    setSedeIds((p) =>
      modoSedes === "una"
        ? [id]
        : p.includes(id)
          ? p.filter((x) => x !== id)
          : [...p, id],
    );

  const valido =
    nombre.trim() &&
    clave.trim().length >= 4 &&
    (modoSedes === "todas" || sedeIds.length > 0);

  return (
    <div className="space-y-3">
      <Field label="Nombre completo">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Patricia Mejía"
          className={inputCls}
          style={inputStyle}
        />
      </Field>

      <Field label="Rol" hint={ROLES[rol].desc}>
        <div className="grid grid-cols-2 gap-2">
          {ROL_IDS.map((r) => (
            <button
              key={r}
              onClick={() => cambiarRol(r)}
              className="text-[11px] font-semibold py-2 px-2 rounded-md border text-left leading-tight"
              style={{
                borderColor: rol === r ? ROLES[r].color : COLORS.line,
                background: rol === r ? `${ROLES[r].color}15` : "white",
                color: rol === r ? ROLES[r].color : COLORS.slate,
              }}
            >
              {ROLES[r].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Clave de acceso">
        <div className="relative">
          <input
            type={showClave ? "text" : "password"}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Mínimo 4 caracteres"
            className={`${inputCls} pr-10`}
            style={inputStyle}
          />
          <button
            onClick={() => setShowClave(!showClave)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            {showClave ? (
              <EyeOff size={15} color={COLORS.slate} />
            ) : (
              <Eye size={15} color={COLORS.slate} />
            )}
          </button>
        </div>
      </Field>

      {modoSedes === "todas" ? (
        <div
          className="text-xs rounded-md p-2.5"
          style={{ background: COLORS.cream, color: COLORS.slate }}
        >
          Este rol tiene acceso a{" "}
          <span className="font-semibold" style={cChar}>
            todas las sedes
          </span>
          .
        </div>
      ) : (
        <Field
          label={modoSedes === "una" ? "Sede que representa" : "Sedes a cargo"}
          hint={
            modoSedes === "varias"
              ? "Un técnico puede tener varias sedes."
              : null
          }
        >
          <div className="space-y-1.5">
            {sedes.map((s) => {
              const on = sedeIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSede(s.id)}
                  className="w-full flex items-center gap-2 border rounded-md px-2.5 py-2 text-left"
                  style={{
                    borderColor: on ? COLORS.orange : COLORS.line,
                    background: on ? `${COLORS.orange}0D` : "white",
                  }}
                >
                  <span
                    className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                    style={{
                      borderColor: on ? COLORS.orange : COLORS.line,
                      background: on ? COLORS.orange : "white",
                    }}
                  >
                    {on && <CheckCircle2 size={11} color="white" />}
                  </span>
                  <span className="text-xs font-medium" style={cChar}>
                    {s.nombre}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <button
        disabled={!valido}
        onClick={() => {
          onSave({
            id: initial?.id || uid("usr"),
            nombre: nombre.trim(),
            rol,
            clave: clave.trim(),
            sedeIds: modoSedes === "todas" ? [] : sedeIds,
          });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
        style={{ background: COLORS.orange }}
      >
        {initial ? "Guardar cambios" : "Crear usuario"}
      </button>
    </div>
  );
}

function AdminUsuarios({ data, persist }) {
  const [modal, setModal] = useState(null);

  const guardar = (u) => {
    const existe = data.usuarios.some((x) => x.id === u.id);
    persist((data) => ({
      ...data,
      usuarios: existe
        ? data.usuarios.map((x) => (x.id === u.id ? u : x))
        : [...data.usuarios, u],
    }));
  };

  return (
    <div className="mt-4">
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white"
          style={{ background: COLORS.orange }}
        >
          <Plus size={13} /> Nuevo usuario
        </button>
      </div>

      {ROL_IDS.map((rolId) => {
        const usuarios = data.usuarios.filter((u) => u.rol === rolId);
        if (usuarios.length === 0) return null;
        return (
          <div key={rolId} className="mb-5">
            <SectionTitle count={usuarios.length}>
              {ROLES[rolId].label}
            </SectionTitle>
            <div className="space-y-2">
              {usuarios.map((u) => (
                <FilaUsuario
                  key={u.id}
                  user={u}
                  data={data}
                  onEdit={() => setModal({ user: u })}
                  onDelete={() =>
                    persist((data) => ({
                      ...data,
                      usuarios: data.usuarios.filter((x) => x.id !== u.id),
                    }))
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      {modal && (
        <Modal
          title={modal.user ? "Editar usuario" : "Nuevo usuario"}
          onClose={() => setModal(null)}
        >
          <FormUsuario
            initial={modal.user}
            sedes={data.sedes}
            onSave={guardar}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function FilaUsuario({ user, data, onEdit, onDelete }) {
  const [ver, setVer] = useState(false);
  const rol = rolDe(user);
  const sedesTxt =
    rol.sedes === "todas"
      ? "Todas las sedes"
      : user.sedeIds.map((id) => sedeNombre(data.sedes, id)).join(", ") ||
        "Sin sede";

  return (
    <div
      className="border rounded-md p-3"
      style={{
        borderColor: COLORS.line,
        borderLeft: `3px solid ${rol.color}`,
        background: "white",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={cChar}>
            {user.nombre}
          </p>
          <p className="text-[11px] mt-0.5 truncate" style={cSlate}>
            {sedesTxt}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <KeyRound size={11} color={COLORS.slate} />
            <span className="text-xs font-mono" style={cSlate}>
              {ver ? user.clave : "••••••"}
            </span>
            <button onClick={() => setVer(!ver)}>
              {ver ? (
                <EyeOff size={12} color={COLORS.slate} />
              ) : (
                <Eye size={12} color={COLORS.slate} />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onEdit}>
            <Pencil size={13} color={COLORS.slate} />
          </button>
          <DeleteBtn onConfirm={onDelete} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   17. VISTA ADMIN (control total)  y  VISTA SUPERVISOR CLIENTE (solo aprueba)
   ========================================================================= */

function VistaAdmin({ data, persist, user, onLogout, ultimaSync }) {
  const [tab, setTab] = useState("dashboard");
  const [mes, setMes] = useState(mesKey(fmtDate(new Date())));

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={14} /> },
    { id: "sedes", label: "Sedes", icon: <Building2 size={14} /> },
    {
      id: "programacion",
      label: "Programación",
      icon: <CalendarDays size={14} />,
    },
    {
      id: "correctivos",
      label: "Correctivos",
      icon: <AlertTriangle size={14} />,
    },
    { id: "servicios", label: "Servicios", icon: <Wrench size={14} /> },
    { id: "bodega", label: "Bodega", icon: <Layers size={14} /> },
    { id: "presupuesto", label: "Presupuesto", icon: <Wallet size={14} /> },
    { id: "reportes", label: "Reportes", icon: <Download size={14} /> },
    { id: "historico", label: "Histórico", icon: <ClipboardList size={14} /> },
    { id: "config", label: "Configuración", icon: <Users size={14} /> },
  ];

  const [planModal, setPlanModal] = useState(null);

  return (
    <ProveedorDetalle data={data}>
      <div className="max-w-6xl mx-auto px-4 pb-16">
        <AppHeader
          user={user}
          onLogout={onLogout}
          ultimaSync={ultimaSync}
          sedesTexto="Todas las sedes"
        />
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "dashboard" && (
          <Dashboard
            data={data}
            persist={persist}
            sedes={data.sedes}
            mes={mes}
            onMesChange={setMes}
            mostrarPresupuesto
            mostrarCosto
            mostrarSatisfaccion
          />
        )}
        {tab === "presupuesto" && (
          <VistaPresupuesto data={data} mes={mes} onMesChange={setMes} />
        )}
        {tab === "sedes" && <AdminSedes data={data} persist={persist} />}
        {tab === "programacion" && (
          <AdminProgramacion data={data} persist={persist} />
        )}
        {tab === "correctivos" && (
          <AdminCorrectivos data={data} persist={persist} />
        )}
        {tab === "servicios" && (
          <AdminServicios data={data} persist={persist} />
        )}
        {tab === "bodega" && (
          <VistaBodega
            data={data}
            persist={persist}
            sedes={data.sedes}
            editable
          />
        )}
        {tab === "reportes" && (
          <VistaReportes data={data} sedes={data.sedes} user={user} />
        )}
        {tab === "historico" && (
          <VistaHistorico data={data} sedes={data.sedes} rol="admin" />
        )}
        {tab === "config" && (
          <AdminConfiguracion
            data={data}
            persist={persist}
            setPlanModal={setPlanModal}
          />
        )}

        {planModal && (
          <Modal
            title={planModal.plan ? "Editar plan" : "Nuevo plan"}
            onClose={() => setPlanModal(null)}
            wide
          >
            <FormPlan
              data={data}
              initial={planModal.plan}
              onAddCategoria={(c) =>
                persist((data) => ({
                  ...data,
                  categorias: [...(data.categorias || CATEGORIAS_BASE), c],
                }))
              }
              onSave={(plan) => {
                const existe = data.planes.some((p) => p.id === plan.id);
                persist((data) => ({
                  ...data,
                  planes: existe
                    ? data.planes.map((p) => (p.id === plan.id ? plan : p))
                    : [...data.planes, plan],
                }));
              }}
              onClose={() => setPlanModal(null)}
            />
          </Modal>
        )}
      </div>
    </ProveedorDetalle>
  );
}

function VistaCliente({ data, persist, user, onLogout, ultimaSync }) {
  const acciones = useAcciones(data, persist);
  const [tab, setTab] = useState("dashboard");
  const [mes, setMes] = useState(mesKey(fmtDate(new Date())));

  const porAprobar = itemsConMateriales(data, ["pendiente_aprobacion"]);
  const enEspera = itemsConMateriales(data, ["en_espera"]);
  const historial = itemsConMateriales(data, ["aprobado", "rechazado"]);
  const bandeja = porAprobar.length + enEspera.length;

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={14} /> },
    {
      id: "aprobaciones",
      label: `Aprobaciones (${bandeja})`,
      icon: <CheckCircle2 size={14} />,
    },
    { id: "presupuesto", label: "Presupuesto", icon: <Wallet size={14} /> },
    { id: "reportes", label: "Reportes", icon: <Download size={14} /> },
    { id: "historico", label: "Histórico", icon: <ClipboardList size={14} /> },
  ];

  return (
    <ProveedorDetalle data={data}>
      <div className="max-w-5xl mx-auto px-4 pb-16">
        <AppHeader
          user={user}
          onLogout={onLogout}
          ultimaSync={ultimaSync}
          sedesTexto="Todas las sedes · Solo lectura"
        />
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "dashboard" && (
          <Dashboard
            data={data}
            persist={persist}
            sedes={data.sedes}
            mes={mes}
            onMesChange={setMes}
            mostrarPresupuesto
            mostrarCosto
            mostrarSatisfaccion
          />
        )}
        {tab === "presupuesto" && (
          <VistaPresupuesto data={data} mes={mes} onMesChange={setMes} />
        )}
        {tab === "reportes" && (
          <VistaReportes data={data} sedes={data.sedes} user={user} />
        )}
        {tab === "historico" && (
          <VistaHistorico data={data} sedes={data.sedes} rol="cliente" />
        )}

        {tab === "aprobaciones" && (
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-xs mb-3" style={cSlate}>
                Actividades correctivas con materiales costeados que requieren
                tu aprobación antes de ejecutarse.
              </p>
              <SectionTitle count={porAprobar.length}>
                Pendientes de tu aprobación
              </SectionTitle>
              <div className="space-y-2">
                {porAprobar.map((i) => (
                  <TarjetaCosto
                    key={i.id}
                    item={i}
                    data={data}
                    rol="cliente"
                    defaultOpen
                    onUpdate={(p) => acciones.updateActividad(i, p)}
                  />
                ))}
                {porAprobar.length === 0 && (
                  <Empty>No hay solicitudes de costo nuevas.</Empty>
                )}
              </div>
            </div>

            {enEspera.length > 0 && (
              <div>
                <SectionTitle count={enEspera.length}>
                  En espera de tu decisión
                </SectionTitle>
                <p className="text-xs mb-2" style={cSlate}>
                  Las dejaste en espera. Siguen reservando presupuesto hasta que
                  las apruebes o rechaces.
                </p>
                <div className="space-y-2">
                  {enEspera.map((i) => (
                    <TarjetaCosto
                      key={i.id}
                      item={i}
                      data={data}
                      rol="cliente"
                      defaultOpen
                      onUpdate={(p) => acciones.updateActividad(i, p)}
                    />
                  ))}
                </div>
              </div>
            )}

            {historial.length > 0 && (
              <div>
                <SectionTitle count={historial.length}>
                  Historial de decisiones
                </SectionTitle>
                <div className="space-y-2">
                  {historial.map((i) => (
                    <TarjetaCosto
                      key={i.id}
                      item={i}
                      data={data}
                      rol="cliente"
                      onUpdate={(p) => acciones.updateActividad(i, p)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ProveedorDetalle>
  );
}

/* ============================================================================
   18. APP  (una puerta de entrada, el rol decide la vista)
   ========================================================================= */

export default function App() {
  const { data, persist, loading, ultimaSync, syncError } = useSystemData();
  const [user, setUser] = useState(null);

  const vista = () => {
    switch (user.rol) {
      case "solicitante":
        return (
          <VistaSolicitante
            data={data}
            persist={persist}
            user={user}
            onLogout={() => setUser(null)}
            ultimaSync={ultimaSync}
          />
        );
      case "tecnico":
        return (
          <VistaTecnico
            data={data}
            persist={persist}
            user={user}
            onLogout={() => setUser(null)}
            ultimaSync={ultimaSync}
          />
        );
      case "cliente":
        return (
          <VistaCliente
            data={data}
            persist={persist}
            user={user}
            onLogout={() => setUser(null)}
            ultimaSync={ultimaSync}
          />
        );
      default:
        return (
          <VistaAdmin
            data={data}
            persist={persist}
            user={user}
            onLogout={() => setUser(null)}
            ultimaSync={ultimaSync}
          />
        );
    }
  };

  return (
    <div className="min-h-screen" style={{ background: COLORS.paper }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap'); * { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; }`}</style>
      {syncError && (
        <div
          className="px-4 py-2 text-xs font-medium text-center"
          style={{ background: "#FDE8E4", color: COLORS.rojo }}
        >
          {syncError}
        </div>
      )}
      {loading || !data ? (
        <div
          className="flex items-center justify-center h-screen text-sm"
          style={cSlate}
        >
          Cargando sistema…
        </div>
      ) : !user ? (
        <Login usuarios={data.usuarios} onLogin={setUser} />
      ) : (
        vista()
      )}
    </div>
  );
}
