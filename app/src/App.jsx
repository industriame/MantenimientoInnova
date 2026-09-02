import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import jsQR from "jsqr";
import logoISE from "./assets/Logo_ISE.png";       // tu logo (IndustriaMe / ISE)
import logoCliente from "./assets/innova.png";     // logo del cliente (Innova Schools)
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { hasAppData, loadAppState, saveAppState, saveAppStateV2, uploadFile } from "./api/db.js";
import {
  QrCode, Wrench, ClipboardList, BarChart3, Plus, X, ChevronRight, ChevronDown,
  ChevronLeft, ChevronUp, AlertTriangle, CheckCircle2, Clock, DollarSign, Building2, Layers,
  Users, ShieldCheck, ArrowLeft, Download, Send, Trash2, Pencil, CalendarDays,
  Filter, KeyRound, Eye, EyeOff, Camera, LogOut, TrendingUp, Wallet, Star, Info, RefreshCw, FileText
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";

/* ============================================================================
   1. CONFIGURACIÓN Y CONSTANTES
   ========================================================================= */

const PRESUPUESTO_MENSUAL_SEDE = 100;   // USD/mes por sede — solo materiales
const FEE_SERVICIO_SEDE = 450;          // USD/mes — nuestro honorario por sede
// Escala de los medidores (días). MTBF: más alto es mejor. MTTR: más bajo es mejor.
const GAUGE_MAX_DIAS = 15;
const colorMTBF = (v) => (v === null ? COLORS.slate : v >= 7 ? COLORS.verde : v >= 3 ? COLORS.ambar : COLORS.rojo);
const colorCumpl = (p) => (p === null ? COLORS.slate : p >= 80 ? COLORS.verde : p >= 50 ? COLORS.ambar : COLORS.rojo);
const colorMTTR = (v) => (v === null ? COLORS.slate : v <= 3 ? COLORS.verde : v <= 7 ? COLORS.ambar : COLORS.rojo);

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
  solicitante: { label: "Solicitante", desc: "Reporta novedades de su sede", color: COLORS.orange, sedes: "una" },
  tecnico: { label: "Técnico de Mantenimiento", desc: "Ejecuta actividades en sus sedes", color: COLORS.charcoal, sedes: "varias" },
  admin: { label: "Supervisor Administrador", desc: "Control total del sistema", color: COLORS.verde, sedes: "todas" },
  cliente: { label: "Cliente", desc: "Revisa y aprueba costos, sin edición", color: "#3B6EA5", sedes: "todas" },
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
  por_aprobar: { label: "En aprobación", color: "#7B5EA7" },
  aprobada: { label: "Aprobada", color: "#3B6EA5" },
  rechazada: { label: "Rechazada", color: COLORS.rojo },
  programada: { label: "Programada", color: COLORS.ambar },
  en_proceso: { label: "En proceso", color: COLORS.orange },
  espera: { label: "En espera", color: "#3B6EA5" },
  completada: { label: "Completada", color: COLORS.verde },
};
const ESTADOS_EJECUCION = ["programada", "en_proceso", "espera", "completada"];
// Estados en los que la actividad sigue viva (ya activada, aún sin cerrar)
const ESTADOS_ABIERTOS = ["programada", "en_proceso", "espera"];

/* Motivos frecuentes de reprogramación. El primero es el caso típico:
   se detecta en campo que falta un repuesto y hay que comprarlo. */
/* Clasificación del proveedor: se define al crear el servicio, cuando todavía
   no se sabe a quién se va a contratar. */
const TIPOS_PROVEEDOR = [
  "Climatización / HVAC",
  "Sistema contra incendios",
  "Eléctrico / subestación",
  "Ascensores y elevadores",
  "Fumigación y control de plagas",
  "Limpieza especializada",
  "Obra civil / albañilería",
  "Cerrajería",
  "Jardinería",
  "Equipos de cocina",
  "Otro",
];

const MOTIVOS_REPROG = [
  "Se adelanta por reprogramación",
  "Falta de repuesto o material",
  "Requiere compra o cotización",
  "Sin acceso al área",
  "Falta de personal o herramienta",
  "Condiciones climáticas",
  "Priorizada otra emergencia",
  "Solicitud del cliente",
  "Otro",
];

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
  pendiente_costeo: { label: "En presupuesto", color: COLORS.ambar },
  pendiente_aprobacion: { label: "Pendiente de aprobación", color: COLORS.orange },
  en_espera: { label: "En espera", color: "#3B6EA5" },
  aprobado: { label: "Aprobado", color: COLORS.verde },
  rechazado: { label: "Rechazado", color: COLORS.rojo },
};

const FRECUENCIAS = ["Mensual", "Trimestral", "Semestral", "Anual"];
const FRECUENCIA_DIAS = { Mensual: 30, Trimestral: 90, Semestral: 180, Anual: 365 };
const DURACION_UNIDADES = [["minutos", "min"], ["horas", "horas"], ["dias", "días"]];

/* --- Pasos del procedimiento ------------------------------------------------
   Un procedimiento ya no es un bloque de texto: es una lista de pasos, cada
   uno con un tipo que define cómo lo llena el técnico en campo.
--------------------------------------------------------------------------- */
const TIPOS_PASO = {
  texto:      { label: "Texto",      desc: "Instrucción o encabezado, sin dato que llenar", icon: "¶" },
  check:      { label: "Check list", desc: "Casilla que el técnico marca al ejecutar",      icon: "☐" },
  validacion: { label: "Validación", desc: "Respuesta Sí / No",                             icon: "?" },
  estado:     { label: "Estado",     desc: "Bueno / Alarma / Malo",                         icon: "◐" },
  numero:     { label: "Número",     desc: "Valor numérico con su unidad",                  icon: "#" },
};
const TIPOS_PASO_IDS = ["texto", "check", "validacion", "estado", "numero"];

const ESTADO_PASO = {
  bueno:  { label: "Bueno",  color: COLORS.verde },
  alarma: { label: "Alarma", color: COLORS.ambar },
  malo:   { label: "Malo",   color: COLORS.rojo },
};
const ESTADO_PASO_IDS = ["bueno", "alarma", "malo"];

const VALIDACION = { si: { label: "Sí", color: COLORS.verde }, no: { label: "No", color: COLORS.rojo } };

/* Valor inicial vacío según el tipo de paso */
const valorVacio = (tipo) => (tipo === "check" ? false : "");

/* Convierte un procedimiento antiguo (texto plano) en pasos de tipo texto,
   para que los planes ya creados no pierdan su contenido. */
function pasosDesdeTexto(txt) {
  if (!txt || !txt.trim()) return [];
  return txt.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((linea) => ({ id: uid("paso"), tipo: "texto", texto: linea, unidad: "" }));
}

/* Snapshot de los pasos del plan hacia la orden: la OT guarda su propia copia
   con los valores que va llenando el técnico, de modo que si el plan cambia
   después, el historial de lo ejecutado no se altera. */
const checklistDesdePasos = (pasos) =>
  (pasos || []).map((p) => ({ ...p, valor: valorVacio(p.tipo) }));

/* Cuántos pasos exigen dato y cuántos ya se llenaron */
function avanceChecklist(items) {
  const requieren = (items || []).filter((i) => i.tipo !== "texto");
  const hechos = requieren.filter((i) =>
    i.tipo === "check" ? i.valor === true : i.valor !== "" && i.valor !== null && i.valor !== undefined
  );
  const alertas = requieren.filter((i) =>
    (i.tipo === "estado" && (i.valor === "malo" || i.valor === "alarma")) ||
    (i.tipo === "validacion" && i.valor === "no")
  );
  return {
    total: requieren.length,
    hechos: hechos.length,
    pendientes: requieren.length - hechos.length,
    alertas,
    pct: requieren.length ? (hechos.length / requieren.length) * 100 : null,
  };
}

const SEMAFORO = {
  0: { label: "Sin historial", color: COLORS.slate, nivel: 0 },
  1: { label: "Al día", color: COLORS.verde, nivel: 1 },
  2: { label: "Por vencer", color: COLORS.ambar, nivel: 2 },
  3: { label: "Vencido", color: COLORS.rojo, nivel: 3 },
  4: { label: "Muy vencido", color: COLORS.vino, nivel: 4 },
};

const CATEGORIAS_BASE = [
  "HERRAJERIA", "CARPINTERIA", "CANALETAS", "PUERTAS PRINCIPALES DE INGRESO VEHICULAR",
  "EQUIPOS MENORES", "CERCA ELECTRICA", "SEGURIDAD FISICA", "SISTEMA CONTRA INCENDIOS",
  "ALARMAS", "SISTEMA HIDRAULICOS Y SANITARIOS", "BEBEDEROS", "CESPED SINTÉTICO",
  "CANCHAS DEPORTIVAS", "JUEGOS INFANTILES", "CUBIERTA", "FUMIGACION DE MATAMALEZAS",
  "SOPORTE DE TVS", "TVS", "UPS", "ALUMINIO Y VIDRIO", "PARQUEADEROS",
];

const SEDE_PALETTE = ["#ED5B23", "#2E7D5B", "#3B6EA5", "#8B5CF6", "#C1442D", "#D9A441", "#0891B2", "#BE185D"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
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
const fmtHora = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const mesKey = (fechaISO) => (fechaISO || "").slice(0, 7);          // 'YYYY-MM'
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
    { nombre: "Quitumbe", estudiantes: 820, constructor: "Constructora Andina S.A.", fases: ["Fase 1", "Fase 2"], activos: [["Aula 101", "Comedor", "Baños PB"], ["Canchas", "Laboratorio"]] },
    { nombre: "Calderón", estudiantes: 640, constructor: "Constructora Andina S.A.", fases: ["Fase 1", "Fase 2"], activos: [["Aula 201", "Comedor", "Baños PB"], ["Canchas", "Sala de Cómputo"]] },
    { nombre: "Pomasqui", estudiantes: 510, constructor: "Edifica Cía. Ltda.", fases: ["Fase 1"], activos: [["Aula 301", "Comedor", "Biblioteca", "Canchas"]] },
    { nombre: "Valle de los Chillos", estudiantes: 730, constructor: "Edifica Cía. Ltda.", fases: ["Fase 1", "Fase 2"], activos: [["Aula 401", "Comedor"], ["Auditorio", "Canchas", "Baños PB"]] },
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
      activos: (s.activos[fi] || []).map((a) => ({ id: uid("act"), nombre: a })),
    })),
  }));

  const usuarios = [
    { id: uid("usr"), nombre: "Luis Zambrano", rol: "admin", clave: "admin2026", sedeIds: [] },
    { id: uid("usr"), nombre: "Innova Schools (Dirección)", rol: "cliente", clave: "innova2026", sedeIds: [] },
    { id: uid("usr"), nombre: "Cristian Vargas", rol: "tecnico", clave: "campo2026", sedeIds: [sedes[0].id, sedes[1].id] },
    { id: uid("usr"), nombre: "Juan", rol: "tecnico", clave: "juan2026", sedeIds: [sedes[2].id, sedes[3].id] },
    { id: uid("usr"), nombre: "Patricia Mejía", rol: "solicitante", clave: "quitumbe26", sedeIds: [sedes[0].id] },
    { id: uid("usr"), nombre: "Andrea Castro", rol: "solicitante", clave: "calderon26", sedeIds: [sedes[1].id] },
  ];
  const admin = usuarios[0], cristian = usuarios[2], juan = usuarios[3];
  const patricia = usuarios[4], andrea = usuarios[5];

  const flat = flattenActivos(sedes);
  const hoy = new Date();
  const dias = (n) => fmtDate(new Date(Date.now() + n * 86400000));

  const planDefs = [
    { tarea: "Revisión de luminarias", cat: "EQUIPOS MENORES", frec: "Mensual", dur: [30, "minutos"],
      proc: "1. Verificar cada luminaria.\n2. Reemplazar focos quemados.\n3. Limpiar difusores.\n4. Registrar cambios." },
    { tarea: "Limpieza de canaletas", cat: "CANALETAS", frec: "Trimestral", dur: [45, "minutos"],
      proc: "1. Retirar hojas y sedimento.\n2. Verificar obstrucciones y fugas.\n3. Confirmar caída de agua libre." },
    { tarea: "Chequeo de grifería", cat: "SISTEMA HIDRAULICOS Y SANITARIOS", frec: "Mensual", dur: [20, "minutos"],
      proc: "1. Revisar llaves y sifones.\n2. Ajustar o cambiar empaques.\n3. Verificar presión y drenaje." },
    { tarea: "Revisión de extintores", cat: "SISTEMA CONTRA INCENDIOS", frec: "Trimestral", dur: [20, "minutos"],
      proc: "1. Verificar presión del manómetro.\n2. Revisar fecha de recarga.\n3. Confirmar señalización y acceso." },
    { tarea: "Inspección de cubierta", cat: "CUBIERTA", frec: "Semestral", dur: [2, "horas"],
      proc: "1. Revisar planchas y fijaciones.\n2. Buscar filtraciones u óxido.\n3. Registrar hallazgos con foto." },
    { tarea: "Mantenimiento de tablero eléctrico", cat: "EQUIPOS MENORES", frec: "Mensual", dur: [45, "minutos"],
      pasos: [
        ["texto", "Pasos para mantenimiento mensual en sistemas de MT"],
        ["check", "Desconectar breaker principal"],
        ["check", "Limpieza interna de gabinete y borneras"],
        ["check", "Reajuste de conexiones a torque nominal"],
        ["numero", "Voltaje Línea 1", "V"],
        ["numero", "Corriente Línea 1", "A"],
        ["numero", "Temperatura de barraje", "°C"],
        ["validacion", "Temperatura de conexiones dentro de rango"],
        ["validacion", "Señalización y rotulado legible"],
        ["estado", "Estado de caja térmica"],
        ["estado", "Estado general del tablero"],
      ] },
  ];

  const planes = planDefs.map((p, i) => {
    const aplic = [flat[i % flat.length], flat[(i + 4) % flat.length]].filter(Boolean).map((a, k) => ({
      sedeId: a.sedeId, faseId: a.faseId, activoId: a.activoId,
      fechaInicial: dias(-(60 + i * 12 + k * 5)),
    }));
    const pasos = p.pasos
      ? p.pasos.map(([tipo, texto, unidad]) => ({ id: uid("paso"), tipo, texto, unidad: unidad || "" }))
      : pasosDesdeTexto(p.proc);
    return {
      id: uid("plan"), tarea: p.tarea, procedimientoPasos: pasos, categoria: p.cat,
      frecuencia: p.frec, duracionValor: p.dur[0], duracionUnidad: p.dur[1],
      aplicaciones: aplic,
    };
  });

  // Órdenes preventivas: algunas completadas (dan historial + costo), una en curso
  const ordenes = [];
  const mkOT = (n, plan, ap, estado, fecha, tecnicoId, mats, matEstado) => ({
    id: uid("ot"),
    codigo: `OT-${String(n).padStart(4, "0")}`,
    planId: plan.id, tarea: plan.tarea, checklist: checklistDesdePasos(plan.procedimientoPasos),
    categoria: plan.categoria, frecuencia: plan.frecuencia,
    duracionValor: plan.duracionValor, duracionUnidad: plan.duracionUnidad,
    sedeId: ap.sedeId, faseId: ap.faseId, activoId: ap.activoId,
    tecnicoId, fechaProgramada: fecha,
    fechaCompletada: estado === "completada" ? fecha : "",
    estado, observaciones: "", foto: "",
    materiales: mats || [], materialesEstado: matEstado || "",
    consumos: [], createdAt: fecha,
  });

  const ot1 = mkOT(1, planes[0], planes[0].aplicaciones[0], "completada", dias(-25), cristian.id, [], "");
  ot1.consumos = [{ id: uid("con"), stockId: "", nombre: "Foco LED 18W", unidad: "u", cantidad: 4, costoUnitario: 4.5, fecha: dias(-25) }];
  ordenes.push(ot1);
  ordenes.push(mkOT(2, planes[1], planes[1].aplicaciones[0], "completada", dias(-18), cristian.id, [], ""));
  ordenes.push(mkOT(3, planes[2], planes[2].aplicaciones[0], "en_proceso", dias(0), cristian.id,
    [{ id: uid("mat"), nombre: "Empaque de grifería", cantidad: 6, unidad: "u", costoUnitario: 1.2 }], "pendiente_aprobacion"));
  ordenes.push(mkOT(4, planes[3], planes[3].aplicaciones[1], "programada", dias(4), juan.id, [], ""));

  // Solicitudes correctivas
  const solDefs = [
    { act: 0, sol: patricia.id, desc: "Foco quemado en el aula, afecta visibilidad en la tarde.", crit: "media", estado: "pendiente", d: -1 },
    { act: 1, sol: patricia.id, desc: "Grifo del comedor gotea constantemente.", crit: "alta", estado: "en_proceso", d: -4, prog: 0, tec: cristian.id,
      mats: [{ id: uid("mat"), nombre: "Llave de paso 1/2\"", cantidad: 1, unidad: "u", costoUnitario: 12 }], matEstado: "pendiente_aprobacion" },
    { act: 2, sol: patricia.id, desc: "Puerta de baño con bisagra suelta.", crit: "baja", estado: "completada", d: -12, cierre: 3, calif: 5, tec: cristian.id,
      mats: [{ id: uid("mat"), nombre: "Bisagra 3\"", cantidad: 2, unidad: "u", costoUnitario: 3.25 }], matEstado: "aprobado" },
    { act: 5, sol: andrea.id, desc: "Tomacorriente sin funcionar en sala de cómputo.", crit: "critico", estado: "pendiente", d: 0 },
    { act: 6, sol: andrea.id, desc: "Mancha de humedad en el techo.", crit: "media", estado: "programada", d: -6, prog: 0, tec: cristian.id },
    { act: 4, sol: patricia.id, desc: "Malla de la cancha con rotura.", crit: "", estado: "pendiente", d: -9 },
    { act: 3, sol: andrea.id, desc: "Cerradura del aula no cierra bien.", crit: "media", estado: "completada", d: -3, cierre: 3, prog: -1, tec: cristian.id,
      mats: [{ id: uid("mat"), nombre: "Cerradura pomo", cantidad: 1, unidad: "u", costoUnitario: 14 }], matEstado: "aprobado" },
  ];

  const solicitudes = solDefs.map((s, i) => {
    const a = flat[s.act % flat.length];
    const f = new Date(Date.now() + s.d * 86400000);
    return {
      id: uid("sol"),
      codigo: `SOL-${String(i + 1).padStart(4, "0")}`,
      sedeId: a.sedeId, faseId: a.faseId, activoId: a.activoId,
      descripcion: s.desc, criticidad: s.crit,
      solicitanteId: s.sol, fecha: fmtDate(f), hora: fmtHora(f),
      estado: s.estado,
      tecnicoId: s.tec || "", fechaProgramada: s.tec ? dias(s.prog ?? s.d) : "",
      fechaCompletada: s.estado === "completada" ? dias(s.d + (s.cierre ?? 2)) : "",
      horaCompletada: s.estado === "completada" ? (s.horaCierre || "15:30") : "",
      observaciones: "", foto: "", resolucion: s.estado === "completada" ? "Se ajustó y lubricó la bisagra." : "",
      materiales: s.mats || [], materialesEstado: s.matEstado || "",
      calificacion: s.calif || 0, comentarioCalif: "",
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
    ["Bisagra 3\"", "u", 12, 3.25, 4],
    ["Pintura látex blanco", "galón", 5, 22.0, 2],
  ];
  const stock = [];
  sedes.forEach((sd, si) => {
    stockBase.forEach((b, bi) => {
      stock.push({
        id: uid("stk"), sedeId: sd.id, nombre: b[0], unidad: b[1],
        cantidad: Math.max(0, b[2] - si * 3 - bi), costoUnitario: b[3], minimo: b[4],
      });
    });
  });

  // Servicios externos de especialidad (presupuesto digitado a mano)
  const servicios = [
    {
      id: uid("srv"), codigo: "SRV-0001",
      sedeId: flat[0].sedeId, faseId: flat[0].faseId, activoId: flat[0].activoId,
      trabajo: "Mantenimiento y recarga de aire acondicionado",
      detalle: "Revisión de compresor y presiones, recarga de gas refrigerante, cambio de filtros y limpieza de serpentines en las tres unidades del laboratorio.",
      tipoProveedor: "Climatización / HVAC",
      proveedor: "Clima Andino S.A.", presupuesto: 180, presupuestoAprobado: 180,
      fecha: dias(-8), estado: "programada", observaciones: "",
    },
    {
      id: uid("srv"), codigo: "SRV-0002",
      sedeId: flat[6].sedeId, faseId: flat[6].faseId, activoId: flat[6].activoId,
      trabajo: "Certificación anual contra incendios",
      detalle: "Prueba hidrostática de extintores, verificación de detectores y pulsadores, revisión de gabinetes y emisión del certificado ante el Cuerpo de Bomberos.",
      tipoProveedor: "Sistema contra incendios",
      proveedor: "Fire Tech Ecuador", presupuesto: 240, presupuestoAprobado: 240,
      fecha: dias(12), estado: "programada", observaciones: "",
    },
    {
      // Recién solicitado: sin proveedor todavía, esperando al cliente
      id: uid("srv"), codigo: "SRV-0003",
      sedeId: flat[3].sedeId, faseId: flat[3].faseId, activoId: flat[3].activoId,
      trabajo: "Reparación de bomba de agua potable",
      detalle: "Revisión de sello mecánico y rodamientos, cambio de empaques, alineación del acople y prueba de caudal a presión nominal. Incluye informe de estado del motor y recomendación de reemplazo si aplica.",
      tipoProveedor: "Obra civil / albañilería",
      proveedor: "", presupuesto: 320, presupuestoAprobado: null,
      fecha: "", estado: "por_aprobar", observaciones: "",
      createdAt: dias(-2),
    },
  ];

  return {
    sedes, usuarios, planes, ordenes, solicitudes, servicios, stock,
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
          sedeId: sede.id, sedeNombre: sede.nombre,
          faseId: fase.id, faseNombre: fase.nombre,
          activoId: act.id, activoNombre: act.nombre,
        })
      )
    )
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

const sedeNombre = (sedes, id) => (sedes || []).find((s) => s.id === id)?.nombre || "—";
const sedeColor = (sedes, id) => {
  const i = (sedes || []).findIndex((s) => s.id === id);
  return SEDE_PALETTE[i >= 0 ? i % SEDE_PALETTE.length : 0];
};

// --- Usuarios ---
const usuarioNombre = (usuarios, id) => (usuarios || []).find((u) => u.id === id)?.nombre || "Sin asignar";
const tecnicosDeSede = (usuarios, sedeId) =>
  (usuarios || []).filter((u) => u.rol === "tecnico" && (u.sedeIds || []).includes(sedeId));
// Sedes visibles según rol: admin y cliente ven todas
const sedesVisibles = (data, user) =>
  user.rol === "admin" || user.rol === "cliente"
    ? data.sedes
    : data.sedes.filter((s) => (user.sedeIds || []).includes(s.id));

// --- Costos: el costo SIEMPRE es la suma de materiales aprobados ---
function costoAprobado(item) {
  // Una vez liquidado (al completar la actividad), ese costo ya quedó
  // registrado en "consumos" — si se sigue sumando aquí también, se cuenta
  // dos veces la misma compra.
  if (!item || item.materialesEstado !== "aprobado" || item.materialesLiquidados) return 0;
  return (item.materiales || []).reduce((s, m) => s + (Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0), 0);
}
/* Consumo de stock: se carga al presupuesto de inmediato, sin aprobación,
   porque el material ya estaba comprado y en bodega. */
function costoConsumos(item) {
  return (item?.consumos || []).reduce((s, c) => s + (Number(c.cantidad) || 0) * (Number(c.costoUnitario) || 0), 0);
}

function costoEstimado(item) {
  return (item?.materiales || []).reduce((s, m) => s + (Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0), 0);
}
// Mes contable de una actividad: cuando se completó, si no cuando está programada
const mesContable = (item) => mesKey(item.fechaCompletada || item.fechaProgramada || item.fecha);

/* --- PRESUPUESTO: gastado = aprobado; comprometido = en costeo/aprobación/
   espera; proyección = extrapolación por avance del mes. Servicios aparte. --- */
const MAT_COMPROMETIDOS = ["pendiente_costeo", "pendiente_aprobacion", "en_espera"];

const presupuestoDeSede = (data, sedeId) => {
  const s = (data.sedes || []).find((x) => x.id === sedeId);
  return Number(s?.presupuestoPreventivo ?? PRESUPUESTO_MENSUAL_SEDE) || 0;
};

function actividadesDeSedeMes(data, sedeId, mes) {
  const todas = [...(data.ordenes || []), ...(data.solicitudes || [])];
  return todas.filter((a) => a.sedeId === sedeId && mesContable(a) === mes);
}

/* Un servicio pertenece al mes de su fecha programada; si aún no la tiene
   (está en aprobación), al de su creación. Los rechazados no cuentan. */
const mesServicio = (s) => mesKey(s.fecha || s.createdAt || "");
const serviciosDeSedeMes = (data, sedeId, mes) =>
  (data.servicios || []).filter((s) => s.sedeId === sedeId && s.estado !== "rechazada" && mesServicio(s) === mes);

function presupuestoSedeMes(data, sedeId, mes) {
  const acts = actividadesDeSedeMes(data, sedeId, mes);
  const gastado = acts.reduce((s, a) => s + costoAprobado(a) + costoConsumos(a), 0);
  const comprometido = acts
    .filter((a) => MAT_COMPROMETIDOS.includes(a.materialesEstado))
    .reduce((s, a) => s + costoEstimado(a), 0);

  const servicios = serviciosDeSedeMes(data, sedeId, mes);
  const costoServicios = servicios.reduce((s, x) => s + costoServicio(x), 0);

  const presupuesto = presupuestoDeSede(data, sedeId);
  const disponible = presupuesto - gastado - comprometido;
  const pct = presupuesto > 0 ? (gastado / presupuesto) * 100 : 0;
  const pctConComprometido = presupuesto > 0 ? ((gastado + comprometido) / presupuesto) * 100 : 0;

  // Proyección: solo tiene sentido para el mes en curso
  const hoy = new Date();
  const esMesActual = mes === mesKey(fmtDate(hoy));
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const avanceMes = esMesActual ? hoy.getDate() / diasMes : 1;
  const proyeccion = avanceMes > 0 ? gastado / avanceMes : gastado;

  let estado = "ok";
  if (gastado + comprometido > presupuesto) estado = "excedido";
  else if (pctConComprometido >= 80 || (esMesActual && proyeccion > presupuesto)) estado = "riesgo";

  return {
    sedeId, mes, presupuesto, gastado, comprometido, disponible,
    costoServicios, servicios: servicios.length,
    pct, pctConComprometido, proyeccion, esMesActual, avanceMes, estado,
    actividades: acts.length,
  };
}

function presupuestoGlobalMes(data, mes) {
  const porSede = (data.sedes || []).map((s) => ({ ...presupuestoSedeMes(data, s.id, mes), nombre: s.nombre }));
  const suma = (k) => porSede.reduce((acc, p) => acc + p[k], 0);
  const presupuesto = suma("presupuesto");
  const gastado = suma("gastado");
  const comprometido = suma("comprometido");
  return {
    mes, porSede, presupuesto, gastado, comprometido,
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
  const correctivos = (data.solicitudes || []).filter((s) => sedeIds.includes(s.sedeId) && enMes(s.fecha));

  // Días de exposición: si es el mes en curso, solo los días transcurridos
  const hoy = new Date();
  const [y, m] = mes.split("-").map(Number);
  const diasDelMes = new Date(y, m, 0).getDate();
  const esMesActual = mes === mesKey(fmtDate(hoy));
  const diasTranscurridos = esMesActual ? hoy.getDate() : diasDelMes;

  const nFallas = correctivos.length;
  const mtbf = nFallas > 0 ? diasTranscurridos / nFallas : null;

  // MTTR con precisión de horas: usa fecha+hora de apertura y de cierre
  const cerrados = correctivos.filter((s) => s.estado === "completada" && s.fechaCompletada && s.fecha);
  const mttr = cerrados.length > 0
    ? cerrados.reduce((acc, s) => acc + Math.max(0, horasEntre(s.fecha, s.hora, s.fechaCompletada, s.horaCompletada) / 24), 0) / cerrados.length
    : null;

  /* Costos del mes.
     Costo por estudiante = fee de servicio + materiales + servicios externos.
     El presupuesto mensual de $100/sede aplica SOLO a materiales. */
  let costoFee = 0, costoPreventivo = 0, costoCorrectivo = 0, costoServicios = 0;
  let estudiantes = 0;
  sedeIds.forEach((id) => {
    const sede = (data.sedes || []).find((s) => s.id === id);
    (data.ordenes || []).forEach((o) => {
      if (o.sedeId === id && mesContable(o) === mes) costoPreventivo += costoAprobado(o) + costoConsumos(o);
    });
    (data.solicitudes || []).forEach((x) => {
      if (x.sedeId === id && mesContable(x) === mes) costoCorrectivo += costoAprobado(x) + costoConsumos(x);
    });
    costoServicios += serviciosDeSedeMes(data, id, mes).reduce((a, x) => a + costoServicio(x), 0);
    costoFee += Number(sede?.feeServicio) || 0;
    estudiantes += Number(sede?.estudiantes) || 0;
  });

  const costoMateriales = costoPreventivo + costoCorrectivo;
  const costoTotal = costoFee + costoMateriales + costoServicios;
  const costoPorEstudiante = estudiantes > 0 ? costoTotal / estudiantes : null;

  return {
    mes, nFallas, diasTranscurridos, diasDelMes, mtbf, mttr, cerrados: cerrados.length,
    costoFee, costoPreventivo, costoCorrectivo, costoMateriales, costoServicios,
    costoTotal, estudiantes, costoPorEstudiante,
  };
}

/* Cumplimiento del plan preventivo: para cada aplicación de plan (un activo
   con un preventivo asignado), se mira si ya tiene una orden para el mes
   elegido y en qué estado quedó esa orden. Solo 3 categorías: Sin Programar
   (nada generado aún para este mes), En Ejecución (programada, en espera o
   en proceso) y Completadas. Lo de otros meses no cuenta. */
function avancePlan(data, sedeIds, mes) {
  let sinProgramar = 0, enEjecucion = 0, completadas = 0;

  (data.planes || []).forEach((plan) => {
    (plan.aplicaciones || []).forEach((ap) => {
      if (!sedeIds.includes(ap.sedeId)) return;
      const rel = (data.ordenes || []).filter(
        (o) => o.planId === plan.id && o.sedeId === ap.sedeId && o.faseId === ap.faseId && o.activoId === ap.activoId
          && mesKey(o.fechaProgramada) === mes
      );
      if (rel.some((o) => o.estado === "completada")) { completadas++; return; }
      if (rel.some((o) => ["programada", "en_proceso", "espera"].includes(o.estado))) { enEjecucion++; return; }
      sinProgramar++;
    });
  });

  const total = sinProgramar + enEjecucion + completadas;
  return {
    total, sinProgramar, enEjecucion, completadas,
    cumplimiento: total > 0 ? (completadas / total) * 100 : null,
    datos: [
      { name: "Completadas", value: completadas, color: COLORS.verde },
      { name: "En Ejecución", value: enEjecucion, color: COLORS.orange },
      { name: "Sin Programar", value: sinProgramar, color: COLORS.rojo },
    ].filter((d) => d.value > 0),
  };
}

/* Satisfacción: promedio de las estrellas dadas por los solicitantes en las
   solicitudes ya cerradas de las sedes indicadas. */
function satisfaccion(data, sedeIds) {
  const calificadas = (data.solicitudes || []).filter(
    (s) => sedeIds.includes(s.sedeId) && s.estado === "completada" && Number(s.calificacion) > 0
  );
  const cerradas = (data.solicitudes || []).filter(
    (s) => sedeIds.includes(s.sedeId) && s.estado === "completada"
  ).length;

  const total = calificadas.length;
  const promedio = total > 0 ? calificadas.reduce((a, s) => a + Number(s.calificacion), 0) / total : null;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, cant: calificadas.filter((s) => s.calificacion === n).length }));
  return { promedio, total, cerradas, sinCalificar: cerradas - total, dist, comentarios: calificadas.filter((s) => s.comentarioCalif) };
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
      costo: kpi.costoPorEstudiante !== null ? Number(kpi.costoPorEstudiante.toFixed(3)) : 0,
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
  const transcurridos = Math.floor((new Date() - new Date(`${base}T00:00:00`)) / 86400000);
  const ratio = transcurridos / ciclo;
  if (ratio < 0.7) return SEMAFORO[1];
  if (ratio < 1.0) return SEMAFORO[2];
  if (ratio < 1.5) return SEMAFORO[3];
  return SEMAFORO[4];
}
const semaforoCorrectivo = (item) =>
  item.criticidad
    ? { label: CRITICIDAD[item.criticidad].label, color: CRITICIDAD[item.criticidad].color, nivel: CRITICIDAD[item.criticidad].nivel }
    : SEMAFORO[0];
const semaforoServicio = (item) => {
  if (!item.fecha) return SEMAFORO[0];
  const dias = Math.floor((new Date(`${item.fecha}T00:00:00`) - new Date()) / 86400000);
  if (dias < 0) return { label: "Atrasado", color: COLORS.rojo, nivel: 4 };
  if (dias <= 7) return { label: "Esta semana", color: COLORS.ambar, nivel: 3 };
  return { label: "Programado", color: COLORS.verde, nivel: 1 };
};

const semaforoDe = (item) =>
  item.tipo === "preventivo" ? semaforoPreventivo(item)
    : item.tipo === "servicio" ? semaforoServicio(item)
    : semaforoCorrectivo(item);
const ordenarPorUrgencia = (items) => [...items].sort((a, b) => semaforoDe(b).nivel - semaforoDe(a).nivel);

/* --- Pendientes: preventivo sin OT abierta (reaparece tras completarse) +
   correctivo en estado 'pendiente' --------------------------------------- */
function getPendientes(data) {
  const items = [];

  (data.planes || []).forEach((plan) => {
    (plan.aplicaciones || []).forEach((ap) => {
      const rel = (data.ordenes || []).filter(
        (o) => o.planId === plan.id && o.sedeId === ap.sedeId && o.faseId === ap.faseId && o.activoId === ap.activoId
      );
      if (rel.some((o) => ESTADOS_ABIERTOS.includes(o.estado))) return;
      const ultima = rel
        .filter((o) => o.estado === "completada")
        .sort((a, b) => (a.fechaCompletada < b.fechaCompletada ? 1 : -1))[0];

      items.push({
        key: `${plan.id}|${ap.sedeId}|${ap.faseId}|${ap.activoId}`,
        tipo: "preventivo",
        planId: plan.id, tarea: plan.tarea, procedimientoPasos: plan.procedimientoPasos,
        categoria: plan.categoria, frecuencia: plan.frecuencia,
        duracionValor: plan.duracionValor, duracionUnidad: plan.duracionUnidad,
        sedeId: ap.sedeId, faseId: ap.faseId, activoId: ap.activoId,
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
      servicioId: sv.id, codigo: sv.codigo,
      tarea: sv.trabajo, proveedor: sv.proveedor,
      presupuesto: sv.presupuesto, fecha: sv.fecha, estadoServicio: sv.estado,
      sedeId: sv.sedeId, faseId: sv.faseId, activoId: sv.activoId,
    });
  });

  (data.solicitudes || []).forEach((s) => {
    if (s.estado !== "pendiente") return;
    items.push({
      key: `sol|${s.id}`,
      tipo: "correctivo",
      solicitudId: s.id, codigo: s.codigo,
      tarea: s.descripcion, criticidad: s.criticidad,
      solicitanteId: s.solicitanteId, fecha: s.fecha, hora: s.hora,
      // La foto y el detalle viajan al pendiente: el técnico necesita verlos
      // antes de activar, para saber qué llevar y cuánto tiempo estimar
      fotoSolicitante: s.fotoSolicitante || "", descripcion: s.descripcion,
      sedeId: s.sedeId, faseId: s.faseId, activoId: s.activoId,
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
    (a, b) => (rank[a.estado] ?? 9) - (rank[b.estado] ?? 9) || (a.fechaProgramada || "").localeCompare(b.fechaProgramada || "")
  );
}

// Todas las actividades con materiales en algún punto del flujo de costos
function itemsConMateriales(data, estadosFiltro) {
  const pre = (data.ordenes || []).map((o) => ({ ...o, tipo: "preventivo" }));
  const cor = (data.solicitudes || []).map((s) => ({ ...s, tipo: "correctivo", tarea: s.descripcion }));
  return [...pre, ...cor].filter((i) => estadosFiltro.includes(i.materialesEstado));
}

/* ============================================================================
   5. PERSISTENCIA
   ========================================================================= */

/* Registro único compartido: todos leen/escriben la misma base y se relee
   cada SYNC_MS para propagar cambios. Último en escribir gana. */
const SYNC_MS = 4000;
/* Tras guardar, se ignoran las lecturas remotas durante este lapso: da tiempo
   a que el almacenamiento refleje el cambio antes de volver a confiar en él. */
const GRACIA_SYNC_MS = 5000;

/* Repara datos guardados por versiones anteriores para que la app nunca
   arranque con un esquema incompleto (roles viejos, colecciones faltantes). */
const ROLES_LEGADO = { supervisor_cliente: "cliente", supervisor: "admin", general: "admin" };

function normalizeData(raw) {
  const base = seedData();
  if (!raw || typeof raw !== "object") return base;
  const d = { ...raw };

  d.sedes = Array.isArray(d.sedes) ? d.sedes : base.sedes;
  d.sedes = d.sedes.map((s) => ({
    ...s,
    fases: (s.fases || []).map((f) => ({ ...f, activos: f.activos || [] })),
    estudiantes: Number(s.estudiantes) || 0,
    presupuestoPreventivo: Number(s.presupuestoPreventivo) || PRESUPUESTO_MENSUAL_SEDE,
    feeServicio: Number(s.feeServicio) || 0,
    constructor: s.constructor || "",
  }));

  d.usuarios = (Array.isArray(d.usuarios) ? d.usuarios : base.usuarios).map((u) => {
    const rol = ROLES_LEGADO[u.rol] || u.rol;
    return { ...u, rol: ROLES[rol] ? rol : "solicitante", sedeIds: u.sedeIds || [] };
  });
  if (!d.usuarios.some((u) => u.rol === "admin")) d.usuarios = [...base.usuarios.filter((u) => u.rol === "admin"), ...d.usuarios];

  const arr = (v) => (Array.isArray(v) ? v : []);
  d.planes = arr(d.planes).map((p) => ({
    ...p,
    aplicaciones: arr(p.aplicaciones),
    // Migración: los planes viejos guardaban el procedimiento como texto plano
    procedimientoPasos: arr(p.procedimientoPasos).length
      ? arr(p.procedimientoPasos).map((x) => ({ ...x, tipo: TIPOS_PASO[x.tipo] ? x.tipo : "texto", unidad: x.unidad || "" }))
      : pasosDesdeTexto(p.procedimiento),
  }));
  d.ordenes = arr(d.ordenes).map((o) => {
    const plan = d.planes.find((p) => p.id === o.planId);
    return {
      ...o,
      materiales: arr(o.materiales), materialesEstado: o.materialesEstado || "", consumos: arr(o.consumos),
      duracionValor: o.duracionValor ?? plan?.duracionValor ?? 0,
      duracionUnidad: o.duracionUnidad || plan?.duracionUnidad || "minutos",
      // Si la orden es anterior a los pasos estructurados, toma los del plan
      checklist: arr(o.checklist).length
        ? arr(o.checklist)
        : checklistDesdePasos(plan?.procedimientoPasos || pasosDesdeTexto(o.procedimiento)),
      reprogramaciones: arr(o.reprogramaciones),
      log: arr(o.log),
    };
  });
  d.solicitudes = arr(d.solicitudes).map((x) => ({
    ...x, materiales: arr(x.materiales), materialesEstado: x.materialesEstado || "",
    calificacion: Number(x.calificacion) || 0,
    horaCompletada: x.horaCompletada || "",
    fotoSolicitante: x.fotoSolicitante || "",
    consumos: arr(x.consumos),
    reprogramaciones: arr(x.reprogramaciones),
    log: arr(x.log),
  }));
  d.servicios = arr(d.servicios).map((x) => ({
    ...x,
    detalle: x.detalle || "",
    tipoProveedor: x.tipoProveedor || "",
    proveedor: x.proveedor || "",
    presupuesto: Number(x.presupuesto) || 0,
    // Valor con el que el cliente aprobó; si no hay, se asume el solicitado
    presupuestoAprobado: x.presupuestoAprobado === undefined || x.presupuestoAprobado === ""
      ? null : Number(x.presupuestoAprobado),
    foto: x.foto || "",
    observaciones: x.observaciones || "",
    resolucion: x.resolucion || "",
    motivoRechazo: x.motivoRechazo || "",
    reprogramaciones: arr(x.reprogramaciones),
    log: arr(x.log),
    estado: x.estado || "por_aprobar",
  }));
  d.stock = arr(d.stock).map((x) => ({
    ...x, cantidad: Number(x.cantidad) || 0,
    costoUnitario: Number(x.costoUnitario) || 0, minimo: Number(x.minimo) || 0,
  }));
  d.categorias = arr(d.categorias).length ? d.categorias : CATEGORIAS_BASE;
  // Resúmenes de gestión generados a demanda, uno por mes (clave "YYYY-MM")
  d.resumenesMes = (raw.resumenesMes && typeof raw.resumenesMes === "object") ? raw.resumenesMes : {};

  d.otCounter = Number(d.otCounter) || d.ordenes.length + 1;
  d.solCounter = Number(d.solCounter) || d.solicitudes.length + 1;
  d.srvCounter = Number(d.srvCounter) || d.servicios.length + 1;
  return d;
}

function isEmptyState(raw) {
  if (!raw || typeof raw !== "object") return true;
  const sedes = raw.sedes;
  const usuarios = raw.usuarios;
  return (
    !(Array.isArray(sedes) && sedes.length) &&
    !(Array.isArray(usuarios) && usuarios.length)
  );
}

/* Compara dos listas por id y devuelve solo lo que cambió: qué insertar o
   actualizar (upsert) y qué ids ya no están (para borrarlos explícitamente).
   Es la base de la escritura selectiva: nunca se manda a la base algo que
   ya está igual a como se guardó la última vez. */
function diffPorId(anterior, actual) {
  const antMap = new Map((anterior || []).map((x) => [x.id, x]));
  const actMap = new Map((actual || []).map((x) => [x.id, x]));
  const upsert = [];
  for (const [id, item] of actMap) {
    const prev = antMap.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) upsert.push(item);
  }
  const del = [];
  for (const id of antMap.keys()) {
    if (!actMap.has(id)) del.push(id);
  }
  return { upsert, delete: del };
}

function useSystemData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const dataRef = useRef(null);
  const servidorRef = useRef(null); // último estado confirmado como guardado en la base — base para el diff
  const snapshotRef = useRef(null); // JSON que este cliente considera vigente
  const escribiendoRef = useRef(false); // evita que el polling pise una escritura
  const flushTimerRef = useRef(null);
  const flushWaitersRef = useRef([]);
  const writeChainRef = useRef(Promise.resolve());
  const ultimoEscritoRef = useRef(0);

  const applyLocal = (next) => {
    const normalized = normalizeData(next);
    dataRef.current = normalized;
    snapshotRef.current = JSON.stringify(normalized);
    setData(normalized);
    return normalized;
  };

  /* Arma el payload de escritura selectiva: las colecciones chicas van
     completas (barato, siempre acotado), y ordenes/solicitudes/servicios
     van como upsert/delete comparando contra lo último confirmado en la
     base (servidorRef) — nunca el historial completo. */
  const construirPayloadDiff = (toSave) => {
    const base = servidorRef.current || {};
    const dOrd = diffPorId(base.ordenes, toSave.ordenes);
    const dSol = diffPorId(base.solicitudes, toSave.solicitudes);
    const dSrv = diffPorId(base.servicios, toSave.servicios);
    const payload = {
      ...toSave,
      ordenesUpsert: dOrd.upsert, ordenesDelete: dOrd.delete,
      solicitudesUpsert: dSol.upsert, solicitudesDelete: dSol.delete,
      serviciosUpsert: dSrv.upsert, serviciosDelete: dSrv.delete,
    };
    delete payload.ordenes;
    delete payload.solicitudes;
    delete payload.servicios;
    return payload;
  };

  const flushToDb = useCallback(async () => {
    const toSave = dataRef.current;
    if (!toSave) return false;
    escribiendoRef.current = true;
    try {
      const saved = normalizeData(await saveAppStateV2(construirPayloadDiff(toSave)));
      servidorRef.current = saved;
      // Si hubo más edits durante el POST, no pisar el estado local más nuevo
      if (snapshotRef.current === JSON.stringify(toSave)) {
        dataRef.current = saved;
        snapshotRef.current = JSON.stringify(saved);
        setData(saved);
      } else {
        // Reenviar el estado más reciente (el diff ahora es contra "saved")
        const toSave2 = dataRef.current;
        const again = normalizeData(await saveAppStateV2(construirPayloadDiff(toSave2)));
        servidorRef.current = again;
        dataRef.current = again;
        snapshotRef.current = JSON.stringify(again);
        setData(again);
      }
      ultimoEscritoRef.current = Date.now();
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
        const cargado = populated ? await loadAppState() : await saveAppState(normalizeData(seedData()));
        const normalizado = applyLocal(cargado);
        servidorRef.current = normalizado;
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
      if (Date.now() - (ultimoEscritoRef.current || 0) < GRACIA_SYNC_MS) return;
      try {
        const remote = normalizeData(await loadAppState());
        if (isEmptyState(remote)) return;
        servidorRef.current = remote;
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
      ultimoEscritoRef.current = Date.now();

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
function useAcciones(data, persist, usuario) {
  return useMemo(() => ({
    // Quién ejecuta la acción, para firmar los registros de la bitácora
    usuario,
    updateOrden: (id, patch) =>
      persist((data) => ({ ...data, ordenes: data.ordenes.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
    updateSolicitud: (id, patch) =>
      persist((data) => ({ ...data, solicitudes: data.solicitudes.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    /* Alta de un material nuevo en el catálogo de la sede, con existencia cero.
       Devuelve el artículo para que quien lo pidió lo use de inmediato. */
    altaArticulo: (sedeId, nombre, unidad, costo = 0) => {
      const existente = (data.stock || []).find(
        (x) => x.sedeId === sedeId && x.nombre.trim().toLowerCase() === nombre.trim().toLowerCase()
      );
      if (existente) return existente;
      const art = { id: uid("stk"), sedeId, nombre, unidad, cantidad: 0, costoUnitario: Number(costo) || 0, minimo: 0 };
      persist((data) => ({ ...data, stock: [...(data.stock || []), art] }));
      return art;
    },
    // Consumir stock: descuenta bodega y registra el consumo en la actividad
    consumirStock: (item, art, cantidad) => {
      const consumo = {
        id: uid("con"), stockId: art.id, nombre: art.nombre, unidad: art.unidad,
        cantidad, costoUnitario: art.costoUnitario, fecha: fmtDate(new Date()),
      };
      const stock = data.stock.map((x) => (x.id === art.id ? { ...x, cantidad: Math.max(0, x.cantidad - cantidad) } : x));
      const conConsumo = (a) => ({ ...a, consumos: [...(a.consumos || []), consumo] });
      persist(item.tipo === "preventivo"
        ? { ...data, stock, ordenes: data.ordenes.map((o) => (o.id === item.id ? conConsumo(o) : o)) }
        : { ...data, stock, solicitudes: data.solicitudes.map((x) => (x.id === item.id ? conConsumo(x) : x)) });
    },
    // Devolver a bodega lo cargado por error
    devolverStock: (item, consumo) => {
      const stock = data.stock.map((x) => (x.id === consumo.stockId ? { ...x, cantidad: x.cantidad + consumo.cantidad } : x));
      const sinConsumo = (a) => ({ ...a, consumos: (a.consumos || []).filter((c) => c.id !== consumo.id) });
      persist(item.tipo === "preventivo"
        ? { ...data, stock, ordenes: data.ordenes.map((o) => (o.id === item.id ? sinConsumo(o) : o)) }
        : { ...data, stock, solicitudes: data.solicitudes.map((x) => (x.id === item.id ? sinConsumo(x) : x)) });
    },
    /* Al cerrar una actividad con materiales ya aprobados, se descuenta bodega
       (el material nuevo también quedó de alta ahí desde que se agregó, con
       stockId propio) y se deja el registro en el histórico de consumo.
       materialesLiquidados evita que un segundo guardado vuelva a descontar. */
    liquidarMateriales: (item) => {
      const materiales = item.materiales || [];
      if (item.materialesLiquidados || item.materialesEstado !== "aprobado" || materiales.length === 0) return;
      persist((data) => {
        let stock = data.stock;
        const nuevosConsumos = materiales.map((m) => {
          if (m.stockId) {
            stock = stock.map((x) =>
              x.id === m.stockId ? { ...x, cantidad: Math.max(0, x.cantidad - (Number(m.cantidad) || 0)) } : x
            );
          }
          return {
            id: uid("con"), materialId: m.id, stockId: m.stockId || null,
            nombre: m.nombre, unidad: m.unidad, cantidad: m.cantidad,
            costoUnitario: m.costoUnitario, fecha: fmtDate(new Date()),
          };
        });
        const conLiquidacion = (a) => ({
          ...a,
          consumos: [...(a.consumos || []), ...nuevosConsumos],
          materialesLiquidados: true,
        });
        return item.tipo === "preventivo"
          ? { ...data, stock, ordenes: data.ordenes.map((o) => (o.id === item.id ? conLiquidacion(o) : o)) }
          : { ...data, stock, solicitudes: data.solicitudes.map((x) => (x.id === item.id ? conLiquidacion(x) : x)) };
      });
    },
    /* Eliminar una actividad por completo. Pensado para depurar durante las
       pruebas: en operación normal las órdenes se cierran, no se borran. */
    eliminarActividad: (item) => {
      if (item.tipo === "preventivo") return persist((d) => ({ ...d, ordenes: d.ordenes.filter((o) => o.id !== item.id) }));
      if (item.tipo === "servicio") return persist((d) => ({ ...d, servicios: d.servicios.filter((x) => x.id !== item.id) }));
      return persist((d) => ({ ...d, solicitudes: d.solicitudes.filter((x) => x.id !== item.id) }));
    },
    updateActividad: (item, patch, opciones = {}) => {
      /* Al entrar en "en presupuesto" o "pendiente de aprobación" (incluye
         un rechazo, que se queda en espera hasta corregirse), el estado real
         pasa a "espera" automáticamente, guardando el estado anterior para
         restaurarlo — pero SOLO cuando se aprueba. Un rechazo no libera la
         actividad: sigue en espera hasta que se corrija y se vuelva a
         aprobar. Si ya estaba en espera (ej. yendo de costeo a aprobación,
         o corrigiendo tras un rechazo), no se pisa el estado ya guardado. */
      let conEspera = patch;
      if (patch.materialesEstado !== undefined) {
        const entraEnEspera = ["pendiente_costeo", "pendiente_aprobacion", "en_espera", "rechazado"].includes(patch.materialesEstado);
        const seLibera = patch.materialesEstado === "aprobado";
        if (entraEnEspera && item.estado !== "espera") {
          conEspera = { ...patch, estado: "espera", estadoPrevioEspera: item.estado };
        } else if (seLibera && item.estado === "espera") {
          conEspera = { ...patch, estado: item.estadoPrevioEspera || "programada", estadoPrevioEspera: "" };
        }
      }

      /* Cada guardado deja rastro: se comparan los campos seguidos y se anexan
         al log de la actividad. Queda oculto en la tarjeta y se consulta desde
         el historial, para no ensuciar la vista de trabajo. */
      // Las correcciones administrativas no se registran: son ajustes de
      // captura durante las pruebas, no movimientos reales de la orden
      const movimientos = opciones.sinRegistro ? [] : diffCambios(item, conEspera, data.usuarios);
      const sello = `${fmtDate(new Date())} · ${fmtHora(new Date())}`;
      const nuevoLog = movimientos.length
        ? [...(item.log || []), ...movimientos.map((m) => ({
            id: uid("log"), titulo: m.campo, detalle: `${m.antes} → ${m.despues}`,
            usuarioId: usuario?.id || "", sello,
          }))]
        : null;
      const conLog = nuevoLog ? { ...conEspera, log: nuevoLog } : conEspera;

      if (item.tipo === "preventivo") {
        return persist((data) => ({ ...data, ordenes: data.ordenes.map((o) => (o.id === item.id ? { ...o, ...conLog } : o)) }));
      }
      if (item.tipo === "servicio") {
        // El servicio guarda su fecha en "fecha"; la agenda la expone como fechaProgramada
        const p = { ...conLog };
        if (p.fechaProgramada !== undefined) { p.fecha = p.fechaProgramada; delete p.fechaProgramada; }
        return persist((data) => ({ ...data, servicios: data.servicios.map((x) => (x.id === item.id ? { ...x, ...p } : x)) }));
      }
      return persist((data) => ({ ...data, solicitudes: data.solicitudes.map((s) => (s.id === item.id ? { ...s, ...conLog } : s)) }));
    },
  }), [data, persist, usuario]);
}

/* ============================================================================
   6. COMPONENTES UI COMPARTIDOS
   ========================================================================= */

function Chip({ children, color = COLORS.charcoal, solid, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${className}`}
      style={solid ? { background: color, color: "white" } : { background: `${color}18`, color }}
    >
      {children}
    </span>
  );
}

function EstadoChip({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.pendiente;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: `${e.color}1A`, color: e.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.color }} />
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
  return <Chip solid color={m.color}>{m.label}</Chip>;
}

function Semaforo({ item, showLabel }) {
  const s = semaforoDe(item);
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" title={s.label}>
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
      {showLabel && <span className="text-[10px] font-semibold" style={{ color: s.color }}>{s.label}</span>}
    </span>
  );
}

/* Calificación de 1 a 5 estrellas. En modo lectura solo muestra el resultado. */
const CALIF_TEXTO = { 1: "Muy insatisfecho", 2: "Insatisfecho", 3: "Aceptable", 4: "Satisfecho", 5: "Muy satisfecho" };

function Estrellas({ valor = 0, onChange, size = 20, readOnly }) {
  const [hover, setHover] = useState(0);
  const activo = hover || valor;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} disabled={readOnly}
          onClick={() => onChange && onChange(n === valor ? 0 : n)}
          onMouseEnter={() => !readOnly && setHover(n)}
          className={readOnly ? "cursor-default" : "cursor-pointer"}
          title={readOnly ? undefined : CALIF_TEXTO[n]} aria-label={`${n} estrella${n > 1 ? "s" : ""}`}>
          <Star size={size}
            color={n <= activo ? COLORS.ambar : COLORS.line}
            fill={n <= activo ? COLORS.ambar : "none"} />
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
    <div className="mt-2 rounded-md p-2.5" style={{ background: calificada ? `${COLORS.verde}0D` : `${COLORS.ambar}12` }}>
      <p className="text-[11px] font-semibold mb-1.5" style={cChar}>
        {calificada ? "Tu calificación" : "¿Cómo fue la atención?"}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Estrellas valor={solicitud.calificacion} onChange={(n) => { onCalificar({ calificacion: n }); if (n > 0) setAbierto(true); }} />
        {solicitud.calificacion > 0 && (
          <span className="text-[11px] font-semibold" style={{ color: COLORS.ambar }}>{CALIF_TEXTO[solicitud.calificacion]}</span>
        )}
      </div>

      {calificada && !abierto && !solicitud.comentarioCalif && (
        <button onClick={() => setAbierto(true)} className="text-[10px] font-semibold mt-1.5" style={cOrange}>
          + Agregar un comentario
        </button>
      )}

      {calificada && (abierto || solicitud.comentarioCalif) && (
        <div className="mt-2">
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2}
            placeholder="Comentario opcional sobre el trabajo realizado"
            className="w-full border rounded-md px-2 py-1.5 text-xs outline-none resize-none" style={inputStyle} />
          {comentario !== (solicitud.comentarioCalif || "") && (
            <button onClick={() => { onCalificar({ comentarioCalif: comentario.trim() }); setAbierto(false); }}
              className="mt-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md text-white" style={{ background: COLORS.charcoal }}>
              Guardar comentario
            </button>
          )}
        </div>
      )}

      {!calificada && <p className="text-[10px] mt-1" style={cSlate}>Toca una estrella para calificar.</p>}
    </div>
  );
}

/* La altura máxima va en estilo en línea, no como clase: los valores
   arbitrarios de Tailwind no existen en la hoja base de este entorno y sin
   ellos el modal crecía más allá de la pantalla, impidiendo subir el scroll. */
/* Campo de texto que conserva lo que la persona escribe y solo confirma el
   cambio al salir del campo o tras una breve pausa. Sin esto, cada tecla
   guardaba el documento completo y la relectura podía devolver una versión
   intermedia, borrando lo tecleado. */
function CampoVivo({ value, onCommit, delay = 700, as = "input", ...props }) {
  const [local, setLocal] = useState(value ?? "");
  const editando = useRef(false);
  const timer = useRef(null);

  // Solo aceptar valores de afuera si la persona no está escribiendo aquí
  useEffect(() => {
    if (!editando.current) setLocal(value ?? "");
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const cambiar = (v) => {
    setLocal(v);
    editando.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { editando.current = false; onCommit(v); }, delay);
  };

  const confirmar = () => {
    clearTimeout(timer.current);
    if (!editando.current) return;
    editando.current = false;
    onCommit(local);
  };

  const Tag = as;
  return <Tag {...props} value={local} onChange={(e) => cambiar(e.target.value)} onBlur={confirmar} />;
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      style={{ overflowY: "auto" }} onClick={onClose}>
      <div
        className={`bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full ${wide ? "sm:max-w-lg" : "sm:max-w-sm"}`}
        style={{ maxHeight: "88vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10" style={bLine}>
          <h3 className="font-semibold text-sm" style={cChar}>{title}</h3>
          <button onClick={onClose}><X size={18} color={COLORS.slate} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-xs font-semibold" style={cSlate}>{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[10px] mt-1" style={cSlate}>{hint}</p>}
    </div>
  );
}

const inputCls = "w-full border rounded-md px-3 py-2 text-sm outline-none";
const inputStyle = { borderColor: COLORS.line };

function ReadOnly({ children }) {
  return <p className="text-sm rounded-md px-3 py-2" style={{ background: COLORS.cream, color: COLORS.charcoal }}>{children}</p>;
}

function Stat({ label, value, icon, color, sub }) {
  return (
    <div className="rounded-md p-3 border" style={cardStyle}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>{icon}</div>
        <p className="text-xs font-semibold leading-tight" style={cSlate}>{label}</p>
      </div>
      <p className="text-2xl font-bold mt-2 leading-none" style={{ color: COLORS.charcoal, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={cSlate}>{sub}</p>}
    </div>
  );
}

/* Medidor semicircular: muestra un KPI en días contra un máximo de referencia.
   El arco relleno es proporcional al valor; el número va en el centro. */
function GaugeDonut({ valor, max, color, titulo, unidad = "d", detalle, invertido }) {
  const v = valor === null || valor === undefined ? 0 : Math.max(0, Math.min(valor, max));
  const datos = [{ v }, { v: Math.max(0.0001, max - v) }];
  const hayDato = valor !== null && valor !== undefined;

  return (
    <div className="border rounded-md p-3" style={cardStyle}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={cSlate}>{titulo}</p>
      <div className="relative" style={{ height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={datos} dataKey="v" startAngle={180} endAngle={0}
              innerRadius="62%" outerRadius="95%" cy="88%" stroke="none" isAnimationActive={false}>
              <Cell fill={hayDato ? color : COLORS.line} />
              <Cell fill={COLORS.line} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ bottom: 4 }}>
                    <span className="text-2xl font-bold leading-none" style={{ color: hayDato ? COLORS.charcoal : COLORS.slate, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {hayDato ? `${valor > max ? "+" : ""}${valor.toFixed(1)}` : "—"}
          </span>
          <span className="text-[10px]" style={cSlate}>{hayDato ? unidad : "sin datos"}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-[9px] -mt-1" style={cSlate}>
        <span>0</span><span>{max} {unidad} máx.</span>
      </div>
      {detalle && <p className="text-[10px] mt-1 text-center" style={cSlate}>{detalle}</p>}
      {invertido && <p className="text-[9px] text-center" style={cSlate}>menor es mejor</p>}
    </div>
  );
}

function SectionTitle({ children, count, action }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-6 first:mt-0 gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide" style={cSlate}>{children}</p>
      <div className="flex items-center gap-2 shrink-0">
        {count !== undefined && <Chip color={COLORS.orange}>{count}</Chip>}
        {action}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-sm py-2" style={cSlate}>{children}</p>;
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
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, []);
  if (!ultimaSync) return null;
  const seg = Math.floor((Date.now() - ultimaSync.getTime()) / 1000);
  const vivo = seg < 15;
  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] shrink-0" style={cSlate}
      title="Los datos son compartidos entre todos los usuarios y se releen cada pocos segundos">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: vivo ? COLORS.verde : COLORS.ambar }} />
      {seg < 5 ? "Sincronizado" : `hace ${seg}s`}
    </span>
  );
}

function AppHeader({ user, onLogout, sedesTexto, ultimaSync }) {
  const rol = rolDe(user);
  return (
    <div className="flex items-center gap-3 pt-4">
      <img src={logoISE} alt="IndustriaMe" className="h-12 w-auto object-contain shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-sm leading-tight truncate" style={cChar}>{user.nombre}</p>
        <p className="text-[11px] truncate" style={cSlate}>
          {rol.label}{sedesTexto ? ` · ${sedesTexto}` : ""}
        </p>
      </div>
      <img src={logoCliente} alt="Innova Schools" className="hidden sm:block h-9 w-auto object-contain shrink-0" />
      <SyncBadge ultimaSync={ultimaSync} />
      <button onClick={onLogout} className="w-8 h-8 rounded-md border flex items-center justify-center shrink-0" style={bLine} title="Cerrar sesión">
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
    onChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => shift(-1)} className="w-7 h-7 rounded-md border flex items-center justify-center" style={bLine}>
        <ChevronLeft size={14} color={COLORS.charcoal} />
      </button>
      <p className="text-sm font-bold capitalize text-center" style={{ color: COLORS.charcoal, minWidth: 120 }}>{mesLabel(mes)}</p>
      <button onClick={() => shift(1)} className="w-7 h-7 rounded-md border flex items-center justify-center" style={bLine}>
        <ChevronRight size={14} color={COLORS.charcoal} />
      </button>
    </div>
  );
}

/* Adjuntar foto, con reducción automática antes de subirla.

   Las fotos nuevas se comprimen en el navegador y se suben a Supabase
   Storage; en el documento JSON (el que se carga y guarda entero en cada
   operación) solo queda la URL pública del archivo, no la imagen. Las fotos
   antiguas guardadas en base64 (antes de este cambio) se siguen mostrando
   igual, ya que un data-URL también es un <img src> válido. */
const FOTO_LADO_MAX = 1280;   // píxeles del lado más largo
const FOTO_CALIDAD = 0.72;    // 0 a 1; por encima de 0.8 el peso sube mucho

function comprimirImagen(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida"));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > FOTO_LADO_MAX || h > FOTO_LADO_MAX) {
          const escala = FOTO_LADO_MAX / Math.max(w, h);
          w = Math.round(w * escala);
          h = Math.round(h * escala);
        }
        const lienzo = document.createElement("canvas");
        lienzo.width = w;
        lienzo.height = h;
        lienzo.getContext("2d").drawImage(img, 0, 0, w, h);
        lienzo.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen"))),
          "image/jpeg",
          FOTO_CALIDAD,
        );
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(file);
  });
}

/* Visor de imagen ampliada: se abre encima de cualquier cosa (incluso de un
   Modal, por eso el z-index alto). Clic en cualquier lado, o la X, cierra. */
function ImagenAmpliada({ src, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[70]" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
        <X size={18} color="white" />
      </button>
      <img src={src} alt="" className="max-w-full max-h-full rounded-md object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function FotoUploader({ foto, onChange, readOnly, label = "Foto", carpeta = "general" }) {
  const inputRef = useRef(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ampliada, setAmpliada] = useState(false);

  if (readOnly && !foto) return null;

  // Solo las fotos viejas (formato anterior) pesan como base64; las nuevas
  // son una URL corta y no tiene sentido mostrarles un peso en KB.
  const esBase64 = typeof foto === "string" && foto.startsWith("data:");
  const pesoKB = esBase64 ? Math.round((foto.length * 0.75) / 1024) : 0;

  return (
    <Field label={label}>
      {foto ? (
        <div className="relative inline-block">
          <img src={foto} alt="Evidencia" onClick={() => setAmpliada(true)}
            className="rounded-md max-h-40 border cursor-zoom-in" style={bLine} />
          {!readOnly && (
            <button onClick={() => onChange("")} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border flex items-center justify-center" style={bLine}>
              <X size={11} color={COLORS.rojo} />
            </button>
          )}
          {pesoKB > 0 && <p className="text-[9px] mt-1" style={cSlate}>{pesoKB} KB</p>}
          {ampliada && <ImagenAmpliada src={foto} onClose={() => setAmpliada(false)} />}
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={cargando}
          className="text-xs font-semibold px-3 py-2 rounded-md border flex items-center gap-1.5 disabled:opacity-50"
          style={{ borderColor: COLORS.line, color: COLORS.charcoal }}>
          <Camera size={13} /> {cargando ? "Subiendo…" : "Adjuntar foto"}
        </button>
      )}

      {error && <p className="text-[10px] mt-1" style={{ color: COLORS.rojo }}>{error}</p>}

      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";                 // permite volver a elegir el mismo archivo
          if (!file) return;
          setError("");
          setCargando(true);
          try {
            const blob = await comprimirImagen(file);
            const ruta = `${carpeta}/${uid("foto")}.jpg`;
            onChange(await uploadFile(ruta, blob));
          } catch (err) {
            console.error("[foto]", err);
            setError("No se pudo subir la imagen. Intenta con otra o revisa tu conexión.");
          } finally {
            setCargando(false);
          }
        }} />
    </Field>
  );
}

/* Materiales según rol: técnico lista · admin costea · cliente decide.
   Solo para materiales NUEVOS (que no existen en bodega) — esos sí necesitan
   que alguien les ponga precio y los apruebe. Lo que ya existe en bodega se
   registra por "Consumo de bodega", que descuenta al momento y nunca pasa
   por aprobación. */
function MaterialesPanel({ item, rol, onUpdate, puedeEnviar = true, onAltaArticulo }) {
  const [agregando, setAgregando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaUnidad, setNuevaUnidad] = useState("u");
  const materiales = item.materiales || [];
  const estado = item.materialesEstado || "";
  const puedeListar = (rol === "tecnico" || rol === "admin") && (estado === "" || estado === "borrador");
  /* El admin costea mientras el cliente no haya decidido. Antes solo podía
     hacerlo en "pendiente_costeo", así que un precio mal digitado quedaba
     congelado en cuanto se enviaba a aprobación y no había forma de corregirlo. */
  const puedeCostear = rol === "admin" && (estado === "pendiente_costeo" || estado === "pendiente_aprobacion" || estado === "en_espera");
  const yaEnviado = rol === "admin" && (estado === "pendiente_aprobacion" || estado === "en_espera");
  const puedeAprobar = (rol === "cliente" || rol === "admin") && (estado === "pendiente_aprobacion" || estado === "en_espera");
  const total = costoEstimado(item);
  const info = MAT_ESTADO[estado];

  if (materiales.length === 0 && !puedeListar) return null;

  const set = (id, patch) => onUpdate({ materiales: materiales.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={cSlate}>Recursos / materiales</p>
        {info && <Chip color={info.color}>{info.label}</Chip>}
      </div>

      <div className="space-y-1.5">
        {materiales.map((m) => (
          <div key={m.id} className="border rounded-md p-2" style={bLine}>
            {puedeListar ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs min-w-0" style={cChar}>
                  {m.nombre}
                  {m.enBodega > 0
                    ? <span style={cSlate}> · {m.enBodega} {m.unidad} en bodega</span>
                    : <span style={cSlate}> · sin stock</span>}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CampoVivo type="number" min="0" value={m.cantidad} onCommit={(v) => set(m.id, { cantidad: v })}
                    className="w-16 border rounded px-2 py-1 text-xs text-right outline-none" style={inputStyle} />
                  <span className="text-[10px] w-10" style={cSlate}>{m.unidad}</span>
                  <button onClick={() => onUpdate({ materiales: materiales.filter((x) => x.id !== m.id) })} className="shrink-0 px-1">
                    <Trash2 size={13} color={COLORS.slate} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="min-w-0 truncate" style={cChar}>
                  {m.nombre || "—"}{puedeCostear ? "" : ` · ${m.cantidad} ${m.unidad}`}
                </span>
                {puedeCostear ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <CampoVivo type="number" min="0" value={m.cantidad} onCommit={(v) => set(m.id, { cantidad: v })}
                      title="Cantidad"
                      className="w-14 border rounded px-1.5 py-1 text-xs text-right outline-none" style={{ borderColor: COLORS.orange }} />
                    <CampoVivo value={m.unidad} onCommit={(v) => set(m.id, { unidad: v })} placeholder="Unid."
                      title="La unidad puede cambiar según el proveedor"
                      className="w-14 border rounded px-1.5 py-1 text-xs outline-none" style={{ borderColor: COLORS.orange }} />
                    <span className="text-[10px]" style={cSlate}>$/u</span>
                    <CampoVivo type="number" min="0" step="0.01" value={m.costoUnitario} onCommit={(v) => set(m.id, { costoUnitario: v })}
                      className="w-16 border rounded px-1.5 py-1 text-xs outline-none" style={{ borderColor: COLORS.orange }} />
                  </div>
                ) : Number(m.costoUnitario) > 0 ? (
                  <span className="font-semibold shrink-0" style={cOrange}>
                    {money((Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0))}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))}
        {materiales.length === 0 && puedeListar && <Empty>Sin materiales agregados.</Empty>}
      </div>

      {puedeListar && (
        agregando ? (
          <div className="border rounded-md p-2 mt-2" style={{ borderColor: COLORS.orange }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={cSlate}>Material nuevo (compra)</p>
            <div className="flex gap-1.5">
              <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Nombre del material"
                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              <input value={nuevaUnidad} onChange={(e) => setNuevaUnidad(e.target.value)}
                placeholder="u" title="Unidad"
                className="w-14 border rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              <button disabled={!nuevoNombre.trim()}
                onClick={() => {
                  const art = onAltaArticulo
                    ? onAltaArticulo(nuevoNombre.trim(), nuevaUnidad.trim() || "u")
                    : { id: uid("stk"), nombre: nuevoNombre.trim(), unidad: nuevaUnidad.trim() || "u", cantidad: 0, costoUnitario: 0 };
                  onUpdate({
                    materiales: [...materiales, {
                      id: uid("mat"), stockId: art.id, nombre: art.nombre, unidad: art.unidad,
                      cantidad: 1, costoUnitario: 0, enBodega: 0,
                    }],
                    materialesEstado: "borrador",
                  });
                  setNuevoNombre(""); setNuevaUnidad("u"); setAgregando(false);
                }}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md text-white shrink-0 disabled:opacity-40"
                style={{ background: COLORS.orange }}>
                Crear
              </button>
            </div>
            <p className="text-[10px] mt-1.5" style={cSlate}>
              Si ya existe en bodega, regístralo en "Consumo de bodega" — ahí no necesita presupuesto ni aprobación.
              Usa esto solo para lo que hay que comprar nuevo.
            </p>
            <button onClick={() => setAgregando(false)} className="text-[11px] font-semibold mt-2" style={cSlate}>Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setAgregando(true)}
            className="flex items-center gap-1 text-[11px] font-semibold mt-1.5" style={cOrange}>
            <Plus size={11} /> Agregar material nuevo
          </button>
        )
      )}

      {puedeListar && materiales.length > 0 && (
        puedeEnviar ? (
          <button onClick={() => onUpdate({ materialesEstado: "pendiente_costeo" })}
            className="w-full mt-2 text-xs font-semibold py-2 rounded-md text-white" style={{ background: COLORS.charcoal }}>
            Enviar a presupuesto
          </button>
        ) : (
          <p className="text-[10px] mt-2" style={cSlate}>
            Activa la actividad (programada o en proceso) para enviar los materiales a presupuesto.
          </p>
        )
      )}

      {(estado === "pendiente_aprobacion" || estado === "en_espera" || estado === "aprobado" || estado === "rechazado" || puedeCostear) && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t" style={bLine}>
          <span className="text-xs font-bold" style={cChar}>Total</span>
          <span className="text-sm font-bold" style={cOrange}>{money(total)}</span>
        </div>
      )}

      {puedeCostear && !yaEnviado && (
        <button onClick={() => onUpdate({ materialesEstado: "pendiente_aprobacion" })}
          className="w-full mt-2 text-xs font-semibold py-2 rounded-md text-white" style={{ background: COLORS.orange }}>
          Enviar a aprobación del cliente
        </button>
      )}

      {yaEnviado && (
        <div className="mt-2 rounded-md p-2.5" style={{ background: `${COLORS.ambar}12` }}>
          <p className="text-[11px]" style={cChar}>
            Ya está con el cliente. Puedes corregir cantidades y precios aquí mismo;
            el cambio se refleja de inmediato en lo que él ve.
          </p>
          <button onClick={() => onUpdate({ materialesEstado: "pendiente_costeo" })}
            className="w-full mt-2 text-xs font-semibold py-2 rounded-md border"
            style={{ borderColor: COLORS.ambar, color: COLORS.ambar, background: "white" }}>
            Retirar de aprobación y volver a presupuesto
          </button>
        </div>
      )}

      {rol === "admin" && (estado === "aprobado" || estado === "rechazado") && (
        <button onClick={() => onUpdate({ materialesEstado: "pendiente_costeo" })}
          className="w-full mt-2 text-[11px] font-semibold py-2 rounded-md border"
          style={{ borderColor: COLORS.line, color: COLORS.slate, background: "white" }}
          title="Reabre el costeo si hay que corregir un valor ya decidido">
          Reabrir para corregir
        </button>
      )}

      {puedeAprobar && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <button onClick={() => onUpdate({ materialesEstado: "aprobado" })} className="text-xs font-semibold py-2 rounded-md text-white" style={{ background: COLORS.verde }}>Aprobar</button>
          <button onClick={() => onUpdate({ materialesEstado: "en_espera" })}
            className="text-xs font-semibold py-2 rounded-md text-white disabled:opacity-40"
            disabled={estado === "en_espera"}
            title="Queda en tu bandeja de pendientes para decidir más tarde"
            style={{ background: MAT_ESTADO.en_espera.color }}>En espera</button>
          <button onClick={() => onUpdate({ materialesEstado: "rechazado" })} className="text-xs font-semibold py-2 rounded-md text-white" style={{ background: COLORS.rojo }}>Rechazar</button>
        </div>
      )}
    </div>
  );
}

/* Satisfacción del servicio: promedio de estrellas y su distribución. */
function TarjetaSatisfaccion({ sat }) {
  const color = sat.promedio === null ? COLORS.slate
    : sat.promedio >= 4.5 ? COLORS.verde : sat.promedio >= 3.5 ? COLORS.ambar : COLORS.rojo;
  const max = Math.max(1, ...sat.dist.map((d) => d.cant));

  return (
    <div className="border rounded-md p-3" style={cardStyle}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={cSlate}>Satisfacción del servicio</p>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl font-bold leading-none" style={{ color, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {sat.promedio === null ? "—" : sat.promedio.toFixed(1)}
        </span>
        <div className="min-w-0">
          <Estrellas valor={Math.round(sat.promedio || 0)} size={14} readOnly />
          <p className="text-[10px] mt-0.5" style={cSlate}>
            {sat.total > 0 ? `${sat.total} de ${sat.cerradas} solicitudes calificadas` : "Aún sin calificaciones"}
          </p>
        </div>
      </div>

      {sat.total > 0 ? (
        <div className="space-y-1">
          {sat.dist.map((d) => (
            <div key={d.n} className="flex items-center gap-2">
              <span className="text-[10px] w-6 shrink-0 flex items-center gap-0.5" style={cSlate}>
                {d.n}<Star size={9} color={COLORS.ambar} fill={COLORS.ambar} />
              </span>
              <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: COLORS.line }}>
                <div style={{ width: `${(d.cant / max) * 100}%`, background: COLORS.ambar, height: "100%" }} />
              </div>
              <span className="text-[10px] w-4 text-right shrink-0" style={cSlate}>{d.cant}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px]" style={cSlate}>
          Las calificaciones aparecen cuando los solicitantes valoran una solicitud cerrada.
        </p>
      )}

      {sat.sinCalificar > 0 && sat.total > 0 && (
        <p className="text-[10px] mt-2 pt-2 border-t" style={{ ...cSlate, borderColor: COLORS.line }}>
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
      onClick={(e) => { e.stopPropagation(); ver(item); }}
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
      <p className="text-[9px] font-semibold uppercase tracking-wide" style={cSlate}>{label}</p>
      <p className="text-xs break-words" style={cChar}>{children}</p>
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
  const costo = esServ ? costoServicio(item) : costoMat + costoCon;
  const matInfo = MAT_ESTADO[item.materialesEstado];

  return (
    <div className="space-y-3">
      {/* Cabecera */}
      <div className="rounded-md p-3" style={{ background: COLORS.cream, borderLeft: `3px solid ${tipoMeta(item.tipo).color}` }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TipoChip tipo={item.tipo} />
            {item.codigo
              ? <span className="text-sm font-bold" style={cChar}>{item.codigo}</span>
              : <span className="text-xs font-semibold" style={cSlate}>Aún sin orden generada</span>}
            {item.criticidad && <Chip color={CRITICIDAD[item.criticidad].color}>{CRITICIDAD[item.criticidad].label}</Chip>}
          </div>
          {sinActivar
            ? <Chip color={sem.color}>{sem.label}</Chip>
            : <EstadoChip estado={item.estado} />}
        </div>
        <p className="text-sm font-semibold mt-2" style={cChar}>{item.tarea || item.descripcion}</p>
        <p className="text-xs mt-0.5" style={cSlate}>{ubicacionTexto(data.sedes, item)}</p>
      </div>

      {/* Datos generales */}
      <div className="grid grid-cols-2 gap-2.5">
        <Dato label={esServ ? "Proveedor" : "Responsable"}>
          {esServ ? (item.proveedor || "Sin proveedor")
            : sinActivar ? "Por asignar"
            : usuarioNombre(data.usuarios, item.tecnicoId)}
        </Dato>
        <Dato label="Programada">
          {sinActivar ? "Pendiente de programar" : (item.fechaProgramada || "—")}
        </Dato>
        {sinActivar && esPrev && (
          <Dato label="Último mantenimiento">{item.ultimoMantenimiento || "Sin registro previo"}</Dato>
        )}
        {sinActivar && esPrev && item.fechaInicial && (
          <Dato label="Inspección inicial">{item.fechaInicial}</Dato>
        )}
        {item.solicitanteId && (
          <Dato label="Solicitó">{`${usuarioNombre(data.usuarios, item.solicitanteId)} · ${item.fecha || ""} ${item.hora || ""}`}</Dato>
        )}
        {esPrev && item.frecuencia && <Dato label="Frecuencia">{item.frecuencia}</Dato>}
        {item.categoria && <Dato label="Categoría">{item.categoria}</Dato>}
        <Dato label={t.real ? "Tiempo real" : "Tiempo estimado"}>{t.txt}</Dato>
        {item.fechaCompletada && (
          <Dato label="Cierre">{`${item.fechaCompletada}${item.horaCompletada ? ` · ${item.horaCompletada}` : ""}`}</Dato>
        )}
        {costo > 0 && <Dato label="Costo">{money(costo)}</Dato>}
      </div>

      {/* Procedimiento */}
      {item.detalle && (
        <Field label="Detalle del trabajo">
          <p className="text-xs whitespace-pre-wrap rounded-md p-2.5" style={{ background: COLORS.paper, color: COLORS.charcoal }}>
            {item.detalle}
          </p>
        </Field>
      )}

      {(item.checklist || item.procedimientoPasos || []).length > 0 && (
        <ChecklistEjecucion items={item.checklist || item.procedimientoPasos} readOnly compacto />
      )}

      {item.observaciones && <Field label="Observaciones del técnico"><ReadOnly>{item.observaciones}</ReadOnly></Field>}
      {item.resolucion && <Field label="Resolución"><ReadOnly>{item.resolucion}</ReadOnly></Field>}

      {/* Consumo de bodega */}
      {(item.consumos || []).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={cSlate}>Consumo de bodega</p>
            <Chip color={COLORS.orange}>{money(costoCon)}</Chip>
          </div>
          <div className="space-y-1">
            {item.consumos.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5" style={bLine}>
                <span style={cChar}>{c.nombre} · {c.cantidad} {c.unidad}</span>
                <span className="font-semibold" style={cOrange}>{money(c.cantidad * c.costoUnitario)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materiales comprados */}
      {(item.materiales || []).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={cSlate}>Materiales</p>
            {matInfo && <Chip color={matInfo.color}>{matInfo.label}</Chip>}
          </div>
          <div className="space-y-1">
            {item.materiales.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5" style={bLine}>
                <span style={cChar}>{m.nombre} · {m.cantidad} {m.unidad}</span>
                <span className="font-semibold" style={cOrange}>{money(m.cantidad * m.costoUnitario)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calificación del solicitante */}
      {item.calificacion > 0 && (
        <div className="rounded-md p-2.5" style={{ background: `${COLORS.ambar}12` }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>Calificación del solicitante</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Estrellas valor={item.calificacion} size={14} readOnly />
            <span className="text-[11px] font-semibold" style={{ color: COLORS.ambar }}>{CALIF_TEXTO[item.calificacion]}</span>
          </div>
          {item.comentarioCalif && <p className="text-xs mt-1.5" style={cChar}>“{item.comentarioCalif}”</p>}
        </div>
      )}

      {sinActivar && (
        <p className="text-[11px] rounded-md p-2.5" style={{ background: COLORS.cream, color: COLORS.slate }}>
          {esPrev
            ? "Tarea del plan preventivo todavía sin activar. Al activarla se genera su orden de trabajo con código propio."
            : "Solicitud sin programar. Al activarla se le asigna técnico y fecha."}
        </p>
      )}

      {item.fotoSolicitante && (
        <Field label="Foto del solicitante">
          <img src={item.fotoSolicitante} alt="Reportado por el solicitante" className="rounded-md max-h-56 border w-full object-contain" style={bLine} />
        </Field>
      )}

      {item.foto && (
        <Field label="Evidencia del técnico">
          <img src={item.foto} alt="Evidencia del técnico" className="rounded-md max-h-56 border w-full object-contain" style={bLine} />
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
          <DetalleActividad item={item} data={data} onClose={() => setItem(null)} />
        </Modal>
      )}
    </DetalleCtx.Provider>
  );
}

/* ============================================================================
   PROCEDIMIENTO POR PASOS
   El plan define los pasos; la orden guarda una copia con los valores que el
   técnico llena en campo. Dos componentes: editor (plan) y ejecución (OT).
   ========================================================================= */

/* --- Editor de pasos, dentro del formulario del plan --- */
function EditorProcedimiento({ pasos, onChange }) {
  const set = (id, patch) => onChange(pasos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const agregar = (tipo) => onChange([...pasos, { id: uid("paso"), tipo, texto: "", unidad: "" }]);
  const quitar = (id) => onChange(pasos.filter((p) => p.id !== id));
  const mover = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= pasos.length) return;
    const c = [...pasos];
    [c[i], c[j]] = [c[j], c[i]];
    onChange(c);
  };

  return (
    <div>
      <div className="space-y-1.5">
        {pasos.map((p, i) => {
          const meta = TIPOS_PASO[p.tipo] || TIPOS_PASO.texto;
          return (
            <div key={p.id} className="border rounded-md p-2" style={{ borderColor: COLORS.line, background: p.tipo === "texto" ? COLORS.paper : "white" }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[9px] font-bold w-4 text-center shrink-0" style={cSlate}>{i + 1}</span>
                <select value={p.tipo}
                  onChange={(e) => set(p.id, { tipo: e.target.value, unidad: e.target.value === "numero" ? p.unidad : "" })}
                  className="border rounded px-1.5 py-1 text-[11px] shrink-0" style={bLine}>
                  {TIPOS_PASO_IDS.map((t) => <option key={t} value={t}>{TIPOS_PASO[t].icon} {TIPOS_PASO[t].label}</option>)}
                </select>
                {p.tipo === "numero" && (
                  <input value={p.unidad} onChange={(e) => set(p.id, { unidad: e.target.value })}
                    placeholder="Unidad" title="Unidad de medida (V, A, °C, psi…)"
                    className="w-16 border rounded px-1.5 py-1 text-[11px] outline-none shrink-0" style={bLine} />
                )}
                <span className="flex-1" />
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="disabled:opacity-25 px-0.5" title="Subir">
                  <ChevronUp size={13} color={COLORS.slate} />
                </button>
                <button onClick={() => mover(i, 1)} disabled={i === pasos.length - 1} className="disabled:opacity-25 px-0.5" title="Bajar">
                  <ChevronDown size={13} color={COLORS.slate} />
                </button>
                <button onClick={() => quitar(p.id)} className="px-0.5" title="Eliminar paso">
                  <Trash2 size={13} color={COLORS.slate} />
                </button>
              </div>
              <input value={p.texto} onChange={(e) => set(p.id, { texto: e.target.value })}
                placeholder={
                  p.tipo === "texto" ? "Instrucción o encabezado…" :
                  p.tipo === "check" ? "Acción a marcar. Ej. Desconectar breaker principal" :
                  p.tipo === "numero" ? "Qué se mide. Ej. Voltaje Línea 1" :
                  p.tipo === "validacion" ? "Qué se valida. Ej. Temperatura dentro de rango" :
                  "Qué se evalúa. Ej. Estado de caja térmica"
                }
                className="w-full border rounded px-2 py-1.5 text-xs outline-none" style={bLine} />
              <p className="text-[9px] mt-1" style={cSlate}>{meta.desc}</p>
            </div>
          );
        })}
        {pasos.length === 0 && <Empty>Sin pasos todavía. Agrega el primero abajo.</Empty>}
      </div>

      <div className="flex gap-1.5 mt-2 flex-wrap">
        {TIPOS_PASO_IDS.map((t) => (
          <button key={t} onClick={() => agregar(t)}
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-md border"
            style={{ borderColor: COLORS.line, color: COLORS.charcoal }} title={TIPOS_PASO[t].desc}>
            <Plus size={11} /> {TIPOS_PASO[t].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --- Vista previa / ejecución del checklist ---
   readOnly = true muestra los resultados sin permitir cambios (detalle,
   histórico, plan). Sin readOnly, el técnico llena los valores en campo. */
function ChecklistEjecucion({ items, onChange, readOnly, compacto }) {
  const set = (id, valor) => onChange((items || []).map((x) => (x.id === id ? { ...x, valor } : x)));
  const av = avanceChecklist(items);

  if (!items || items.length === 0) return null;

  return (
    <div>
      {/* El encabezado va siempre; el contador solo si hay pasos que llenar */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={cSlate}>Procedimiento</p>
        {av.total > 0 && (
          <div className="flex items-center gap-1.5">
            {av.alertas.length > 0 && <Chip color={COLORS.rojo}>{av.alertas.length} en alerta</Chip>}
            <Chip color={av.pendientes === 0 ? COLORS.verde : COLORS.slate}>{av.hechos}/{av.total}</Chip>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {items.map((p, i) => {
          if (p.tipo === "texto") {
            return (
              <p key={p.id} className="text-xs font-semibold pt-1" style={cChar}>{p.texto}</p>
            );
          }

          const sinLlenar = p.tipo === "check" ? p.valor !== true : (p.valor === "" || p.valor == null);

          return (
            <div key={p.id} className="border rounded-md px-2.5 py-2"
              style={{ borderColor: sinLlenar && !readOnly ? COLORS.line : `${COLORS.verde}55`, background: "white" }}>

              {p.tipo === "check" && (
                <button disabled={readOnly} onClick={() => set(p.id, !p.valor)}
                  className="flex items-center gap-2 w-full text-left disabled:cursor-default">
                  <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                    style={{ borderColor: p.valor ? COLORS.verde : COLORS.line, background: p.valor ? COLORS.verde : "white" }}>
                    {p.valor && <CheckCircle2 size={11} color="white" />}
                  </span>
                  <span className="text-xs" style={{ ...cChar, textDecoration: p.valor ? "line-through" : "none", opacity: p.valor ? 0.65 : 1 }}>
                    {p.texto}
                  </span>
                </button>
              )}

              {p.tipo === "numero" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs min-w-0" style={cChar}>
                    {p.texto}{p.unidad ? <span style={cSlate}> ({p.unidad})</span> : null}
                  </span>
                  {readOnly ? (
                    <span className="text-xs font-bold shrink-0" style={p.valor === "" ? cSlate : cOrange}>
                      {p.valor === "" || p.valor == null ? "sin dato" : `${p.valor}${p.unidad ? " " + p.unidad : ""}`}
                    </span>
                  ) : (
                    <CampoVivo type="number" step="any" value={p.valor} onCommit={(v) => set(p.id, v)}
                      placeholder="—" className="w-20 border rounded px-2 py-1 text-xs text-right outline-none shrink-0"
                      style={{ borderColor: p.valor === "" ? COLORS.line : COLORS.orange }} />
                  )}
                </div>
              )}

              {p.tipo === "validacion" && (
                <div className={`flex items-center justify-between gap-2 ${compacto ? "" : "flex-wrap"}`}>
                  <span className="text-xs min-w-0" style={cChar}>{p.texto}</span>
                  <div className="flex gap-1 shrink-0">
                    {["si", "no"].map((v) => (
                      <button key={v} disabled={readOnly} onClick={() => set(p.id, p.valor === v ? "" : v)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded border disabled:cursor-default"
                        style={{
                          borderColor: p.valor === v ? VALIDACION[v].color : COLORS.line,
                          background: p.valor === v ? `${VALIDACION[v].color}18` : "white",
                          color: p.valor === v ? VALIDACION[v].color : COLORS.slate,
                          opacity: readOnly && p.valor !== v ? 0.35 : 1,
                        }}>
                        {VALIDACION[v].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {p.tipo === "estado" && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs min-w-0" style={cChar}>{p.texto}</span>
                  <div className="flex gap-1 shrink-0">
                    {ESTADO_PASO_IDS.map((v) => (
                      <button key={v} disabled={readOnly} onClick={() => set(p.id, p.valor === v ? "" : v)}
                        className="text-[11px] font-semibold px-2 py-1 rounded border disabled:cursor-default"
                        style={{
                          borderColor: p.valor === v ? ESTADO_PASO[v].color : COLORS.line,
                          background: p.valor === v ? `${ESTADO_PASO[v].color}18` : "white",
                          color: p.valor === v ? ESTADO_PASO[v].color : COLORS.slate,
                          opacity: readOnly && p.valor !== v ? 0.35 : 1,
                        }}>
                        {ESTADO_PASO[v].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && av.pendientes > 0 && (
        <p className="text-[10px] mt-1.5" style={cSlate}>
          Quedan {av.pendientes} paso{av.pendientes === 1 ? "" : "s"} por registrar.
        </p>
      )}
    </div>
  );
}

/* ============================================================================
   REPROGRAMACIÓN CON BITÁCORA
   Mover una actividad de fecha nunca sobrescribe el dato anterior: cada
   cambio queda registrado con motivo, autor y sello de tiempo, de modo que
   la orden cuenta su propia historia (por qué se atrasó y quién lo decidió).
   ========================================================================= */

function FormReprogramar({ item, data, usuario, onConfirm, onClose }) {
  const [fecha, setFecha] = useState(item.fechaProgramada || fmtDate(new Date()));
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [dejarEnEspera, setDejarEnEspera] = useState(item.estado === "en_proceso");

  const cambiaFecha = fecha !== item.fechaProgramada;
  // Mover la actividad hacia atrás es adelantarla: se sugiere ese motivo
  const seAdelanta = cambiaFecha && item.fechaProgramada && fecha < item.fechaProgramada;
  const motivoFinal = motivo || (seAdelanta ? MOTIVOS_REPROG[0] : MOTIVOS_REPROG[1]);

  useEffect(() => {
    if (seAdelanta) { setMotivo(MOTIVOS_REPROG[0]); setDejarEnEspera(false); }
    else if (motivo === MOTIVOS_REPROG[0]) setMotivo("");
  }, [seAdelanta]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="rounded-md p-3" style={{ background: COLORS.cream }}>
        <div className="flex items-center gap-1.5 mb-1">
          <TipoChip tipo={item.tipo} />
          <span className="text-[10px] font-bold" style={cChar}>{item.codigo}</span>
          <EstadoChip estado={item.estado} />
        </div>
        <p className="text-sm font-semibold" style={cChar}>{item.tarea}</p>
        <p className="text-xs" style={cSlate}>{ubicacionTexto(data.sedes, item)}</p>
        <p className="text-xs mt-1.5" style={cSlate}>
          Fecha actual: <span className="font-semibold" style={cChar}>{item.fechaProgramada || "sin programar"}</span>
        </p>
      </div>

      <Field label="Nueva fecha programada">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
          className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle} />
      </Field>

      <Field label="Motivo del cambio" hint="Queda en la bitácora de la orden.">
        <select value={motivoFinal} onChange={(e) => setMotivo(e.target.value)}
          className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
          {MOTIVOS_REPROG.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>

      {seAdelanta && (
        <p className="text-[11px] rounded-md p-2.5" style={{ background: `${COLORS.verde}12`, color: COLORS.charcoal }}>
          La nueva fecha es anterior a la actual: la actividad se <b>adelanta</b>.
        </p>
      )}

      <Field label="Detalle" hint="Qué repuesto falta, con quién se gestiona, etc.">
        <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2}
          placeholder="Ej. Falta magnetrón del microondas, se pidió cotización a proveedor."
          className={`${inputCls} resize-none`} style={inputStyle} />
      </Field>

      {!seAdelanta && (
      <button onClick={() => setDejarEnEspera(!dejarEnEspera)}
        className="w-full flex items-start gap-2 text-left border rounded-md p-2.5"
        style={{ borderColor: dejarEnEspera ? "#3B6EA5" : COLORS.line, background: dejarEnEspera ? "#3B6EA512" : "white" }}>
        <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5"
          style={{ borderColor: dejarEnEspera ? "#3B6EA5" : COLORS.line, background: dejarEnEspera ? "#3B6EA5" : "white" }}>
          {dejarEnEspera && <CheckCircle2 size={11} color="white" />}
        </span>
        <span>
          <span className="text-xs font-semibold block" style={cChar}>Marcar como “En espera”</span>
          <span className="text-[10px]" style={cSlate}>
            El trabajo está detenido por una causa externa. Deja de contar como tiempo de ejecución activo
            y se distingue de lo que sí se está atendiendo.
          </span>
        </span>
      </button>
      )}

      <button disabled={!cambiaFecha && !dejarEnEspera}
        onClick={() => {
          onConfirm({
            fechaProgramada: fecha,
            estado: dejarEnEspera ? "espera" : item.estado,
            registro: {
              id: uid("rep"),
              fechaAnterior: item.fechaProgramada || "",
              fechaNueva: fecha,
              estadoAnterior: item.estado,
              estadoNuevo: dejarEnEspera ? "espera" : item.estado,
              motivo: motivoFinal, detalle: detalle.trim(),
              usuarioId: usuario?.id || "",
              sello: `${fmtDate(new Date())} · ${fmtHora(new Date())}`,
            },
          });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
        style={{ background: COLORS.orange }}>
        Reprogramar y registrar
      </button>
      {!cambiaFecha && !dejarEnEspera && (
        <p className="text-[10px] text-center" style={cSlate}>Cambia la fecha o márcala en espera para registrar el movimiento.</p>
      )}
    </div>
  );
}

/* Sección plegable por estado. Cada etapa se abre y cierra por separado para
   que la pestaña no crezca sin control cuando hay muchas actividades. */
function SeccionPlegable({ titulo, count, color, nota, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const c = color || COLORS.slate;
  return (
    <div className="border rounded-md overflow-hidden" style={{ borderColor: COLORS.line, borderLeft: `3px solid ${c}` }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-2.5 py-2"
        style={{ background: open ? COLORS.paper : "white" }}>
        {open ? <ChevronDown size={13} color={COLORS.slate} /> : <ChevronRight size={13} color={COLORS.slate} />}
        <span className="text-xs font-bold uppercase tracking-wide flex-1 text-left" style={{ color: c }}>
          {titulo}
        </span>
        <Chip color={count > 0 ? c : COLORS.slate}>{count}</Chip>
      </button>
      {open && (
        <div className="p-2" style={{ borderTop: `1px solid ${COLORS.line}` }}>
          {nota && <p className="text-[11px] mb-1.5" style={cSlate}>{nota}</p>}
          <div className="space-y-1.5">{children}</div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   HISTORIAL DE LA ORDEN
   Todo cambio queda registrado, pero fuera de la vista principal: se consulta
   desde el enlace "Historial". Incluye reprogramaciones y cambios de estado,
   responsable, fechas y costos.
   ========================================================================= */

const CAMPOS_SEGUIDOS = {
  estado: "Estado",
  tecnicoId: "Responsable",
  fechaProgramada: "Fecha programada",
  fechaCompletada: "Fecha de cierre",
  materialesEstado: "Materiales",
  duracionValor: "Tiempo estimado",
  proveedor: "Proveedor",
  presupuestoAprobado: "Valor aprobado",
};

/* Compara lo guardado con lo que llega y devuelve los movimientos con sentido
   operativo. No registra cada tecla, solo cambios que alguien podría auditar. */
function diffCambios(antes, patch, usuarios) {
  const legible = (campo, v) => {
    if (v === "" || v == null) return "—";
    if (campo === "estado") return ESTADOS[v]?.label || v;
    if (campo === "materialesEstado") return MAT_ESTADO[v]?.label || v;
    if (campo === "tecnicoId") return usuarioNombre(usuarios, v);
    if (campo === "presupuestoAprobado") return money(v);
    return String(v);
  };
  return Object.keys(patch || {})
    .filter((k) => CAMPOS_SEGUIDOS[k] && String(antes?.[k] ?? "") !== String(patch[k] ?? ""))
    .map((k) => ({
      campo: CAMPOS_SEGUIDOS[k],
      antes: legible(k, antes?.[k]),
      despues: legible(k, patch[k]),
    }));
}

function HistorialActividad({ item, data }) {
  const log = (item.log || []).map((e) => ({ ...e }));
  const reprog = (item.reprogramaciones || []).map((r) => ({
    id: r.id, sello: r.sello, usuarioId: r.usuarioId,
    titulo: "Reprogramación",
    detalle: `${r.fechaAnterior || "sin fecha"} → ${r.fechaNueva} · ${r.motivo}`,
    nota: r.detalle,
    destacado: true,
  }));
  const eventos = [...log, ...reprog].sort((a, b) => (b.sello || "").localeCompare(a.sello || ""));

  if (eventos.length === 0) return <Empty>Sin movimientos registrados todavía.</Empty>;

  return (
    <div className="space-y-1.5">
      {eventos.map((e, i) => (
        <div key={e.id || i} className="border rounded-md px-2.5 py-2"
          style={{ borderColor: COLORS.line, borderLeft: `3px solid ${e.destacado ? COLORS.ambar : COLORS.line}` }}>
          <p className="text-[11px] font-semibold" style={cChar}>
            {e.titulo}
            {e.detalle ? <span className="font-normal" style={cSlate}> · {e.detalle}</span> : null}
          </p>
          {e.nota && <p className="text-[11px] mt-0.5" style={cChar}>{e.nota}</p>}
          <p className="text-[10px] mt-0.5" style={cSlate}>
            {usuarioNombre(data.usuarios, e.usuarioId)} · {e.sello}
          </p>
        </div>
      ))}
    </div>
  );
}

/* Enlace discreto que abre el historial en un popup. */
function BotonHistorial({ item, data }) {
  const [abierto, setAbierto] = useState(false);
  const n = (item.log || []).length + (item.reprogramaciones || []).length;
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setAbierto(true); }}
        title="Historial de cambios de esta orden"
        className="flex items-center gap-1 text-[10px] font-semibold" style={cSlate}>
        <Clock size={11} /> Historial{n > 0 ? ` (${n})` : ""}
      </button>
      {abierto && (
        <Modal title={`Historial · ${item.codigo || "actividad"}`} onClose={() => setAbierto(false)} wide>
          <HistorialActividad item={item} data={data} />
        </Modal>
      )}
    </>
  );
}

/* Consumo de bodega: el técnico registra lo que realmente usó en un preventivo.
   No pasa por aprobación — el valor entra directo al presupuesto de la sede.
   Si el artículo no está en el catálogo, o la bodega está vacía, se puede dar
   de alta aquí mismo: lo importante es no bloquear el registro de lo usado. */
function ConsumoStock({ item, stockSede, onRegistrar, onQuitar, readOnly }) {
  const [sel, setSel] = useState("");
  const [cant, setCant] = useState(1);

  const consumos = item.consumos || [];
  const total = costoConsumos(item);
  const art = stockSede.find((x) => x.id === sel);
  const excede = art && Number(cant) > art.cantidad;
  const valido = art && Number(cant) > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={cSlate}>Consumo de bodega</p>
        {total > 0 && <Chip color={COLORS.orange}>{money(total)}</Chip>}
      </div>

      {consumos.length > 0 && (
        <div className="space-y-1 mb-2">
          {consumos.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs gap-2 border rounded-md px-2 py-1.5" style={bLine}>
              <span className="min-w-0 truncate" style={cChar}>{c.nombre} · {c.cantidad} {c.unidad}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-semibold" style={cOrange}>{money(c.cantidad * c.costoUnitario)}</span>
                {!readOnly && <button onClick={() => onQuitar(c)}><Trash2 size={12} color={COLORS.slate} /></button>}
              </span>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <>
          {stockSede.length > 0 && (
            <>
              <div className="flex gap-1.5">
                <select value={sel} onChange={(e) => { setSel(e.target.value); setCant(1); }}
                  className="flex-1 min-w-0 border rounded-md px-2 py-1.5 text-xs" style={inputStyle}>
                  <option value="">Elegir artículo…</option>
                  {stockSede.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre} · {x.cantidad > 0 ? `${x.cantidad} ${x.unidad}` : "sin stock"}
                    </option>
                  ))}
                </select>
                <input type="number" min="1" value={cant} onChange={(e) => setCant(e.target.value)}
                  className="w-14 border rounded-md px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                <button disabled={!valido}
                  onClick={() => { onRegistrar(art, Number(cant)); setSel(""); setCant(1); }}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-md text-white shrink-0 disabled:opacity-40"
                  style={{ background: COLORS.orange }}>
                  Cargar
                </button>
              </div>
              {art && (
                <p className="text-[10px] mt-1" style={{ color: excede ? COLORS.ambar : COLORS.slate }}>
                  {excede
                    ? `En bodega solo hay ${art.cantidad} ${art.unidad}; se registrará el consumo y la existencia quedará en cero.`
                    : `${money(art.costoUnitario)} por ${art.unidad} · subtotal ${money(art.costoUnitario * (Number(cant) || 0))}`}
                </p>
              )}
            </>
          )}

          <p className="text-[10px] mt-1.5" style={cSlate}>
            Descuenta de bodega y carga al presupuesto de la sede. No requiere aprobación.
          </p>
          {stockSede.length === 0 && (
            <p className="text-[10px] mt-1.5" style={cSlate}>
              No hay artículos en bodega para esta sede. Si es material nuevo por comprar, agrégalo en "Recursos / materiales".
            </p>
          )}
        </>
      )}
    </div>
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
        <span className="text-xs font-semibold truncate" style={cChar}>{p.nombre || ""}</span>
        <span className="text-xs font-bold shrink-0" style={{ color: est.color }}>{money(p.gastado)} / {money(p.presupuesto)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex" style={{ background: COLORS.line }}>
        <div style={{ width: `${wGast}%`, background: est.color }} />
        <div style={{ width: `${Math.max(0, wComp)}%`, background: `${est.color}55` }} />
      </div>
      {!compact && (
        <div className="flex items-center justify-between mt-1 gap-2 flex-wrap">
          <span className="text-[10px]" style={{ color: est.color }}>{est.label}</span>
          <span className="text-[10px]" style={cSlate}>
            {p.comprometido > 0 ? `${money(p.comprometido)} comprometido · ` : ""}
            {p.esMesActual ? `proyección ${money(p.proyeccion)}` : `${money(Math.max(0, p.disponible))} disponible`}
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
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [showClave, setShowClave] = useState(false);
  const [error, setError] = useState("");
  const [intentos, setIntentos] = useState(0);
  const [bloqueoHasta, setBloqueoHasta] = useState(0);
  const [restante, setRestante] = useState(0);

  const bloqueado = restante > 0;

  // Cuenta regresiva mientras dura el bloqueo por intentos fallidos
  useEffect(() => {
    if (!bloqueoHasta) return;
    const id = setInterval(() => {
      const seg = Math.ceil((bloqueoHasta - Date.now()) / 1000);
      setRestante(seg > 0 ? seg : 0);
      if (seg <= 0) { setBloqueoHasta(0); setIntentos(0); }
    }, 500);
    return () => clearInterval(id);
  }, [bloqueoHasta]);

  const entrar = () => {
    if (bloqueado) return;

    // El nombre se compara sin distinguir mayúsculas ni espacios sobrantes,
    // porque se escribe a mano y nadie debería fallar por eso
    const buscado = nombre.trim().toLowerCase();
    const u = usuarios.find((x) => (x.nombre || "").trim().toLowerCase() === buscado);

    if (u && u.clave === clave) {
      setIntentos(0);
      onLogin(u);
      return;
    }

    /* Mensaje deliberadamente ambiguo: si dijera "ese usuario no existe",
       cualquiera podría averiguar qué nombres son válidos probando. */
    const n = intentos + 1;
    setIntentos(n);
    setClave("");
    if (n >= 5) {
      setBloqueoHasta(Date.now() + 30000);
      setRestante(30);
      setError("Demasiados intentos. Espera medio minuto antes de volver a probar.");
    } else {
      setError("Usuario o clave incorrectos.");
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 pt-12 pb-10">
      <div className="text-center mb-8">
        <img src={logoISE} alt="IndustriaMe"
          className="mx-auto w-auto object-contain" style={{ maxHeight: 92 }} />
        <h1 className="mt-4 font-bold text-xl" style={{ color: COLORS.charcoal, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
          Mantenimiento  - Innova Schools EC
        </h1>
        <p className="text-xs mt-1" style={cSlate}>IndustriaMe · Gestión de Activos</p>
      </div>

      <div className="space-y-3">
        <Field label="Usuario">
          <input value={nombre} autoComplete="username" autoCapitalize="words"
            onChange={(e) => { setNombre(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            placeholder="Tu nombre de usuario" disabled={bloqueado}
            className="w-full border rounded-md px-3 py-2.5 text-sm outline-none disabled:opacity-50"
            style={inputStyle} />
        </Field>

        <Field label="Clave">
          <div className="relative">
            <input type={showClave ? "text" : "password"} value={clave} autoComplete="current-password"
              onChange={(e) => { setClave(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && entrar()}
              disabled={bloqueado}
              className="w-full border rounded-md px-3 py-2.5 pr-10 text-sm outline-none disabled:opacity-50"
              style={inputStyle} />
            <button onClick={() => setShowClave(!showClave)} className="absolute right-3 top-1/2 -translate-y-1/2">
              {showClave ? <EyeOff size={15} color={COLORS.slate} /> : <Eye size={15} color={COLORS.slate} />}
            </button>
          </div>
        </Field>

        {error && (
          <p className="text-xs" style={{ color: COLORS.rojo }}>
            {error}{bloqueado ? ` (${restante} s)` : ""}
          </p>
        )}

        <button onClick={entrar} disabled={bloqueado || !nombre.trim() || !clave}
          className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
          style={{ background: COLORS.orange }}>
          {bloqueado ? `Espera ${restante} s` : "Ingresar"}
        </button>

        <p className="text-[10px] text-center pt-1" style={cSlate}>
          ¿No recuerdas tu usuario o clave? Solicítalos al administrador del sistema.
        </p>
      </div>
    </div>
  );
}

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
    <div className="border rounded-md p-3" style={{ ...cardStyle, borderLeft: `3px solid ${COLORS.orange}` }}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wide" style={cSlate}>Resumen del mes · {mesLabel(mes)}</p>
        {guardado && (
          <button onClick={generar} disabled={generando}
            className="flex items-center gap-1 text-[10px] font-semibold disabled:opacity-50" style={cOrange}>
            <RefreshCw size={11} /> Regenerar
          </button>
        )}
      </div>

      {!guardado ? (
        <div className="text-center py-2">
          <p className="text-xs mb-3" style={cSlate}>
            Genera un resumen ejecutivo con los indicadores del mes, el remanente de presupuesto y, por sede,
            recurrencias de correctivos, servicios que subieron el costo y el costo por estudiante.
            Actívalo cuando ya tengas suficiente información del periodo — al inicio del mes los datos suelen ser parciales.
          </p>
          <button onClick={generar} disabled={generando}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-md text-white disabled:opacity-50"
            style={{ background: COLORS.orange }}>
            <FileText size={13} /> {generando ? "Generando…" : "Generar resumen"}
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed" style={cChar}>
            {guardado.parrafo.map((seg, i) => (seg.b ? <b key={i}>{seg.t}</b> : <span key={i}>{seg.t}</span>))}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {guardado.vinetas.map((v) => (
              <li key={v.sedeId} className="text-xs flex items-start gap-2" style={cChar}>
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: sedeColor(data.sedes, v.sedeId) }} />
                <span><b>{v.nombre}:</b> {v.texto}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] mt-2.5 pt-2 border-t" style={{ ...cSlate, borderColor: COLORS.line }}>
            Generado el {guardado.generadoEn}
          </p>
        </>
      )}
    </div>
  );
}

function Dashboard({ data, persist, sedes, mes, onMesChange, mostrarPresupuesto, mostrarCosto, mostrarSatisfaccion }) {
  const sedeIds = sedes.map((s) => s.id);
  const [sedeFiltro, setSedeFiltro] = useState(null);
  const [avisoReporte, setAvisoReporte] = useState("");
  const [genPDF, setGenPDF] = useState(false);
  const [progMes, setProgMes] = useState("");

  /* El PDF del mes puede tardar unos segundos, así que el avance se muestra
     en el botón en lugar de dejar la pantalla sin respuesta. */
  const pdfMensual = async (accion) => {
    setGenPDF(true); setAvisoReporte(""); setProgMes("Preparando…");
    try {
      const blob = await generarPDF(construirReporteMensualHTML(data, mes), { onProgreso: setProgMes });
      const nombre = `reporte-gestion-${mes}.pdf`;
      if (accion === "compartir") {
        const via = await compartirPDF(blob, nombre);
        setAvisoReporte(via === "compartido" ? "Reporte compartido."
          : via === "cancelado" ? "" : "Tu dispositivo no permite compartir archivos, así que se descargó el PDF.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = nombre;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setAvisoReporte(`Descargado ${nombre}`);
      }
    } catch (e) {
      console.error("[pdf]", e);
      setAvisoReporte("No se pudo generar el PDF del mes.");
    } finally {
      setGenPDF(false); setProgMes("");
      setTimeout(() => setAvisoReporte(""), 6000);
    }
  };

  const solicitudes = data.solicitudes.filter((s) => sedeIds.includes(s.sedeId) && (!sedeFiltro || s.sedeId === sedeFiltro));
  const ordenes = data.ordenes.filter((o) => sedeIds.includes(o.sedeId) && (!sedeFiltro || o.sedeId === sedeFiltro));
  const serviciosDash = (data.servicios || []).filter((s) => sedeIds.includes(s.sedeId) && (!sedeFiltro || s.sedeId === sedeFiltro));

  // Solo cuentan si su fecha programada (o de cierre) cae en el mes elegido
  // arriba — antes no se filtraba por mes y por eso aparecían actividades
  // de otros meses mezcladas en los conteos del mes en curso.
  const enMes = (fecha) => mesKey(fecha) === mes;

  const sinProgramar = getPendientes(data)
    .filter((p) => sedeIds.includes(p.sedeId) && (!sedeFiltro || p.sedeId === sedeFiltro)).length;

  const programadas =
    solicitudes.filter((s) => s.estado === "programada" && enMes(s.fechaProgramada)).length +
    ordenes.filter((o) => o.estado === "programada" && enMes(o.fechaProgramada)).length +
    serviciosDash.filter((s) => s.estado === "programada" && enMes(s.fecha)).length;

  // "En Ejecución" junta en_proceso + espera (pausada, pero ya arrancada)
  const enProceso =
    solicitudes.filter((s) => ["en_proceso", "espera"].includes(s.estado) && enMes(s.fechaProgramada)).length +
    ordenes.filter((o) => ["en_proceso", "espera"].includes(o.estado) && enMes(o.fechaProgramada)).length +
    serviciosDash.filter((s) => ["en_proceso", "espera"].includes(s.estado) && enMes(s.fecha)).length;

  const completadas =
    solicitudes.filter((s) => s.estado === "completada" && enMes(s.fechaCompletada)).length +
    ordenes.filter((o) => o.estado === "completada" && enMes(o.fechaCompletada)).length +
    serviciosDash.filter((s) => s.estado === "completada" && enMes(s.fechaCompletada)).length;

  const alcance = sedeFiltro ? [sedeFiltro] : sedeIds;
  const kpi = useMemo(() => indicadoresMes(data, alcance, mes), [data, sedeFiltro, mes, sedeIds.join(",")]);
  const serieCosto = useMemo(() => serieCostoEstudiante(data, alcance, mes), [data, sedeFiltro, mes, sedeIds.join(",")]);
  const avanceGlobal = useMemo(() => avancePlan(data, alcance, mes), [data, sedeFiltro, mes, sedeIds.join(",")]);
  const sat = useMemo(() => satisfaccion(data, alcance), [data, sedeFiltro, sedeIds.join(",")]);
  const avancePorSede = useMemo(
    () => sedes.filter((s) => !sedeFiltro || s.id === sedeFiltro)
      .map((s) => ({ ...avancePlan(data, [s.id], mes), sedeId: s.id, nombre: s.nombre }))
      .filter((a) => a.total > 0),
    [data, sedeFiltro, mes, sedeIds.join(",")]
  );

  const presupuestos = sedes.map((s) => ({ ...presupuestoSedeMes(data, s.id, mes), nombre: s.nombre }));
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
      <div className="flex items-center justify-between gap-2 flex-wrap border rounded-md p-2.5" style={cardStyle}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={cSlate}>Periodo</span>
          <MesSelector mes={mes} onChange={onMesChange} />
        </div>
        {mostrarCosto && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => pdfMensual("compartir")} disabled={genPDF}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white disabled:opacity-40"
              style={{ background: COLORS.orange }}>
              <Send size={13} /> {genPDF ? (progMes || "Generando…") : "Compartir reporte mensual"}
            </button>
            <button onClick={() => pdfMensual("descargar")} disabled={genPDF}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border disabled:opacity-40"
              style={{ borderColor: COLORS.line, color: COLORS.charcoal }}>
              <Download size={13} /> Descargar PDF
            </button>
          </div>
        )}
      </div>
      {avisoReporte && (
        <p className="text-[11px] rounded-md px-3 py-2" style={{ background: `${COLORS.ambar}18`, color: COLORS.charcoal }}>
          {avisoReporte}
        </p>
      )}

      {sedes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSedeFiltro(null)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border"
            style={{ borderColor: !sedeFiltro ? COLORS.orange : COLORS.line, color: !sedeFiltro ? COLORS.orange : COLORS.slate, background: !sedeFiltro ? `${COLORS.orange}12` : "white" }}>
            Todas
          </button>
          {sedes.map((s) => (
            <button key={s.id} onClick={() => setSedeFiltro(s.id === sedeFiltro ? null : s.id)}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border flex items-center gap-1.5"
              style={{ borderColor: sedeFiltro === s.id ? sedeColor(data.sedes, s.id) : COLORS.line, color: sedeFiltro === s.id ? sedeColor(data.sedes, s.id) : COLORS.slate, background: sedeFiltro === s.id ? `${sedeColor(data.sedes, s.id)}12` : "white" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sedeColor(data.sedes, s.id) }} />
              {s.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sin Programar" value={sinProgramar} icon={<AlertTriangle size={14} />} color={COLORS.rojo} sub="Preventivos, correctivos y servicios" />
        <Stat label="Programadas" value={programadas} icon={<CalendarDays size={14} />} color={COLORS.ambar} />
        <Stat label="En Ejecución" value={enProceso} icon={<Clock size={14} />} color={COLORS.orange} />
        <Stat label="Completadas" value={completadas} icon={<CheckCircle2 size={14} />} color={COLORS.verde} />
      </div>

      {/* Actividades por sede + avance del plan preventivo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border rounded-md p-3" style={cardStyle}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={cSlate}>Actividades por sede</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porSede}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: COLORS.slate }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="preventivos" name="Preventivos" fill={COLORS.orange} radius={[4, 4, 0, 0]} />
              <Bar dataKey="correctivos" name="Correctivos" fill={COLORS.charcoal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="border rounded-md p-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={cSlate}>Cumplimiento del plan preventivo</p>
            {avanceGlobal.cumplimiento !== null && (
              <Chip color={colorCumpl(avanceGlobal.cumplimiento)}>{avanceGlobal.cumplimiento.toFixed(0)}% completado</Chip>
            )}
          </div>

          {avancePorSede.length > 0 ? (
            <div className="space-y-3">
              {avancePorSede.map((a) => (
                <div key={a.sedeId}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold truncate flex items-center gap-1.5" style={cChar}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sedeColor(data.sedes, a.sedeId) }} />
                      {a.nombre}
                    </span>
                    <span className="text-xs font-bold shrink-0" style={{ color: colorCumpl(a.cumplimiento) }}>
                      {a.cumplimiento === null ? "—" : `${a.cumplimiento.toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="h-3 rounded-sm overflow-hidden flex" style={{ background: COLORS.line }}>
                    <div style={{ width: `${a.total ? (a.completadas / a.total) * 100 : 0}%`, background: COLORS.verde }} title={`${a.completadas} completadas`} />
                    <div style={{ width: `${a.total ? (a.enEjecucion / a.total) * 100 : 0}%`, background: COLORS.orange }} title={`${a.enEjecucion} en ejecución`} />
                    <div style={{ width: `${a.total ? (a.sinProgramar / a.total) * 100 : 0}%`, background: COLORS.rojo }} title={`${a.sinProgramar} sin programar`} />
                  </div>
                  <p className="text-[10px] mt-1" style={cSlate}>
                    {a.total} tareas · {a.completadas} completadas · {a.enEjecucion} en ejecución
                    {a.sinProgramar > 0 ? ` · ${a.sinProgramar} sin programar` : ""}
                  </p>
                </div>
              ))}

              <div className="flex items-center gap-3 flex-wrap pt-2 border-t" style={bLine}>
                {[["Completadas", COLORS.verde], ["En Ejecución", COLORS.orange], ["Sin Programar", COLORS.rojo]].map(([l, c]) => (
                  <span key={l} className="flex items-center gap-1 text-[10px]" style={cSlate}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}
                  </span>
                ))}
              </div>
            </div>
          ) : <Empty>Aún no hay planes que apliquen a estas sedes.</Empty>}
        </div>
      </div>

      {/* Indicadores de confiabilidad */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${mostrarSatisfaccion ? "lg:grid-cols-3" : ""} gap-3`}>
        <GaugeDonut
          titulo="MTBF · entre fallas" valor={kpi.mtbf} max={GAUGE_MAX_DIAS} color={colorMTBF(kpi.mtbf)}
          detalle={kpi.nFallas > 0 ? `${kpi.diasTranscurridos} días ÷ ${kpi.nFallas} correctivos` : "Sin correctivos este mes"} />
        <GaugeDonut
          titulo="MTTR · de reparación" valor={kpi.mttr} max={GAUGE_MAX_DIAS} color={colorMTTR(kpi.mttr)} invertido
          detalle={kpi.cerrados > 0 ? `${duracionTexto(kpi.mttr)} · promedio de ${kpi.cerrados} cierre(s)` : "Sin correctivos cerrados"} />
        {mostrarSatisfaccion && <TarjetaSatisfaccion sat={sat} />}
      </div>

      {/* Tendencia del costo por estudiante — solo para administración y cliente */}
      {mostrarCosto && (
        <div className="border rounded-md p-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <p className="text-xs font-semibold uppercase tracking-wide" style={cSlate}>Costo por estudiante</p>
            <span className="text-sm font-bold" style={cOrange}>
              {kpi.costoPorEstudiante !== null ? money(kpi.costoPorEstudiante) : "—"}
            </span>
          </div>
          <p className="text-[10px] mb-2" style={cSlate}>Fee de servicio + materiales + servicios externos</p>
          <ResponsiveContainer width="100%" height={185}>
            <LineChart data={serieCosto} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: COLORS.slate }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v) => [money(v), "Costo por estudiante"]} />
              <Line type="monotone" dataKey="costo" stroke={COLORS.orange} strokeWidth={2.5}
                dot={{ r: 3, fill: COLORS.orange }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          {kpi.costoTotal > 0 && (
            <div className="mt-2 pt-2 border-t space-y-1" style={bLine}>
              {[
                ["Fee de servicio", kpi.costoFee, COLORS.verde],
                ["Materiales", kpi.costoMateriales, COLORS.orange],
                ["Servicios externos", kpi.costoServicios, "#3B6EA5"],
              ].map(([label, val, color]) => (
                <div key={label} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5" style={cChar}>
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
                  </span>
                  <span className="font-semibold" style={{ color }}>{money(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mostrarPresupuesto && (
        <div className="border rounded-md p-3" style={cardStyle}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={cSlate}>
            Presupuesto de materiales {sedeSel ? `· ${sedeSel.nombre}` : ""}
          </p>
          <div className="flex items-baseline gap-2 mb-3 flex-wrap">
            <span className="text-2xl font-bold" style={{ color: COLORS.charcoal, fontFamily: "'Barlow Condensed', sans-serif" }}>{money(gastoMes)}</span>
            <span className="text-xs" style={cSlate}>de {money(presupuestoMes)} en materiales</span>
          </div>
          <div className="space-y-2.5">
            {presupuestos.filter((p) => !sedeFiltro || p.sedeId === sedeFiltro).map((p) => (
              <PresupuestoBar key={p.sedeId} p={p} />
            ))}
          </div>
        </div>
      )}

      {mostrarCosto && <TarjetaResumenMes data={data} persist={persist} sedes={sedes} mes={mes} />}
    </div>
  );
}

/* ============================================================================
   9. VISTA SOLICITANTE  (una sede: dashboard + solicitudes)
   ========================================================================= */

/* Filtros de "Mis solicitudes". Agrupan estados en las tres etapas que le
   importan al solicitante: lo que espera, lo que ya está en marcha y lo
   terminado. Los estados internos del sistema se agrupan aquí. */
const FILTROS_SOLICITUD = [
  { id: "todas", label: "Todas", estados: [], color: COLORS.charcoal },
  { id: "pendiente", label: "Sin atender", estados: ["pendiente"], color: COLORS.slate },
  { id: "curso", label: "En curso", estados: ["programada", "en_proceso", "espera"], color: COLORS.orange },
  { id: "completada", label: "Resueltas", estados: ["completada"], color: COLORS.verde },
  { id: "calificar", label: "Por calificar", estados: ["completada"], color: COLORS.ambar, sinCalificar: true },
];

/* "Por calificar" comparte estado con "Resueltas", así que necesita su propia
   condición: cerradas que el solicitante todavía no valoró. */
function cumpleFiltro(s, f) {
  if (f.id === "todas") return true;
  if (!f.estados.includes(s.estado)) return false;
  if (f.sinCalificar) return !s.calificacion;
  return true;
}

/* Tarjeta de una solicitud propia. Se muestra compacta y el botón de
   información abre la ficha completa, para que la lista se pueda recorrer
   de un vistazo aunque haya muchas. */
function TarjetaSolicitudMia({ s, data, onCalificar }) {
  const [abierta, setAbierta] = useState(false);
  const porCalificar = s.estado === "completada" && !s.calificacion;

  return (
    <div className="border rounded-md" style={{ ...cardStyle, borderLeft: `3px solid ${ESTADOS[s.estado]?.color || COLORS.line}` }}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold" style={cOrange}>{s.codigo}</span>
              <EstadoChip estado={s.estado} />
              {s.criticidad && <Chip color={CRITICIDAD[s.criticidad].color}>{CRITICIDAD[s.criticidad].label}</Chip>}
              {porCalificar && <Chip color={COLORS.ambar}>Por calificar</Chip>}
              {s.calificacion > 0 && <Estrellas valor={s.calificacion} size={11} readOnly />}
            </div>
            <p className="text-sm font-semibold mt-1 truncate" style={cChar}>{s.descripcion}</p>
            <p className="text-[11px] truncate" style={cSlate}>{ubicacionTexto(data.sedes, s)}</p>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            {s.fotoSolicitante && <Camera size={12} color={COLORS.slate} title="Tiene foto" />}
            <button onClick={() => setAbierta(!abierta)} title="Ver toda la información"
              className="opacity-60 hover:opacity-100">
              <Info size={15} color={COLORS.slate} />
            </button>
          </div>
        </div>
        <p className="text-[10px] mt-1" style={cSlate}>{s.fecha} · {s.hora}</p>
      </div>

      {abierta && (
        <div className="px-3 pb-3 border-t pt-3 space-y-2" style={bLine}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="font-semibold" style={cSlate}>Atiende</p>
              <p style={cChar}>{s.tecnicoId ? usuarioNombre(data.usuarios, s.tecnicoId) : "Por asignar"}</p>
            </div>
            <div>
              <p className="font-semibold" style={cSlate}>Programado</p>
              <p style={cChar}>{s.fechaProgramada || "Sin fecha"}</p>
            </div>
          </div>

          {s.fechaCompletada && (
            <p className="text-[11px] font-semibold" style={{ color: COLORS.verde }}>
              Finalizada el {s.fechaCompletada}{s.horaCompletada ? ` · ${s.horaCompletada}` : ""}
              {` · atendida en ${duracionTexto(horasEntre(s.fecha, s.hora, s.fechaCompletada, s.horaCompletada) / 24)}`}
            </p>
          )}

          {s.fotoSolicitante && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>Foto que enviaste</p>
              <img src={s.fotoSolicitante} alt="Foto de la solicitud"
                className="rounded-md max-h-48 border w-full object-contain" style={bLine} />
            </div>
          )}

          {s.foto && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>Evidencia del técnico</p>
              <img src={s.foto} alt="Evidencia del técnico"
                className="rounded-md max-h-48 border w-full object-contain" style={bLine} />
            </div>
          )}

          {s.resolucion && (
            <p className="text-xs rounded p-2" style={{ background: COLORS.cream, color: COLORS.charcoal }}>
              <strong>Resuelto:</strong> {s.resolucion}
            </p>
          )}

          {s.estado === "completada" && (
            <BloqueCalificacion solicitud={s} onCalificar={onCalificar} />
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   REPORTAR NOVEDAD  ·  formulario único
   ----------------------------------------------------------------------------
   Los tres roles reportan contra la misma colección de solicitudes, así que
   usan el mismo formulario y guardan exactamente los mismos campos. Lo único
   que cambia es cómo se elige la ubicación y quién queda como reportante:

     · Solicitante  → ubicación fija (llega del árbol o del QR), reporta a su nombre
     · Técnico      → elige sede, fase y activo; reporta a su nombre
     · Supervisor   → elige ubicación y además a quién se le atribuye

   Antes eran dos componentes distintos y el del técnico no permitía adjuntar
   foto, que es justo lo más útil de un hallazgo en campo.
========================================================================== */
function FormReportarNovedad({
  user, sedes, usuarios, onSubmit, onClose,
  ubicacion,            // si viene, la ubicación es fija y no se puede cambiar
  elegirSolicitante,    // solo el supervisor atribuye el reporte a otra persona
}) {
  const fija = !!ubicacion;
  const [sedeId, setSedeId] = useState(ubicacion?.sedeId || sedes[0]?.id || "");
  const [faseId, setFaseId] = useState(ubicacion?.faseId || "");
  const [activoId, setActivoId] = useState(ubicacion?.activoId || "");
  const [descripcion, setDescripcion] = useState("");
  const [criticidad, setCriticidad] = useState("");
  const [foto, setFoto] = useState("");
  const [solicitanteId, setSolicitanteId] = useState(user.id);

  const sede = sedes.find((s) => s.id === sedeId);
  const fase = sede?.fases.find((f) => f.id === faseId);
  const ahora = new Date();
  const valido = sedeId && descripcion.trim() && solicitanteId;

  // Quién pudo haber detectado la novedad en esa sede
  const posiblesSolicitantes = elegirSolicitante
    ? (usuarios || []).filter((u) =>
        u.id === user.id ||
        ((u.rol === "solicitante" || u.rol === "tecnico") && (u.sedeIds || []).includes(sedeId)))
    : [];

  // Si al cambiar de sede el reportante elegido ya no aplica, vuelve a quien registra
  useEffect(() => {
    if (!elegirSolicitante) return;
    if (!posiblesSolicitantes.some((u) => u.id === solicitanteId)) setSolicitanteId(user.id);
  }, [sedeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {fija && <ReadOnly>{ubicacionTexto(sedes, ubicacion)}</ReadOnly>}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="font-semibold" style={cSlate}>{elegirSolicitante ? "Registra" : "Reporta"}</p>
          <p style={cChar}>{user.nombre}</p>
        </div>
        <div>
          <p className="font-semibold" style={cSlate}>Fecha y hora</p>
          <p style={cChar}>{fmtDate(ahora)} · {fmtHora(ahora)}</p>
        </div>
      </div>

      {!fija && (
        <>
          <Field label="Sede">
            <select value={sedeId} onChange={(e) => { setSedeId(e.target.value); setFaseId(""); setActivoId(""); }}
              className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
              {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Field>

          {elegirSolicitante && (
            <Field label="Reportado por" hint="Quién detectó la novedad. Queda como solicitante de la orden.">
              <select value={solicitanteId} onChange={(e) => setSolicitanteId(e.target.value)}
                className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
                {posiblesSolicitantes.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}{u.id === user.id ? " (yo)" : ` · ${ROLES[u.rol]?.label || u.rol}`}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Fase">
            <select value={faseId} onChange={(e) => { setFaseId(e.target.value); setActivoId(""); }}
              className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
              <option value="">Selecciona una fase</option>
              {(sede?.fases || []).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </Field>

          {faseId && (
            <Field label="Activo">
              <select value={activoId} onChange={(e) => setActivoId(e.target.value)}
                className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
                <option value="">Selecciona un activo</option>
                {(fase?.activos || []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
          )}
        </>
      )}

      <Field label="Detalle de la novedad">
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3}
          placeholder="Describe lo que ocurre..." className={`${inputCls} resize-none`} style={inputStyle} />
      </Field>

      <Field label="Criticidad (opcional)">
        <div className="grid grid-cols-4 gap-1.5">
          {CRITICIDAD_IDS.map((c) => (
            <button key={c} onClick={() => setCriticidad(criticidad === c ? "" : c)}
              className="text-[11px] font-semibold py-2 rounded-md border"
              style={{
                borderColor: criticidad === c ? CRITICIDAD[c].color : COLORS.line,
                background: criticidad === c ? `${CRITICIDAD[c].color}15` : "white",
                color: criticidad === c ? CRITICIDAD[c].color : COLORS.slate,
              }}>
              {CRITICIDAD[c].label}
            </button>
          ))}
        </div>
      </Field>

      <FotoUploader foto={foto} onChange={setFoto} label="Foto de la novedad (opcional)" carpeta="solicitudes" />

      <button disabled={!valido}
        onClick={() => { onSubmit({ sedeId, faseId, activoId, descripcion, criticidad, foto, solicitanteId }); onClose(); }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: COLORS.orange }}>
        <Send size={14} /> Reportar novedad
      </button>
    </div>
  );
}

function BuscadorQR({ sedes, onFound }) {
  const videoRef = useRef(null);
  const lienzoRef = useRef(null);
  const streamRef = useRef(null);
  const pararRef = useRef(false);

  const [escaneando, setEscaneando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [manual, setManual] = useState(false);
  const [value, setValue] = useState("");

  const soportaCamara = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const resolver = (texto) => {
    const activos = flattenActivos(sedes);
    const crudo = (texto || "").trim();
    let id = crudo;
    try { id = new URL(crudo).searchParams.get("activo") || crudo; } catch (_) {}
    return activos.find((a) => a.activoId === id) ||
      activos.find((a) => a.activoNombre.toLowerCase() === crudo.toLowerCase());
  };

  const detener = () => {
    pararRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setEscaneando(false);
    setAviso("");
  };

  // Cerrar la cámara si el componente se desmonta con el escaneo activo
  useEffect(() => detener, []); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirCamara = async () => {
    setError(""); setAviso("");
    if (!soportaCamara) {
      setError("Este navegador no permite abrir la cámara. Usa la búsqueda manual.");
      setManual(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },   // cámara trasera en el celular
        audio: false,
      });
      streamRef.current = stream;
      pararRef.current = false;
      setEscaneando(true);

      setTimeout(async () => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");   // iOS exige esto o abre en pantalla completa
        try { await v.play(); } catch (_) {}
        leerContinuo();
      }, 60);
    } catch (e) {
      console.error("[qr]", e);
      setError(
        e?.name === "NotAllowedError"
          ? "No diste permiso para usar la cámara. Habilítalo en el navegador o busca el activo por su nombre."
          : "No se pudo abrir la cámara. Busca el activo por su nombre."
      );
      setManual(true);
    }
  };

  const leerContinuo = () => {
    const tick = () => {
      if (pararRef.current) return;
      const v = videoRef.current;
      const lienzo = lienzoRef.current;

      if (v && lienzo && v.readyState === v.HAVE_ENOUGH_DATA) {
        // Se analiza a ancho reducido: suficiente para el código y mucho más ágil
        const ancho = 480;
        const alto = Math.round((v.videoHeight / v.videoWidth) * ancho) || 480;
        lienzo.width = ancho;
        lienzo.height = alto;
        const ctx = lienzo.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, ancho, alto);
        try {
          const img = ctx.getImageData(0, 0, ancho, alto);
          const codigo = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (codigo?.data) {
            const encontrado = resolver(codigo.data);
            if (encontrado) {
              detener();
              onFound(encontrado);
              return;
            }
            setAviso("Ese código no corresponde a ningún activo de tus sedes.");
          }
        } catch (_) { /* fotograma ilegible: se intenta con el siguiente */ }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const buscarManual = () => {
    setError("");
    const encontrado = resolver(value);
    if (encontrado) onFound(encontrado);
    else setError("No se encontró ese activo. Verifica el enlace o el nombre exacto.");
  };

  return (
    <div className="space-y-3">
      {escaneando ? (
        <>
          <div className="relative rounded-md overflow-hidden" style={{ background: COLORS.charcoal }}>
            <video ref={videoRef} playsInline muted autoPlay
              className="w-full" style={{ maxHeight: 340, objectFit: "cover" }} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div style={{ width: 180, height: 180, border: `3px solid ${COLORS.orange}`, borderRadius: 12 }} />
            </div>
          </div>
          <canvas ref={lienzoRef} className="hidden" />
          <p className="text-xs text-center" style={cSlate}>
            Apunta al código QR pegado en el activo.
          </p>
          {aviso && <p className="text-xs text-center" style={{ color: COLORS.ambar }}>{aviso}</p>}
          <button onClick={detener} className="w-full py-2 rounded-md text-sm font-semibold border"
            style={{ borderColor: COLORS.line, color: COLORS.charcoal }}>
            Cerrar cámara
          </button>
        </>
      ) : (
        <button onClick={abrirCamara}
          className="w-full py-3 rounded-md font-semibold text-sm text-white flex items-center justify-center gap-2"
          style={{ background: COLORS.orange }}>
          <Camera size={16} /> Abrir cámara y escanear
        </button>
      )}

      {error && <p className="text-xs" style={{ color: COLORS.rojo }}>{error}</p>}

      {!manual && !escaneando && (
        <button onClick={() => setManual(true)} className="w-full text-xs font-semibold" style={cSlate}>
          Buscar por nombre o enlace
        </button>
      )}

      {manual && (
        <div className="space-y-2 pt-2 border-t" style={bLine}>
          <p className="text-[11px]" style={cSlate}>
            Escribe el nombre exacto del activo o pega el enlace del QR.
          </p>
          <input value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscarManual()}
            placeholder="Enlace del QR o nombre del activo" className={inputCls} style={inputStyle} />
          <button onClick={buscarManual} className="w-full py-2.5 rounded-md font-semibold text-sm text-white"
            style={{ background: COLORS.charcoal }}>
            Buscar activo
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   MODAL DE REPORTE  ·  un solo flujo para los tres roles
   ----------------------------------------------------------------------------
   Al reportar una novedad, primero se decide cómo se identifica el activo:
   escaneando su QR o eligiéndolo de las listas. Después, el formulario es el
   mismo en ambos casos. Esto reemplaza el recorrido por fases y activos que
   antes tenía el solicitante, que obligaba a navegar el árbol completo para
   llegar a un botón de reporte.
========================================================================== */
function ModalReportarNovedad({ data, sedes, user, elegirSolicitante, onSubmit, onClose }) {
  const [paso, setPaso] = useState("inicio");   // inicio · qr · manual
  const [ubicacion, setUbicacion] = useState(null);

  const titulo = paso === "qr" ? "Escanear código QR" : "Reportar novedad";

  return (
    <Modal title={titulo} onClose={onClose} wide>
      {paso === "inicio" && (
        <div className="space-y-3">
          <p className="text-xs" style={cSlate}>
            ¿Cómo quieres identificar el activo con la novedad?
          </p>

          <button onClick={() => setPaso("qr")}
            className="w-full flex items-center gap-3 p-3 rounded-md border text-left"
            style={{ borderColor: COLORS.orange, background: `${COLORS.orange}0D` }}>
            <QrCode size={22} color={COLORS.orange} className="shrink-0" />
            <span>
              <span className="text-sm font-semibold block" style={cChar}>Escanear QR</span>
              <span className="text-[11px]" style={cSlate}>
                Apunta la cámara al código pegado en el equipo. Es lo más rápido si estás frente a él.
              </span>
            </span>
          </button>

          <button onClick={() => setPaso("manual")}
            className="w-full flex items-center gap-3 p-3 rounded-md border text-left"
            style={{ borderColor: COLORS.line, background: "white" }}>
            <Layers size={22} color={COLORS.charcoal} className="shrink-0" />
            <span>
              <span className="text-sm font-semibold block" style={cChar}>Elegir de la lista</span>
              <span className="text-[11px]" style={cSlate}>
                Selecciona sede, fase y activo. Útil si el código está dañado o reportas a distancia.
              </span>
            </span>
          </button>
        </div>
      )}

      {paso === "qr" && (
        <div className="space-y-3">
          <BuscadorQR sedes={sedes} onFound={(a) => { setUbicacion(a); setPaso("form"); }} />
          <button onClick={() => setPaso("inicio")} className="w-full text-xs font-semibold" style={cSlate}>
            ← Volver
          </button>
        </div>
      )}

      {paso === "manual" && (
        <FormReportarNovedad
          user={user} sedes={sedes} usuarios={data.usuarios}
          elegirSolicitante={elegirSolicitante}
          onSubmit={onSubmit} onClose={onClose} />
      )}

      {paso === "form" && ubicacion && (
        <FormReportarNovedad
          ubicacion={ubicacion} user={user} sedes={data.sedes} usuarios={data.usuarios}
          elegirSolicitante={elegirSolicitante}
          onSubmit={onSubmit} onClose={onClose} />
      )}
    </Modal>
  );
}

function VistaSolicitante({ data, persist, user, onLogout, ultimaSync }) {
  const sede = data.sedes.find((s) => s.id === user.sedeIds[0]);
  const misSedes = sedesVisibles(data, user);
  const misSedeIds = misSedes.map((s) => s.id);
  const pendientes = getPendientes(data).filter((p) => misSedeIds.includes(p.sedeId));
  const [tab, setTab] = useState("dashboard");
  const [mes, setMes] = useState(mesKey(fmtDate(new Date())));
  const [reportar, setReportar] = useState(false);
  const [ubicDirecta, setUbicDirecta] = useState(null);   // llega por el QR escaneado fuera de la app
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!sede) return;
    try {
      const p = new URLSearchParams(window.location.search).get("activo");
      if (p) {
        const f = flattenActivos([sede]).find((a) => a.activoId === p);
        if (f) setUbicDirecta(f);   // el QR del activo abre su formulario de una vez
      }
    } catch (_) {}
  }, [sede?.id]);

  if (!sede) {
    return (
      <div className="max-w-sm mx-auto px-4 pt-14 text-center">
        <Empty>Tu usuario no tiene una sede asignada. Contacta al administrador.</Empty>
        <button onClick={onLogout} className="mt-4 text-xs font-semibold" style={cOrange}>Salir</button>
      </div>
    );
  }

  const misSolicitudes = data.solicitudes
    .filter((s) => s.solicitanteId === user.id)
    .sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? 1 : -1));

  const [fEstado, setFEstado] = useState("todas");
  const conteos = FILTROS_SOLICITUD.reduce((acc, f) => {
    acc[f.id] = misSolicitudes.filter((s) => cumpleFiltro(s, f)).length;
    return acc;
  }, {});
  const filtroActivo = FILTROS_SOLICITUD.find((f) => f.id === fEstado) || FILTROS_SOLICITUD[0];
  const visibles = misSolicitudes.filter((s) => cumpleFiltro(s, filtroActivo));

  const calificar = (id, patch) =>
    persist((data) => ({ ...data, solicitudes: data.solicitudes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const crearSolicitud = (ubic, form) => {
    const now = new Date();
    const n = data.solCounter || 1;
    const nueva = {
      id: uid("sol"),
      codigo: `SOL-${String(n).padStart(4, "0")}`,
      sedeId: sede.id, faseId: ubic.faseId, activoId: ubic.activoId,
      descripcion: form.descripcion, criticidad: form.criticidad || "",
      solicitanteId: form.solicitanteId || user.id, fecha: fmtDate(now), hora: fmtHora(now),
      estado: "pendiente",
      tecnicoId: "", fechaProgramada: "", fechaCompletada: "",
      observaciones: "", foto: "", fotoSolicitante: form.foto || "", resolucion: "",
      materiales: [], materialesEstado: "",
      calificacion: 0, comentarioCalif: "",
    };
    persist((data) => ({ ...data, solicitudes: [nueva, ...data.solicitudes], solCounter: n + 1 }));
    setMsg(`Solicitud ${nueva.codigo} enviada.`);
    setTimeout(() => setMsg(""), 4000);
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={14} /> },
    { id: "sedes", label: "Sedes", icon: <Building2 size={14} /> },
    { id: "programacion", label: "Programación", icon: <CalendarDays size={14} /> },
    { id: "solicitudes", label: "Solicitudes", icon: <ClipboardList size={14} /> },
    { id: "historico", label: "Histórico", icon: <ClipboardList size={14} /> },
  ];

  return (
   <ProveedorDetalle data={data}>
    <div className="max-w-4xl mx-auto px-4 pb-16">
      <AppHeader user={user} onLogout={onLogout} ultimaSync={ultimaSync} sedesTexto={sede.nombre} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "dashboard" && (
        <Dashboard data={data} persist={persist} sedes={[sede]} mes={mes} onMesChange={setMes} mostrarPresupuesto />
      )}

      {tab === "solicitudes" && (
        <div className="mt-4">
          <button onClick={() => setReportar(true)}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-md text-white"
            style={{ background: COLORS.orange }}>
            <Plus size={16} /> Reportar novedad
          </button>

          {msg && (
            <div className="mt-3 text-sm rounded-md p-3 flex items-center gap-2" style={{ background: `${COLORS.verde}15`, color: COLORS.verde }}>
              <CheckCircle2 size={16} /> {msg}
            </div>
          )}

          <SectionTitle count={visibles.length}>Mis solicitudes</SectionTitle>

          {/* Filtros por estado: cada botón muestra cuántas hay, para no
              hacer clic en uno vacío. Los que no tienen ninguna se ocultan. */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {FILTROS_SOLICITUD.filter((f) => f.id === "todas" || conteos[f.id] > 0).map((f) => {
              const activo = fEstado === f.id;
              const color = f.color || COLORS.charcoal;
              return (
                <button key={f.id} onClick={() => setFEstado(f.id)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border"
                  style={{
                    background: activo ? `${color}15` : "white",
                    borderColor: activo ? color : COLORS.line,
                    color: activo ? color : COLORS.slate,
                  }}>
                  {f.label}
                  <span className="text-[10px] font-bold px-1 rounded"
                    style={{ background: activo ? color : COLORS.line, color: activo ? "white" : COLORS.slate }}>
                    {conteos[f.id]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {visibles.map((s) => (
              <TarjetaSolicitudMia key={s.id} s={s} data={data} onCalificar={(patch) => calificar(s.id, patch)} />
            ))}
            {misSolicitudes.length === 0 && <Empty>Aún no has enviado solicitudes.</Empty>}
          </div>
        </div>
      )}

      {tab === "programacion" && (
        <PanelProgramacion data={data} sedes={misSedes} pendientes={pendientes}
          nota="Vista de solo lectura: aquí puedes consultar lo programado en tu sede, pero no puedes activar ni editar nada." />
      )}

      {tab === "sedes" && (
        <AdminSedes data={{ ...data, sedes: misSedes }} persist={persist} editable={false} />
      )}

      {tab === "historico" && <VistaHistorico data={data} sedes={misSedes} rol="solicitante" />}

      {ubicDirecta && (
        <Modal title="Reportar novedad" onClose={() => setUbicDirecta(null)} wide>
          <FormReportarNovedad ubicacion={ubicDirecta} user={user} sedes={data.sedes}
            onSubmit={(form) => crearSolicitud(ubicDirecta, form)} onClose={() => setUbicDirecta(null)} />
        </Modal>
      )}

      {reportar && (
        <ModalReportarNovedad
          data={data} sedes={[sede]} user={user}
          onSubmit={(form) => crearSolicitud({ sedeId: form.sedeId, faseId: form.faseId, activoId: form.activoId }, form)}
          onClose={() => setReportar(false)} />
      )}
    </div>
   </ProveedorDetalle>
  );
}

/* ============================================================================
   10. VISTA TÉCNICO  (varias sedes: dashboard + pendientes + mis actividades)
   ========================================================================= */

function TarjetaPendiente({ item, sedes, usuarios, onActivar, ocultarCosto }) {
  const esPrev = item.tipo === "preventivo";
  const esServ = item.tipo === "servicio";
  const tipoColor = tipoMeta(item.tipo).color;
  const dur = DURACION_UNIDADES.find(([v]) => v === item.duracionUnidad)?.[1] || item.duracionUnidad;
  const sem = semaforoDe(item);

  return (
    <div className="border rounded-md p-2.5" style={{ borderColor: COLORS.line, borderLeft: `3px solid ${tipoColor}`, background: "white" }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <TipoChip tipo={item.tipo} />
          {item.codigo && <span className="text-[10px] font-bold" style={cChar}>{item.codigo}</span>}
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <BotonDetalle item={item} size={13} />
          <Semaforo item={item} />
        </span>
      </div>
      <p className="text-xs font-semibold" style={cChar}>{item.tarea}</p>
      <p className="text-[10px] mt-0.5" style={cSlate}>{ubicacionTexto(sedes, item)}</p>

      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <Chip color={sem.color}>{sem.label}</Chip>
        {esPrev && <><Chip>{item.frecuencia}</Chip>{item.duracionValor ? <Chip>~{item.duracionValor} {dur}</Chip> : null}</>}
        {esPrev && item.categoria && <Chip color={COLORS.orange}>{item.categoria}</Chip>}
        {esServ && !ocultarCosto && costoServicio(item) > 0 && <Chip color={COLORS.orange}>{money(costoServicio(item))}</Chip>}
        {esServ && item.estadoServicio && <EstadoChip estado={item.estadoServicio} />}
      </div>

      <p className="text-[10px] mt-1" style={cSlate}>
        {esPrev
          ? `Último mantenimiento: ${item.ultimoMantenimiento || "sin registro previo"}`
          : esServ
            ? `${item.proveedor || "Sin proveedor"} · programado ${item.fecha}`
            : `Reportó ${usuarioNombre(usuarios, item.solicitanteId)} · ${item.fecha} ${item.hora}`}
      </p>

      {esServ ? (
        <p className="text-[9px] mt-1.5 rounded px-2 py-1" style={{ background: COLORS.cream, color: COLORS.slate }}>
          Servicio externo — ya programado. Se gestiona desde la pestaña Servicios.
        </p>
      ) : onActivar && (
        <button onClick={onActivar} className="mt-2 w-full text-[11px] font-semibold py-1.5 rounded" style={{ background: tipoColor, color: "white" }}>
          Activar
        </button>
      )}
    </div>
  );
}

const TIPO_PLURAL = { preventivo: "Preventivos", correctivo: "Correctivos", servicio: "Servicios" };

/* Grupo de un tipo dentro de una sede. Colapsado por defecto para mantener
   la vista corta; se abre solo si tiene actividades urgentes. */
function GrupoTipo({ tipo, items, todosLosSedes, usuarios, onActivar, ocultarCosto }) {
  const urgentes = items.filter((i) => semaforoDe(i).nivel >= 3).length;
  const [open, setOpen] = useState(false);
  const meta = tipoMeta(tipo);

  return (
    <div className="border rounded-md overflow-hidden" style={{ borderColor: COLORS.line, borderLeft: `3px solid ${meta.color}` }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-2 py-1.5"
        style={{ background: open ? COLORS.paper : "white" }}>
        {open ? <ChevronDown size={12} color={COLORS.slate} /> : <ChevronRight size={12} color={COLORS.slate} />}
        <span className="text-[11px] font-bold uppercase tracking-wide flex-1 text-left" style={{ color: meta.color }}>
          {TIPO_PLURAL[tipo]}
        </span>
        {urgentes > 0 && <Chip color={COLORS.rojo}>{urgentes} urg.</Chip>}
        <Chip color={meta.color}>{items.length}</Chip>
      </button>

      {open && (
        <div className="p-1.5 space-y-1.5" style={{ borderTop: `1px solid ${COLORS.line}` }}>
          {ordenarPorUrgencia(items).map((item) => (
            <TarjetaPendiente key={item.key} item={item} sedes={todosLosSedes} usuarios={usuarios}
              onActivar={onActivar ? () => onActivar(item) : null} ocultarCosto={ocultarCosto} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArbolPendientes({ sedes, todosLosSedes, usuarios, pendientes, onActivar, ocultarCosto }) {
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
          <div key={sede.id} className="border rounded-md overflow-hidden" style={cardStyle}>
            <button onClick={() => toggle(sede.id)} className="w-full flex items-center gap-2.5 p-2.5" style={{ background: abierta ? COLORS.cream : "white" }}>
              {abierta ? <ChevronDown size={15} color={COLORS.charcoal} /> : <ChevronRight size={15} color={COLORS.charcoal} />}
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sedeColor(todosLosSedes, sede.id) }} />
              <span className="text-sm font-bold flex-1 text-left truncate" style={cChar}>{sede.nombre}</span>
              <span className="flex items-center gap-1 shrink-0">
                {["preventivo", "correctivo", "servicio"].map((t) => {
                  const n = items.filter((i) => i.tipo === t).length;
                  return n > 0 ? <Chip key={t} color={tipoMeta(t).color}>{n}</Chip> : null;
                })}
              </span>
              {criticos > 0 && <Chip color={COLORS.rojo}>{criticos} urg.</Chip>}
            </button>

            {abierta && (
              <div className="p-2 space-y-1.5" style={{ borderTop: `1px solid ${COLORS.line}` }}>
                {["preventivo", "correctivo", "servicio"].map((tipo) => {
                  const grupo = items.filter((i) => i.tipo === tipo);
                  if (grupo.length === 0) return null;
                  return (
                    <GrupoTipo key={`${sede.id}_${tipo}`} tipo={tipo} items={grupo}
                      todosLosSedes={todosLosSedes} usuarios={usuarios} onActivar={onActivar} ocultarCosto={ocultarCosto} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {pendientes.length === 0 && <Empty>No hay actividades pendientes en estas sedes.</Empty>}
    </div>
  );
}

function TarjetaActividad({ item, data, acciones, rol = "tecnico", abiertoInicial, permitirReasignar }) {
  const [open, setOpen] = useState(!!abiertoInicial);
  const [estado, setEstado] = useState(item.estado);
  const [observaciones, setObservaciones] = useState(item.observaciones || "");
  const [resolucion, setResolucion] = useState(item.resolucion || "");
  const [tecnicoId, setTecnicoId] = useState(item.tecnicoId || "");
  const [durValor, setDurValor] = useState(item.duracionValor ?? "");
  const [durUnidad, setDurUnidad] = useState(item.duracionUnidad || "minutos");
  const [guardado, setGuardado] = useState(null);
  const [reprogramar, setReprogramar] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const esPrev = item.tipo === "preventivo";
  const esServ = item.tipo === "servicio";
  const esCorr = item.tipo === "correctivo";

  /* El supervisor puede corregir cualquier dato directamente sobre la tarjeta.
     Es lo que permite arreglar registros capturados a destiempo —sin señal en
     sitio, cargados al día siguiente— sin salir de la orden. */
  const corrige = rol === "admin";
  const [txt, setTxt] = useState(esServ ? item.trabajo || "" : esPrev ? item.tarea || "" : item.descripcion || "");
  const [detalle, setDetalle] = useState(item.detalle || "");
  const [criticidad, setCriticidad] = useState(item.criticidad || "");
  const [solicitanteId, setSolicitanteId] = useState(item.solicitanteId || "");
  const [sedeId, setSedeId] = useState(item.sedeId || "");
  const [faseId, setFaseId] = useState(item.faseId || "");
  const [activoId, setActivoId] = useState(item.activoId || "");
  const [fecha, setFecha] = useState(item.fecha || "");
  const [hora, setHora] = useState(item.hora || "");
  const [fProg, setFProg] = useState((esServ ? item.fecha : item.fechaProgramada) || "");
  const [fCompl, setFCompl] = useState(item.fechaCompletada || "");
  const [hCompl, setHCompl] = useState(item.horaCompletada || "");
  const [proveedor, setProveedor] = useState(item.proveedor || "");
  const [presu, setPresu] = useState(item.presupuesto ?? "");
  const [presuAp, setPresuAp] = useState(item.presupuestoAprobado ?? "");
  const [calif, setCalif] = useState(item.calificacion || 0);
  // El admin ajusta el tiempo estimado desde cualquier vista, no solo al activar
  const puedeEditarTiempo = rol === "admin" && !esServ;
  // Reprogramar está disponible mientras la actividad siga abierta
  const puedeReprogramar = ESTADOS_ABIERTOS.includes(item.estado);
  const stockSede = (data.stock || []).filter((x) => x.sedeId === item.sedeId);

  // Si otro usuario modifica este mismo registro, el formulario se pone al día
  // (solo cuando está cerrado, para no borrar lo que el técnico está escribiendo)
  useEffect(() => {
    if (open) return;
    setEstado(item.estado);
    setObservaciones(item.observaciones || "");
    setResolucion(item.resolucion || "");
    setTecnicoId(item.tecnicoId || "");
    setDurValor(item.duracionValor ?? "");
    setDurUnidad(item.duracionUnidad || "minutos");
    setTxt(esServ ? item.trabajo || "" : esPrev ? item.tarea || "" : item.descripcion || "");
    setDetalle(item.detalle || "");
    setCriticidad(item.criticidad || "");
    setSolicitanteId(item.solicitanteId || "");
    setSedeId(item.sedeId || ""); setFaseId(item.faseId || ""); setActivoId(item.activoId || "");
    setFecha(item.fecha || ""); setHora(item.hora || "");
    setFProg((esServ ? item.fecha : item.fechaProgramada) || "");
    setFCompl(item.fechaCompletada || ""); setHCompl(item.horaCompletada || "");
    setProveedor(item.proveedor || ""); setPresu(item.presupuesto ?? "");
    setPresuAp(item.presupuestoAprobado ?? ""); setCalif(item.calificacion || 0);
  }, [item, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = () => {
    setGuardado("guardando");
    const patch = { estado, observaciones };
    if (!esPrev) patch.resolucion = resolucion;
    if (permitirReasignar) patch.tecnicoId = tecnicoId;
    if (puedeEditarTiempo) {
      patch.duracionValor = Number(durValor) || 0;
      patch.duracionUnidad = durUnidad;
    }

    // Correcciones del supervisor sobre los datos de la orden
    if (corrige) {
      patch.sedeId = sedeId; patch.faseId = faseId; patch.activoId = activoId;
      if (esServ) {
        patch.trabajo = txt; patch.detalle = detalle; patch.proveedor = proveedor;
        patch.presupuesto = Number(presu) || 0;
        patch.presupuestoAprobado = presuAp === "" ? null : Number(presuAp);
        patch.fecha = fProg;
      } else if (esPrev) {
        patch.tarea = txt;
        patch.fechaProgramada = fProg;
      } else {
        patch.descripcion = txt; patch.criticidad = criticidad;
        patch.solicitanteId = solicitanteId; patch.calificacion = Number(calif) || 0;
        patch.fecha = fecha; patch.hora = hora;
        patch.fechaProgramada = fProg;
      }
      patch.fechaCompletada = fCompl;
      patch.horaCompletada = hCompl;
    }
    /* Sello de cierre. Al completar se graban fecha y hora automáticamente y
       la actividad se reubica en el calendario al día en que realmente se
       hizo, para que la carga del día programado deje de contarla. El salto
       queda registrado en la bitácora, así no se pierde la fecha original. */
    if (estado === "completada") {
      // Si el supervisor escribió la fecha de cierre, esa manda sobre el sello automático
      if (!item.fechaCompletada && !patch.fechaCompletada) {
        const ahora = new Date();
        const hoyStr = fmtDate(ahora);
        patch.fechaCompletada = hoyStr;
        patch.horaCompletada = fmtHora(ahora);

        if (item.fechaProgramada && item.fechaProgramada !== hoyStr) {
          const adelantada = hoyStr < item.fechaProgramada;
          patch.fechaProgramada = hoyStr;
          patch.reprogramaciones = [...(item.reprogramaciones || []), {
            id: uid("rep"),
            fechaAnterior: item.fechaProgramada,
            fechaNueva: hoyStr,
            estadoAnterior: item.estado,
            estadoNuevo: "completada",
            motivo: adelantada ? "Ejecutada antes de lo programado" : "Ejecutada después de lo programado",
            detalle: "Ajuste automático al cerrar: la fecha programada se igualó al día de ejecución.",
            usuarioId: acciones.usuario?.id || "",
            sello: `${hoyStr} · ${fmtHora(ahora)}`,
            automatico: true,
          }];
        }
      }
    } else if (item.fechaCompletada) {
      patch.fechaCompletada = "";
      patch.horaCompletada = "";
    }
    /* El supervisor corrige registros de captura, así que sus cambios de datos
       no se anotan en el historial. Los movimientos del técnico sí. */
    acciones.updateActividad(item, patch, { sinRegistro: corrige });
    // Materiales aprobados: se descuentan de bodega y quedan en el histórico
    // de consumo justo al cerrar (liquidarMateriales no hace nada si no aplica).
    if (estado === "completada") {
      acciones.liquidarMateriales(item);
    }
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
    (!esPrev && resolucion !== (item.resolucion || "")) ||
    (permitirReasignar && tecnicoId !== (item.tecnicoId || "")) ||
    (puedeEditarTiempo && (String(durValor) !== String(item.duracionValor ?? "") || durUnidad !== (item.duracionUnidad || "minutos")));

  return (
    <div className="border rounded-md" style={{ borderColor: COLORS.line, borderLeft: `3px solid ${tipoMeta(item.tipo).color}`, background: "white" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-2.5 text-left gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {open ? <ChevronDown size={16} color={COLORS.slate} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} color={COLORS.slate} className="mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TipoChip tipo={item.tipo} />
              <span className="text-[10px] font-bold" style={cChar}>{item.codigo}</span>
              {item.criticidad && <Chip color={CRITICIDAD[item.criticidad].color}>{CRITICIDAD[item.criticidad].label}</Chip>}
            </div>
            <p className="font-semibold text-sm mt-0.5 truncate" style={cChar}>{item.tarea}</p>
            <p className="text-xs truncate" style={cSlate}>{ubicacionTexto(data.sedes, item)}</p>
          </div>
        </div>
        <span className="flex items-center gap-2 shrink-0">
          <EstadoChip estado={item.estado} />
          <BotonDetalle item={item} />
        </span>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2.5 border-t pt-2.5" style={bLine}>
          {!corrige ? (
            <p className="text-xs" style={cSlate}>
              Programada: {item.fechaProgramada || "—"}
              {Number(item.duracionValor) > 0 ? ` · Tiempo estimado: ${cargaTexto(minutosDe(item))}` : ""}
              {!esPrev && item.solicitanteId ? ` · Solicitó: ${usuarioNombre(data.usuarios, item.solicitanteId)}` : ""}
            </p>
          ) : (
            <>
              <Field label="Ubicación" hint="Muévela si se reportó en el lugar equivocado.">
                <div className="space-y-1.5">
                  <select value={sedeId} onChange={(e) => { setSedeId(e.target.value); setFaseId(""); setActivoId(""); }}
                    className="w-full border rounded-md px-2 py-1.5 text-xs" style={inputStyle}>
                    {data.sedes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select value={faseId} onChange={(e) => { setFaseId(e.target.value); setActivoId(""); }}
                      className="w-full border rounded-md px-2 py-1.5 text-xs" style={inputStyle}>
                      <option value="">Fase…</option>
                      {(data.sedes.find((x) => x.id === sedeId)?.fases || []).map((x) => (
                        <option key={x.id} value={x.id}>{x.nombre}</option>
                      ))}
                    </select>
                    <select value={activoId} onChange={(e) => setActivoId(e.target.value)}
                      className="w-full border rounded-md px-2 py-1.5 text-xs" style={inputStyle}>
                      <option value="">Activo…</option>
                      {(data.sedes.find((x) => x.id === sedeId)?.fases.find((x) => x.id === faseId)?.activos || []).map((x) => (
                        <option key={x.id} value={x.id}>{x.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                {!esPrev && (
                  <Field label={esServ ? "Fecha de solicitud" : "Fecha de reporte"}>
                    <div className="flex gap-1.5">
                      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                        className="flex-1 min-w-0 border rounded-md px-1.5 py-1.5 text-xs" style={inputStyle} />
                      <input type="time" value={hora} onChange={(e) => setHora(e.target.value)}
                        className="w-20 border rounded-md px-1.5 py-1.5 text-xs" style={inputStyle} />
                    </div>
                  </Field>
                )}
                <Field label="Fecha programada">
                  <input type="date" value={fProg} onChange={(e) => setFProg(e.target.value)}
                    className="w-full border rounded-md px-2 py-1.5 text-xs" style={inputStyle} />
                </Field>
              </div>

              <Field label="Fecha y hora de ejecución" hint="Corrígela si el trabajo se hizo antes de registrarlo.">
                <div className="flex gap-1.5">
                  <input type="date" value={fCompl} onChange={(e) => setFCompl(e.target.value)}
                    className="flex-1 min-w-0 border rounded-md px-1.5 py-1.5 text-xs" style={inputStyle} />
                  <input type="time" value={hCompl} onChange={(e) => setHCompl(e.target.value)}
                    className="w-20 border rounded-md px-1.5 py-1.5 text-xs" style={inputStyle} />
                </div>
              </Field>

              {fecha && fCompl && fCompl < fecha && (
                <p className="text-[10px]" style={{ color: COLORS.rojo }}>
                  La ejecución es anterior al reporte: el tiempo de respuesta saldría negativo.
                </p>
              )}
              {fCompl && estado !== "completada" && (
                <p className="text-[10px]" style={{ color: COLORS.ambar }}>
                  Hay fecha de ejecución pero el estado no es Completada.
                </p>
              )}
            </>
          )}

          {/* El responsable solo se cambia desde aquí (Programación, rol admin) */}
          {permitirReasignar && !esServ && (
            <Field label="Responsable"
              hint={`Técnicos con ${sedeNombre(data.sedes, item.sedeId)} a cargo. Reasignar aquí actualiza a quién le aparece en Mis actividades.`}>
              <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}
                className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
                <option value="">Sin asignar</option>
                {tecnicosDeSede(data.usuarios, item.sedeId).map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Tiempo estimado: editable por el admin en cualquier vista */}
          {puedeEditarTiempo && (
            <Field label="Tiempo estimado"
              hint="Alimenta la carga diaria del calendario. Puedes ajustarlo mientras la actividad siga abierta.">
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" value={durValor} onChange={(e) => setDurValor(e.target.value)}
                  placeholder="0" className="w-20 border rounded-md px-2 py-2 text-sm outline-none" style={inputStyle} />
                <select value={durUnidad} onChange={(e) => setDurUnidad(e.target.value)}
                  className="border rounded-md px-2 py-2 text-sm" style={inputStyle}>
                  {DURACION_UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {Number(durValor) > 0 && (
                  <span className="text-[11px]" style={cSlate}>
                    = {cargaTexto(minutosDe({ duracionValor: durValor, duracionUnidad: durUnidad }))}
                  </span>
                )}
              </div>
            </Field>
          )}

          {item.fechaCompletada && (
            <div className="rounded-md p-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ background: `${COLORS.verde}12` }}>
              <span className="text-[11px]" style={cChar}>
                <CheckCircle2 size={11} style={{ display: "inline", marginRight: 4, color: COLORS.verde }} />
                Finalizada el {item.fechaCompletada}{item.horaCompletada ? ` · ${item.horaCompletada}` : ""}
              </span>
              {!esPrev && item.fecha && (
                <span className="text-[11px] font-semibold" style={{ color: COLORS.verde }}>
                  Respuesta: {duracionTexto(horasEntre(item.fecha, item.hora, item.fechaCompletada, item.horaCompletada) / 24)}
                </span>
              )}
            </div>
          )}

          {corrige ? (
            <>
              <Field label={esServ ? "Trabajo a realizar" : esPrev ? "Tarea" : "Descripción de la solicitud"}>
                {esPrev || esServ ? (
                  <input value={txt} onChange={(e) => setTxt(e.target.value)} className={inputCls} style={inputStyle} />
                ) : (
                  <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={2}
                    className={`${inputCls} resize-none`} style={inputStyle} />
                )}
              </Field>

              {esServ && (
                <>
                  <Field label="Detalle del trabajo">
                    <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3}
                      className={`${inputCls} resize-none`} style={inputStyle} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Proveedor">
                      <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={inputCls} style={inputStyle} />
                    </Field>
                    <Field label="Valor aprobado">
                      <input type="number" min="0" step="0.01" value={presuAp}
                        onChange={(e) => setPresuAp(e.target.value)} placeholder="sin aprobar"
                        className={inputCls} style={inputStyle} />
                    </Field>
                  </div>
                </>
              )}

              {esCorr && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Criticidad">
                    <select value={criticidad} onChange={(e) => setCriticidad(e.target.value)} className={inputCls} style={inputStyle}>
                      <option value="">Sin definir</option>
                      {CRITICIDAD_IDS.map((c) => <option key={c} value={c}>{CRITICIDAD[c].label}</option>)}
                    </select>
                  </Field>
                  <Field label="Reportado por">
                    <select value={solicitanteId} onChange={(e) => setSolicitanteId(e.target.value)} className={inputCls} style={inputStyle}>
                      <option value="">Sin definir</option>
                      {data.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </>
          ) : (
            !esPrev && <Field label="Descripción de la solicitud"><ReadOnly>{item.descripcion}</ReadOnly></Field>
          )}

          {corrige && esCorr && (
            <Field label="Calificación del solicitante">
              <div className="flex items-center gap-2">
                <Estrellas valor={Number(calif) || 0} onChange={setCalif} size={16} />
                {Number(calif) > 0 && (
                  <button onClick={() => setCalif(0)} className="text-[10px] font-semibold" style={cSlate}>quitar</button>
                )}
              </div>
            </Field>
          )}

          {!corrige && !esPrev && item.calificacion > 0 && (
            <div className="rounded-md p-2.5" style={{ background: `${COLORS.ambar}12` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>Calificación del solicitante</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Estrellas valor={item.calificacion} size={15} readOnly />
                <span className="text-[11px] font-semibold" style={{ color: COLORS.ambar }}>{CALIF_TEXTO[item.calificacion]}</span>
              </div>
              {item.comentarioCalif && <p className="text-xs mt-1.5" style={cChar}>“{item.comentarioCalif}”</p>}
            </div>
          )}
          {esPrev && (item.checklist || []).length > 0 && (
            <ChecklistEjecucion
              items={item.checklist}
              readOnly={item.estado === "completada"}
              compacto
              onChange={(items) => acciones.updateActividad(item, { checklist: items })} />
          )}

          <Field label="Estado">
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
              {ESTADOS_EJECUCION.map((e) => <option key={e} value={e}>{ESTADOS[e].label}</option>)}
            </select>
          </Field>

          <Field label="Observaciones">
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2}
              placeholder="Notas de campo, avance, hallazgos..." className={`${inputCls} resize-none`} style={inputStyle} />
          </Field>

          {!esPrev && (
            <Field label={esServ ? "Novedades del servicio" : "Resolución"}>
              <textarea value={resolucion} onChange={(e) => setResolucion(e.target.value)} rows={2}
                placeholder={esServ ? "Qué ejecutó el proveedor, hallazgos, pendientes…" : "Qué se hizo para resolverlo"}
                className={`${inputCls} resize-none`} style={inputStyle} />
            </Field>
          )}

          {item.fotoSolicitante && (
            <Field label="Foto del solicitante">
              <img src={item.fotoSolicitante} alt="Reportado por el solicitante" className="rounded-md max-h-40 border" style={bLine} />
            </Field>
          )}
          <FotoUploader foto={item.foto} onChange={(foto) => acciones.updateActividad(item, { foto })}
            label="Evidencia del técnico" carpeta={esPrev ? "ordenes" : esServ ? "servicios" : "solicitudes"} />
          {esPrev && (
            <ConsumoStock item={item} stockSede={stockSede}
              onRegistrar={registrarConsumo} onQuitar={quitarConsumo}
              onAltaArticulo={(nombre, unidad, costo) => acciones.altaArticulo(item.sedeId, nombre, unidad, costo)}
              readOnly={item.estado === "completada"} />
          )}

          {esServ ? (
            <div className="rounded-md p-2.5 flex items-center justify-between gap-2" style={{ background: COLORS.cream }}>
              <span className="text-xs min-w-0" style={cChar}>{item.proveedor || "Sin proveedor"}</span>
              {rol !== "tecnico" && (
                <span className="text-sm font-bold shrink-0" style={cOrange}>{money(costoServicio(item))}</span>
              )}
            </div>
          ) : (
            <MaterialesPanel item={item} rol={rol} onUpdate={(patch) => acciones.updateActividad(item, patch)}
              puedeEnviar={ESTADOS_ABIERTOS.includes(estado)}
              catalogo={stockSede} onAltaArticulo={(nombre, unidad) => acciones.altaArticulo(item.sedeId, nombre, unidad)} />
          )}

          <div className="flex items-center justify-between gap-2">
            <BotonHistorial item={item} data={data} />
            {corrige && !confirmarBorrado && (
              <button onClick={() => setConfirmarBorrado(true)}
                className="text-[10px] font-semibold" style={{ color: COLORS.rojo }}>
                Eliminar actividad
              </button>
            )}
          </div>

          {corrige && confirmarBorrado && (
            <div className="rounded-md p-2.5" style={{ background: `${COLORS.rojo}0D` }}>
              <p className="text-[10px] text-center mb-1.5" style={{ color: COLORS.rojo }}>
                Se borra por completo y no se puede deshacer.
              </p>
              <div className="flex gap-1.5">
                <button onClick={() => setConfirmarBorrado(false)}
                  className="flex-1 py-1.5 rounded-md text-[11px] font-semibold border"
                  style={{ borderColor: COLORS.line, color: COLORS.charcoal }}>
                  Cancelar
                </button>
                <button onClick={() => acciones.eliminarActividad(item)}
                  className="flex-1 py-1.5 rounded-md text-[11px] font-semibold text-white"
                  style={{ background: COLORS.rojo }}>
                  Sí, eliminar
                </button>
              </div>
            </div>
          )}

          {puedeReprogramar && (
            <button onClick={() => setReprogramar(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md border"
              style={{ borderColor: COLORS.ambar, color: COLORS.ambar, background: "white" }}>
              <CalendarDays size={13} /> Reprogramar
            </button>
          )}

          {reprogramar && (
            <Modal title="Reprogramar actividad" onClose={() => setReprogramar(false)} wide>
              <FormReprogramar item={item} data={data} usuario={acciones.usuario}
                onClose={() => setReprogramar(false)}
                onConfirm={({ fechaProgramada, estado: nuevoEstado, registro }) => {
                  acciones.updateActividad(item, {
                    fechaProgramada, estado: nuevoEstado,
                    reprogramaciones: [...(item.reprogramaciones || []), registro],
                  });
                  setEstado(nuevoEstado);
                }} />
            </Modal>
          )}

          <div>
            <button onClick={guardar} disabled={guardado === "ok"}
              className="w-full py-2 rounded-md text-sm font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
              style={{ background: guardado === "ok" ? COLORS.verde : sinGuardar ? COLORS.orange : COLORS.charcoal }}>
              {guardado === "ok"
                ? <><CheckCircle2 size={14} /> Cambios guardados</>
                : sinGuardar ? "Guardar cambios" : "Sin cambios por guardar"}
            </button>
            {sinGuardar && guardado !== "ok" && (
              <p className="text-[10px] mt-1 text-center" style={{ color: COLORS.orange }}>Tienes cambios sin guardar.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Hallazgo de inspección: el técnico levanta un correctivo en sus sedes. */
function VistaTecnico({ data, persist, user, onLogout, ultimaSync }) {
  const acciones = useAcciones(data, persist, user);
  const [tab, setTab] = useState("dashboard");
  const [mes, setMes] = useState(mesKey(fmtDate(new Date())));
  const [hallazgo, setHallazgo] = useState(false);
  const [activar, setActivar] = useState(null);
  const [ejecutar, setEjecutar] = useState(null);   // actividad abierta desde el calendario
  const [msg, setMsg] = useState("");

  const misSedes = sedesVisibles(data, user);
  const misSedeIds = misSedes.map((s) => s.id);
  const pendientes = getPendientes(data).filter((p) => misSedeIds.includes(p.sedeId));

  /* La tarjeta abierta se relee del estado vigente para reflejar lo ya
     guardado (checklist, foto, materiales) sin cerrar el modal. */
  const enEdicion = ejecutar
    ? (ejecutar.tipo === "preventivo" ? data.ordenes.find((o) => o.id === ejecutar.id)
      : ejecutar.tipo === "servicio" ? (data.servicios || []).find((x) => x.id === ejecutar.id)
      : data.solicitudes.find((x) => x.id === ejecutar.id))
    : null;
  const activables = pendientes.filter((p) => p.tipo !== "servicio").length;
  const actividades = actividadesDeTecnico(data, user.id);
  const activas = actividades.filter((a) => a.estado !== "completada");
  const cerradas = actividades.filter((a) => a.estado === "completada");

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={14} /> },
    { id: "sedes", label: "Sedes", icon: <Building2 size={14} /> },
    { id: "programacion", label: `Programación (${activables})`, icon: <CalendarDays size={14} /> },
    { id: "mias", label: `Mis actividades (${activas.length})`, icon: <Wrench size={14} /> },
    { id: "monitoreo", label: "Monitoreo", icon: <BarChart3 size={14} /> },
    { id: "bodega", label: "Bodega", icon: <Layers size={14} /> },
    { id: "reportes", label: "Reportes", icon: <Download size={14} /> },
    { id: "historico", label: "Histórico", icon: <ClipboardList size={14} /> },
  ];

  // El técnico adelanta una actividad pendiente y queda asignada a él
  const activarActividad = (item, tecnicoId, fecha, duracionValor, duracionUnidad) => {
    if (item.tipo === "correctivo") {
      persist((data) => ({
        ...data,
        solicitudes: data.solicitudes.map((x) =>
          x.id === item.solicitudId ? { ...x, tecnicoId, fechaProgramada: fecha, duracionValor, duracionUnidad, estado: "programada" } : x),
      }));
    } else {
      const n = data.otCounter || 1;
      persist((data) => ({
        ...data,
        ordenes: [...data.ordenes, {
          id: uid("ot"), codigo: `OT-${String(n).padStart(4, "0")}`,
          planId: item.planId, tarea: item.tarea, checklist: checklistDesdePasos(item.procedimientoPasos),
          categoria: item.categoria, frecuencia: item.frecuencia,
          duracionValor, duracionUnidad,
          sedeId: item.sedeId, faseId: item.faseId, activoId: item.activoId,
          tecnicoId, fechaProgramada: fecha, fechaCompletada: "",
          estado: "programada", observaciones: "", foto: "",
          materiales: [], materialesEstado: "", consumos: [], createdAt: fmtDate(new Date()),
        }],
        otCounter: n + 1,
      }));
    }
    setMsg("Actividad activada y asignada a ti. Ya aparece en el calendario.");
    setTimeout(() => setMsg(""), 4000);
  };

  const crearHallazgo = (form) => {
    const now = new Date();
    const n = data.solCounter || 1;
    const nueva = {
      id: uid("sol"), codigo: `SOL-${String(n).padStart(4, "0")}`,
      sedeId: form.sedeId, faseId: form.faseId, activoId: form.activoId,
      descripcion: form.descripcion, criticidad: form.criticidad || "",
      solicitanteId: form.solicitanteId || user.id, fecha: fmtDate(now), hora: fmtHora(now),
      estado: "pendiente", tecnicoId: "", fechaProgramada: "", fechaCompletada: "",
      observaciones: "", foto: "", fotoSolicitante: form.foto || "", resolucion: "",
      materiales: [], materialesEstado: "", consumos: [], reprogramaciones: [],
      calificacion: 0, comentarioCalif: "",
    };
    persist((data) => ({ ...data, solicitudes: [nueva, ...data.solicitudes], solCounter: n + 1 }));
    setMsg(`Novedad ${nueva.codigo} reportada. Queda pendiente de programación.`);
    setTimeout(() => setMsg(""), 4000);
  };

  return (
   <ProveedorDetalle data={data}>
    <div className="max-w-4xl mx-auto px-4 pb-16">
      <AppHeader user={user} onLogout={onLogout} ultimaSync={ultimaSync} sedesTexto={`${misSedes.length} sede${misSedes.length === 1 ? "" : "s"}`} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {msg && (
        <div className="mt-3 text-sm rounded-md p-3 flex items-center gap-2" style={{ background: `${COLORS.verde}15`, color: COLORS.verde }}>
          <CheckCircle2 size={16} /> {msg}
        </div>
      )}

      {tab === "dashboard" && <Dashboard data={data} persist={persist} sedes={misSedes} mes={mes} onMesChange={setMes} mostrarPresupuesto mostrarSatisfaccion />}

      {tab === "mias" && (
        <div className="mt-4">
          <button onClick={() => setHallazgo(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-md border mb-3"
            style={{ borderColor: COLORS.orange, color: COLORS.orange, background: "white" }}>
            <Plus size={14} /> Reportar novedad
          </button>
          <TecnicoMisActividades data={data} persist={persist} user={user} misSedeIds={misSedeIds} />
        </div>
      )}

      {tab === "bodega" && <VistaBodega data={data} persist={persist} sedes={misSedes} editable={false} />}
      {tab === "sedes" && (
        <AdminSedes data={{ ...data, sedes: misSedes }} persist={persist} editable={false} />
      )}
      {tab === "monitoreo" && <VistaMonitoreo data={{ ...data, sedes: misSedes }} />}
      {tab === "reportes" && <VistaReportes data={data} sedes={misSedes} user={user} />}
      {tab === "historico" && <VistaHistorico data={data} sedes={misSedes} rol="tecnico" />}

      {tab === "programacion" && (
        <PanelProgramacion data={data} sedes={misSedes} pendientes={pendientes} onActivar={setActivar}
          tecnicoDefault={user.id} onEditar={setEjecutar} ocultarCosto
          nota="Sin programar en tus sedes. Al activar una queda asignada a ti y aparece en el calendario." />
      )}

      {activar && (
        <Modal title="Adelantar actividad" onClose={() => setActivar(null)}>
          <FormActivar item={activar} data={data} soloTecnico={user}
            onConfirm={({ tecnicoId, fecha, duracionValor, duracionUnidad }) => { activarActividad(activar, tecnicoId, fecha, duracionValor, duracionUnidad); setActivar(null); }}
            onClose={() => setActivar(null)} />
        </Modal>
      )}

      {enEdicion && (
        <Modal title={`Ejecutar ${enEdicion.codigo}`} onClose={() => setEjecutar(null)} wide>
          <TarjetaActividad
            item={{
              ...enEdicion,
              tipo: ejecutar.tipo,
              tarea: ejecutar.tipo === "correctivo" ? enEdicion.descripcion
                : ejecutar.tipo === "servicio" ? enEdicion.trabajo : enEdicion.tarea,
              fechaProgramada: ejecutar.tipo === "servicio" ? enEdicion.fecha : enEdicion.fechaProgramada,
            }}
            data={data} acciones={acciones} rol="tecnico" abiertoInicial />
        </Modal>
      )}

      {hallazgo && (
        <ModalReportarNovedad data={data} sedes={misSedes} user={user}
          onSubmit={crearHallazgo} onClose={() => setHallazgo(false)} />
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
      <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onClick={(e) => e.stopPropagation()}
        onBlur={() => { const v = val.trim(); if (v) onSave(v); else setVal(value); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setVal(value); setEditing(false); } }}
        className="border rounded px-1.5 py-0.5 text-sm outline-none w-full" style={{ borderColor: COLORS.orange, ...style }} />
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 cursor-text ${className}`} style={style}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }} title="Toca para renombrar">
      {value}<Pencil size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
    </span>
  );
}

function InlineAdd({ placeholder, onAdd, small }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const submit = () => { if (value.trim()) onAdd(value.trim()); setValue(""); setEditing(false); };

  if (!editing) {
    return (
      <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className={`flex items-center gap-1.5 font-semibold ${small ? "text-[11px] py-1" : "text-xs py-2"}`} style={cOrange}>
        <Plus size={small ? 12 : 14} /> {placeholder}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setValue(""); setEditing(false); } }}
        placeholder={placeholder} className="flex-1 border rounded px-2 py-1 text-xs outline-none" style={{ borderColor: COLORS.orange }} />
      <button onClick={submit} className="text-xs font-semibold px-2 py-1 rounded text-white shrink-0" style={{ background: COLORS.orange }}>OK</button>
      <button onClick={() => { setEditing(false); setValue(""); }} className="shrink-0"><X size={14} color={COLORS.slate} /></button>
    </div>
  );
}

function DeleteBtn({ onConfirm, size = 13 }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button onClick={(e) => { e.stopPropagation(); setAsk(true); }} className="shrink-0 opacity-50 hover:opacity-100"><Trash2 size={size} color={COLORS.slate} /></button>;
  return (
    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <button onClick={onConfirm} className="text-[9px] font-semibold px-1.5 py-1 rounded text-white" style={{ background: COLORS.rojo }}>Sí</button>
      <button onClick={() => setAsk(false)} className="text-[9px] font-semibold" style={cSlate}>No</button>
    </div>
  );
}

/* Ficha de la sede: datos maestros que alimentan presupuesto y costo/estudiante. */
function FormSede({ initial, onSave, onClose }) {
  const [nombre, setNombre] = useState(initial?.nombre || "");
  const [estudiantes, setEstudiantes] = useState(initial?.estudiantes ?? "");
  const [presupuesto, setPresupuesto] = useState(initial?.presupuestoPreventivo ?? PRESUPUESTO_MENSUAL_SEDE);
  const [fee, setFee] = useState(initial?.feeServicio ?? "");
  const [constructor, setConstructor] = useState(initial?.constructor || "");
  const [foto, setFoto] = useState(initial?.foto || "");
  const est = Number(estudiantes) || 0;

  return (
    <div className="space-y-3">
      <FotoUploader foto={foto} onChange={setFoto} carpeta="Asset/sedes" label="Foto de la sede" />

      <Field label="Nombre de la sede">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Quitumbe" className={inputCls} style={inputStyle} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="N° de estudiantes">
          <input type="number" min="0" value={estudiantes} onChange={(e) => setEstudiantes(e.target.value)} placeholder="0" className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Presupuesto materiales (USD/mes)">
          <input type="number" min="0" step="0.01" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="100" className={inputCls} style={inputStyle} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Fee de servicio (USD/mes)">
          <input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="450" className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Constructor">
          <input value={constructor} onChange={(e) => setConstructor(e.target.value)} placeholder="Constructora" className={inputCls} style={inputStyle} />
        </Field>
      </div>

      {est > 0 && (
        <p className="text-[10px] rounded-md p-2" style={{ background: COLORS.cream, color: COLORS.slate }}>
          Base fija: fee {money(fee)} ÷ {est} estudiantes = <strong>{money((Number(fee) || 0) / est)}</strong> por estudiante al mes.
        </p>
      )}

      <button disabled={!nombre.trim()}
        onClick={() => {
          onSave({
            nombre: nombre.trim(),
            estudiantes: Number(estudiantes) || 0,
            presupuestoPreventivo: Number(presupuesto) || 0,
            feeServicio: Number(fee) || 0,
            constructor: constructor.trim(),
            foto,
          });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40" style={{ background: COLORS.orange }}>
        {initial ? "Guardar cambios" : "Crear sede"}
      </button>
    </div>
  );
}

/* Miniatura de foto para usar inline en filas compactas (fila de fase o de
   activo), donde el Field completo de FotoUploader no cabe. Mismo mecanismo
   de subida (comprimir + Storage), solo que el control es un cuadrito con
   la imagen o un ícono de cámara. */
function FotoMini({ foto, onChange, carpeta, size = 36, editable = true }) {
  const inputRef = useRef(null);
  const [cargando, setCargando] = useState(false);
  const [ampliada, setAmpliada] = useState(false);

  const subir = async (file) => {
    if (!file) return;
    setCargando(true);
    try {
      const blob = await comprimirImagen(file);
      const ruta = `${carpeta}/${uid("foto")}.jpg`;
      onChange(await uploadFile(ruta, blob));
    } catch (err) {
      console.error("[foto mini]", err);
    } finally {
      setCargando(false);
    }
  };

  if (!editable && !foto) return null;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (foto) setAmpliada(true);
          else if (editable) inputRef.current?.click();
        }}
        disabled={cargando}
        title={foto ? "Ver foto" : editable ? "Agregar foto" : undefined}
        className="rounded-md border overflow-hidden flex items-center justify-center disabled:opacity-50"
        style={{ width: size, height: size, borderColor: COLORS.line, background: foto ? "transparent" : COLORS.paper }}>
        {foto ? <img src={foto} alt="" className="w-full h-full object-cover" /> : editable ? <Camera size={13} color={COLORS.slate} /> : null}
      </button>

      {editable && foto && !cargando && (
        <>
          <button onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            title="Cambiar foto"
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border flex items-center justify-center" style={bLine}>
            <Pencil size={8} color={COLORS.orange} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onChange(""); }}
            title="Quitar foto"
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border flex items-center justify-center" style={bLine}>
            <X size={9} color={COLORS.rojo} />
          </button>
        </>
      )}

      {editable && (
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; subir(f); }} />
      )}

      {ampliada && foto && <ImagenAmpliada src={foto} onClose={() => setAmpliada(false)} />}
    </div>
  );
}

/* Intercambia un elemento con su vecino (arriba o abajo) para reordenar
   visualmente sedes/fases/activos. dir: -1 sube, +1 baja. */
function moverEnArray(arr, index, dir) {
  const destino = index + dir;
  if (destino < 0 || destino >= arr.length) return arr;
  const copia = [...arr];
  [copia[index], copia[destino]] = [copia[destino], copia[index]];
  return copia;
}

function BotonesMover({ index, total, onMover }) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <button onClick={(e) => { e.stopPropagation(); onMover(-1); }} disabled={index === 0}
        title="Subir" className="w-5 h-4 flex items-center justify-center rounded disabled:opacity-25" style={{ background: COLORS.paper }}>
        <ChevronUp size={11} color={COLORS.slate} />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onMover(1); }} disabled={index === total - 1}
        title="Bajar" className="w-5 h-4 flex items-center justify-center rounded disabled:opacity-25" style={{ background: COLORS.paper }}>
        <ChevronDown size={11} color={COLORS.slate} />
      </button>
    </div>
  );
}

function AdminSedes({ data, persist, editable = true }) {
  const [abiertas, setAbiertas] = useState({});
  const [qr, setQr] = useState(null);
  const [fichaSede, setFichaSede] = useState(null);
  const toggle = (id) => setAbiertas((p) => ({ ...p, [id]: !p[id] }));

  const setSedes = (sedes) => persist((data) => ({ ...data, sedes }));
  const mapSede = (sedeId, fn) => setSedes(data.sedes.map((s) => (s.id === sedeId ? fn(s) : s)));
  const mapFase = (sedeId, faseId, fn) => mapSede(sedeId, (s) => ({ ...s, fases: s.fases.map((f) => (f.id === faseId ? fn(f) : f)) }));

  const resumen = (sedeId, faseId, activoId) => {
    const match = (x) => x.sedeId === sedeId && (!faseId || x.faseId === faseId) && (!activoId || x.activoId === activoId);
    const prev = data.planes.filter((p) => (p.aplicaciones || []).some(match)).length;
    const cor = data.solicitudes.filter(match);
    return { prev, cor: cor.length, abiertas: cor.filter((c) => c.estado === "pendiente").length };
  };

  const Resumen = ({ r }) => (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
      <Chip><Wrench size={9} /> {r.prev} prev.</Chip>
      <Chip color={r.abiertas > 0 ? COLORS.rojo : COLORS.slate}>
        <AlertTriangle size={9} /> {r.cor} correc.{r.abiertas > 0 ? ` · ${r.abiertas} sin programar` : ""}
      </Chip>
    </div>
  );

  const qrUrl = qr ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`https://industria-me.net/?activo=${qr.activoId}`)}` : null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs mb-1" style={cSlate}>
        {editable
          ? "Cada sede guarda su ficha (estudiantes, presupuesto de materiales, fee de servicio y constructor) y su árbol de fases y activos."
          : "Sedes, fases y activos de tu alcance, con sus actividades registradas."}
      </p>
      {data.sedes.map((sede, iSede) => {
        const abierta = !!abiertas[sede.id];
        return (
          <div key={sede.id} className="border rounded-md overflow-hidden" style={cardStyle}>
            <div className="flex items-center gap-2.5 p-3" style={{ background: abierta ? COLORS.cream : "white" }}>
              {editable && (
                <BotonesMover index={iSede} total={data.sedes.length}
                  onMover={(dir) => setSedes(moverEnArray(data.sedes, iSede, dir))} />
              )}
              <button onClick={() => toggle(sede.id)} className="shrink-0">
                {abierta ? <ChevronDown size={16} color={COLORS.charcoal} /> : <ChevronRight size={16} color={COLORS.charcoal} />}
              </button>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sedeColor(data.sedes, sede.id) }} />
              <FotoMini foto={sede.foto} editable={false} size={36} />
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggle(sede.id)}>
                <p className="text-sm font-bold" style={cChar}>{sede.nombre}</p>
                {editable && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <Chip><Users size={9} /> {sede.estudiantes || 0} est.</Chip>
                    <Chip color={COLORS.orange}>{money(sede.presupuestoPreventivo)}/mes mat.</Chip>
                    <Chip color={COLORS.verde}>fee {money(sede.feeServicio)}</Chip>
                  </div>
                )}
                <Resumen r={resumen(sede.id)} />
              </div>
              {editable && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setFichaSede({ sede }); }} title="Editar ficha de la sede">
                    <Pencil size={14} color={COLORS.slate} />
                  </button>
                  <DeleteBtn size={14} onConfirm={() => setSedes(data.sedes.filter((s) => s.id !== sede.id))} />
                </>
              )}
            </div>

            {abierta && (
              <div className="pl-4 pr-3 pb-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
                {sede.fases.map((fase, iFase) => (
                  <FaseAdmin key={fase.id} sede={sede} fase={fase} resumen={resumen} Resumen={Resumen}
                    mapFase={mapFase} mapSede={mapSede} setQr={setQr} editable={editable}
                    index={iFase} total={sede.fases.length}
                    onMover={(dir) => mapSede(sede.id, (s) => ({ ...s, fases: moverEnArray(s.fases, iFase, dir) }))} />
                ))}
                {sede.fases.length === 0 && <Empty>Esta sede aún no tiene fases.</Empty>}
                {editable && (
                  <div className="mt-2">
                    <InlineAdd placeholder="Agregar fase"
                      onAdd={(nombre) => mapSede(sede.id, (s) => ({ ...s, fases: [...s.fases, { id: uid("fase"), nombre, activos: [] }] }))} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {editable && (
        <button onClick={() => setFichaSede({})} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white mt-1" style={{ background: COLORS.orange }}>
          <Plus size={13} /> Nueva sede
        </button>
      )}

      {fichaSede && (
        <Modal title={fichaSede.sede ? "Ficha de la sede" : "Nueva sede"} onClose={() => setFichaSede(null)} wide>
          <FormSede initial={fichaSede.sede} onClose={() => setFichaSede(null)}
            onSave={(f) => fichaSede.sede
              ? mapSede(fichaSede.sede.id, (s) => ({ ...s, ...f }))
              : setSedes([...data.sedes, { id: uid("sede"), ...f, fases: [] }])} />
        </Modal>
      )}

      {qr && (
        <Modal title="Código QR del activo" onClose={() => setQr(null)}>
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold" style={cChar}>{qr.activoNombre}</p>
            <p className="text-xs" style={cSlate}>{qr.sedeNombre} · {qr.faseNombre}</p>
            <img src={qrUrl} alt="QR" className="mx-auto rounded border" style={bLine} />
            <p className="text-xs" style={cSlate}>
              Imprime y pega este QR en el activo. Al escanearlo, el solicitante abre el formulario ya ubicado.
            </p>
            <a href={qrUrl} download={`qr-${qr.activoNombre}.png`} className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-md text-white" style={{ background: COLORS.charcoal }}>
              <Download size={13} /> Descargar QR
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FaseAdmin({ sede, fase, resumen, Resumen, mapFase, mapSede, setQr, editable = true, index, total, onMover }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-l-2 pl-3 mt-2" style={bLine}>
      <div className="flex items-center justify-between py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={() => setOpen(!open)}>
          {editable && onMover && <BotonesMover index={index} total={total} onMover={onMover} />}
          {open ? <ChevronDown size={14} color={COLORS.slate} /> : <ChevronRight size={14} color={COLORS.slate} />}
          <Layers size={13} color={COLORS.orange} />
          <FotoMini foto={fase.foto} carpeta="Asset/fases" size={30} editable={editable}
            onChange={(foto) => mapFase(sede.id, fase.id, (f) => ({ ...f, foto }))} />
          <div className="min-w-0">
            {editable ? (
              <EditableLabel value={fase.nombre} className="text-sm font-semibold block" style={cChar}
                onSave={(nombre) => mapFase(sede.id, fase.id, (f) => ({ ...f, nombre }))} />
            ) : (
              <p className="text-sm font-semibold" style={cChar}>{fase.nombre}</p>
            )}
            <Resumen r={resumen(sede.id, fase.id)} />
          </div>
        </div>
        {editable && (
          <DeleteBtn onConfirm={() => mapSede(sede.id, (s) => ({ ...s, fases: s.fases.filter((f) => f.id !== fase.id) }))} />
        )}
      </div>

      {open && (
        <div className="pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={cSlate}>Activos</p>
          <div className="space-y-2">
            {fase.activos.map((act, iAct) => (
              <div key={act.id} className="rounded-md p-2.5 border flex items-center justify-between gap-3" style={{ borderColor: COLORS.line, background: COLORS.paper }}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {editable && (
                    <BotonesMover index={iAct} total={fase.activos.length}
                      onMover={(dir) => mapFase(sede.id, fase.id, (f) => ({ ...f, activos: moverEnArray(f.activos, iAct, dir) }))} />
                  )}
                  <FotoMini foto={act.foto} carpeta="Asset/activos" size={30} editable={editable}
                    onChange={(foto) => mapFase(sede.id, fase.id, (f) => ({ ...f, activos: f.activos.map((a) => (a.id === act.id ? { ...a, foto } : a)) }))} />
                  <div className="min-w-0 flex-1">
                    {editable ? (
                      <EditableLabel value={act.nombre} className="text-xs font-semibold" style={cChar}
                        onSave={(nombre) => mapFase(sede.id, fase.id, (f) => ({ ...f, activos: f.activos.map((a) => (a.id === act.id ? { ...a, nombre } : a)) }))} />
                    ) : (
                      <p className="text-xs font-semibold" style={cChar}>{act.nombre}</p>
                    )}
                    <Resumen r={resumen(sede.id, fase.id, act.id)} />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setQr({ activoId: act.id, activoNombre: act.nombre, sedeNombre: sede.nombre, faseNombre: fase.nombre })}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded flex items-center gap-1" style={{ background: COLORS.charcoal, color: "white" }}>
                    <QrCode size={11} /> QR
                  </button>
                  {editable && (
                    <DeleteBtn onConfirm={() => mapFase(sede.id, fase.id, (f) => ({ ...f, activos: f.activos.filter((a) => a.id !== act.id) }))} />
                  )}
                </div>
              </div>
            ))}
            {fase.activos.length === 0 && <Empty>Sin activos todavía.</Empty>}
          </div>
          {editable && (
            <div className="mt-2">
              <InlineAdd placeholder="Agregar activo" small
                onAdd={(nombre) => mapFase(sede.id, fase.id, (f) => ({ ...f, activos: [...f.activos, { id: uid("act"), nombre }] }))} />
            </div>
          )}
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
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={cSlate}>Ubicación {index + 1}</span>
        {canRemove && <button onClick={() => onRemove(row.id)}><X size={14} color={COLORS.slate} /></button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Sede">
          <select value={row.sedeId} onChange={(e) => onChange(row.id, { sedeId: e.target.value, faseId: TODO, activoId: TODO, fechaInicial: "" })}
            className="w-full border rounded-md px-2 py-1.5 text-xs" style={inputStyle}>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Field>
        <Field label="Fase">
          <select value={row.faseId} onChange={(e) => onChange(row.id, { faseId: e.target.value, activoId: TODO, fechaInicial: "" })}
            className="w-full border rounded-md px-2 py-1.5 text-xs" style={inputStyle}>
            <option value={TODO}>Toda la sede</option>
            {(sede?.fases || []).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </Field>
      </div>
      {faseEsp && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Field label="Activo">
            <select value={row.activoId}
              onChange={(e) => onChange(row.id, { activoId: e.target.value, fechaInicial: e.target.value !== TODO ? (row.fechaInicial || fmtDate(new Date())) : "" })}
              className="w-full border rounded-md px-2 py-1.5 text-xs" style={inputStyle}>
              <option value={TODO}>Toda la fase</option>
              {(fase?.activos || []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </Field>
          {activoEsp && (
            <Field label="Fecha inicial">
              <input type="date" value={row.fechaInicial} onChange={(e) => onChange(row.id, { fechaInicial: e.target.value })}
                className="w-full border rounded-md px-2 py-1.5 text-xs" style={inputStyle} />
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
  const [pasos, setPasos] = useState(initial?.procedimientoPasos || []);
  const [categoria, setCategoria] = useState(initial?.categoria || categorias[0] || "");
  const [nuevaCat, setNuevaCat] = useState(null);
  const [frecuencia, setFrecuencia] = useState(initial?.frecuencia || FRECUENCIAS[0]);
  const [durVal, setDurVal] = useState(initial?.duracionValor ?? 30);
  const [durUni, setDurUni] = useState(initial?.duracionUnidad || "minutos");
  const [monitoreo, setMonitoreo] = useState(initial?.monitoreo || false);

  const emptyRow = () => ({ id: uid("row"), sedeId: data.sedes[0]?.id || "", faseId: TODO, activoId: TODO, fechaInicial: "" });
  const [rows, setRows] = useState(
    initial?.aplicaciones?.length
      ? initial.aplicaciones.map((a) => ({ id: uid("row"), sedeId: a.sedeId, faseId: a.faseId || TODO, activoId: a.activoId || TODO, fechaInicial: a.fechaInicial || "" }))
      : [emptyRow()]
  );

  const submit = () => {
    onSave({
      id: initial?.id || uid("plan"),
      tarea: tarea.trim(), procedimientoPasos: pasos.filter((p) => p.texto.trim()), categoria, frecuencia,
      duracionValor: Number(durVal) || 0, duracionUnidad: durUni, monitoreo,
      aplicaciones: rows.filter((r) => r.sedeId).map((r) => ({
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
        <input value={tarea} onChange={(e) => setTarea(e.target.value)} placeholder="Ej. Revisión de luminarias" className={inputCls} style={inputStyle} />
      </Field>

      <Field label="Procedimiento"
        hint="Cada paso define qué debe registrar el técnico en campo: una instrucción, una casilla, un valor con unidad, un Sí/No o un estado.">
        <EditorProcedimiento pasos={pasos} onChange={setPasos} />
      </Field>

      <Field label="Categoría">
        {nuevaCat === null ? (
          <select value={categoria} onChange={(e) => (e.target.value === "__NEW__" ? setNuevaCat("") : setCategoria(e.target.value))}
            className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__NEW__">+ Nueva categoría…</option>
          </select>
        ) : (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setNuevaCat(null); }}
              placeholder="Nombre de la categoría" className={inputCls} style={{ borderColor: COLORS.orange }} />
            <button onClick={() => { const v = nuevaCat.trim().toUpperCase(); if (v) { onAddCategoria(v); setCategoria(v); } setNuevaCat(null); }}
              className="text-xs font-semibold px-2.5 py-2 rounded-md text-white shrink-0" style={{ background: COLORS.orange }}>OK</button>
            <button onClick={() => setNuevaCat(null)} className="shrink-0"><X size={16} color={COLORS.slate} /></button>
          </div>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Frecuencia">
          <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
            {FRECUENCIAS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Duración aprox.">
          <div className="flex gap-1.5">
            <input type="number" min="0" value={durVal} onChange={(e) => setDurVal(e.target.value)}
              className="w-16 border rounded-md px-2 py-2 text-sm outline-none" style={inputStyle} />
            <select value={durUni} onChange={(e) => setDurUni(e.target.value)} className="flex-1 border rounded-md px-2 py-2 text-sm" style={inputStyle}>
              {DURACION_UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </Field>
      </div>

      <Field label="Monitoreo de condición"
        hint="Actívalo si este plan aplica a activos críticos que quieres seguir en el tiempo (ej. cuarto de bombas, generador, transformador). No lo actives en planes de rutina que no requieren seguimiento (ej. un salón de clases).">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={monitoreo} onChange={(e) => setMonitoreo(e.target.checked)}
            className="w-4 h-4" />
          Incluir los activos de este plan en el panel de monitoreo
        </label>
      </Field>

      <div className="border-t pt-3" style={bLine}>
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>¿Dónde aplica?</p>
        <p className="text-[10px] mb-2" style={cSlate}>
          Una fila por ubicación; pueden ser de sedes distintas. La fecha inicial solo aplica al elegir un activo específico.
        </p>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <FilaAplicacion key={row.id} row={row} index={i} sedes={data.sedes} canRemove={rows.length > 1}
              onChange={(id, patch) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))}
              onRemove={(id) => setRows((p) => p.filter((r) => r.id !== id))} />
          ))}
        </div>
        <button onClick={() => setRows((p) => [...p, emptyRow()])} className="flex items-center gap-1.5 text-xs font-semibold mt-2" style={cOrange}>
          <Plus size={13} /> Agregar ubicación
        </button>
      </div>

      <button disabled={!tarea.trim()} onClick={submit}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40" style={{ background: COLORS.orange }}>
        {initial ? "Guardar cambios" : "Crear plan"}
      </button>
    </div>
  );
}

function TarjetaPlan({ plan, sedes, onEdit, onDelete }) {
  const [verProc, setVerProc] = useState(false);
  const [verUbic, setVerUbic] = useState(false);
  const dur = DURACION_UNIDADES.find(([v]) => v === plan.duracionUnidad)?.[1] || plan.duracionUnidad;
  const aps = plan.aplicaciones || [];
  const resumenUbic = aps.length === 1 ? ubicacionTexto(sedes, aps[0]) : `${aps.length} ubicaciones`;

  return (
    <div className="border rounded-md p-3" style={cardStyle}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={cChar}>{plan.tarea}</p>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {plan.categoria && <Chip color={COLORS.orange}>{plan.categoria}</Chip>}
            {plan.monitoreo && <Chip color={COLORS.azul || COLORS.orange}>📈 Monitoreo</Chip>}
          </div>
          <p className="text-xs mt-1" style={cSlate}>{resumenUbic}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Chip>{plan.frecuencia}</Chip>
            {plan.duracionValor ? <Chip>~{plan.duracionValor} {dur}</Chip> : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onEdit}><Pencil size={13} color={COLORS.slate} /></button>
          <DeleteBtn onConfirm={onDelete} />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {(plan.procedimientoPasos || []).length > 0 && (
          <button onClick={() => setVerProc(!verProc)} className="flex items-center gap-1 text-[11px] font-semibold" style={cOrange}>
            {verProc ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Procedimiento ({plan.procedimientoPasos.length} pasos)
          </button>
        )}
        {aps.length > 0 && (
          <button onClick={() => setVerUbic(!verUbic)} className="flex items-center gap-1 text-[11px] font-semibold" style={cOrange}>
            {verUbic ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Activos relacionados ({aps.length})
          </button>
        )}
      </div>

      {verProc && (
        <div className="mt-2 pt-2.5" style={{ borderTop: `1px solid ${COLORS.line}` }}>
          <ChecklistEjecucion items={plan.procedimientoPasos} readOnly compacto />
        </div>
      )}
      {verUbic && (
        <div className="mt-2 pt-2.5 space-y-1" style={{ borderTop: `1px solid ${COLORS.line}` }}>
          {aps.map((ap, i) => (
            <div key={i} className="flex items-center justify-between text-xs gap-2">
              <span className="min-w-0 truncate" style={cChar}>{ubicacionTexto(sedes, ap)}</span>
              {ap.fechaInicial && <span className="font-semibold shrink-0" style={cOrange}>{ap.fechaInicial}</span>}
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
  const tecnicos = soloTecnico ? [soloTecnico] : tecnicosDeSede(data.usuarios, item.sedeId);
  const [tecnicoId, setTecnicoId] = useState(tecnicos[0]?.id || "");
  const [fecha, setFecha] = useState(item.fechaInicial || fmtDate(new Date()));
  const esPrev = item.tipo === "preventivo";
  // El preventivo hereda la duración de su plan; el correctivo se estima aquí
  const [durValor, setDurValor] = useState(item.duracionValor ?? 60);
  const [durUnidad, setDurUnidad] = useState(item.duracionUnidad || "minutos");
  const sem = semaforoDe(item);

  return (
    <div className="space-y-3">
      <div className="rounded-md p-3" style={{ background: COLORS.cream }}>
        <div className="flex items-center gap-1.5 mb-1"><TipoChip tipo={item.tipo} />{item.codigo && <span className="text-[10px] font-bold" style={cChar}>{item.codigo}</span>}</div>
        <p className="text-sm font-semibold" style={cChar}>{item.tarea}</p>
        <p className="text-xs" style={cSlate}>{ubicacionTexto(data.sedes, item)}</p>
        {esPrev ? (
          <p className="text-xs mt-1.5 flex items-center gap-1.5" style={cSlate}>
            Último mantenimiento: <span className="font-semibold" style={cChar}>{item.ultimoMantenimiento || "sin registro previo"}</span>
            <Semaforo item={item} showLabel />
          </p>
        ) : (
          <p className="text-xs mt-1.5" style={cSlate}>
            Solicitó <span className="font-semibold" style={cChar}>{usuarioNombre(data.usuarios, item.solicitanteId)}</span> · {item.fecha} {item.hora}
          </p>
        )}
      </div>

      {item.fotoSolicitante && (
        <Field label="Foto del solicitante">
          <img src={item.fotoSolicitante} alt="Reportado por el solicitante"
            className="rounded-md max-h-48 border w-full object-contain" style={bLine} />
        </Field>
      )}

      {soloTecnico ? (
        <div className="text-xs rounded-md p-2.5" style={{ background: COLORS.cream, color: COLORS.slate }}>
          Quedará asignada a <span className="font-semibold" style={cChar}>{soloTecnico.nombre}</span>.
        </div>
      ) : (
        <Field label="Técnico asignado" hint={tecnicos.length === 0 ? "No hay técnicos con esta sede a cargo. Asígnala en Configuración → Usuarios." : `Técnicos con ${sedeNombre(data.sedes, item.sedeId)} a cargo.`}>
          <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
            {tecnicos.length === 0 && <option value="">Sin técnicos disponibles</option>}
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Fecha programada">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Tiempo estimado" hint={esPrev ? "Viene del plan; puedes ajustarlo." : "Cuánto tomará atender la solicitud."}>
          <div className="flex gap-1.5">
            <input type="number" min="0" value={durValor} onChange={(e) => setDurValor(e.target.value)}
              className="w-16 border rounded-md px-2 py-2 text-sm outline-none" style={inputStyle} />
            <select value={durUnidad} onChange={(e) => setDurUnidad(e.target.value)}
              className="flex-1 border rounded-md px-1 py-2 text-sm" style={inputStyle}>
              {DURACION_UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </Field>
      </div>

      <button disabled={!tecnicoId}
        onClick={() => { onConfirm({ tecnicoId, fecha, duracionValor: Number(durValor) || 0, duracionUnidad: durUnidad }); onClose(); }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
        style={{ background: esPrev ? COLORS.orange : COLORS.charcoal }}>
        {soloTecnico ? "Programar" : esPrev ? "Crear orden de trabajo" : "Programar atención"}
      </button>
    </div>
  );
}

function TarjetaAgenda({ act, data, onEditar, ocultarCosto }) {
  const esServicio = act.tipo === "servicio";
  const esPrev = act.tipo === "preventivo";
  const ver = useDetalle();
  const editable = !!onEditar;
  return (
    <div onClick={() => ver(act)} title="Ver detalle completo"
      className="border rounded-md p-2.5 cursor-pointer hover:shadow-sm transition-shadow"
      style={{ ...cardStyle, borderLeft: `3px solid ${tipoMeta(act.tipo).color}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TipoChip tipo={act.tipo} />
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0" style={{ background: sedeColor(data.sedes, act.sedeId) }}>{act.codigo}</span>
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <EstadoChip estado={act.estado} />
          {editable && (
            <button onClick={(e) => { e.stopPropagation(); onEditar(act); }} title="Ejecutar o editar esta orden">
              <Pencil size={13} color={COLORS.orange} />
            </button>
          )}
          <Info size={13} color={COLORS.slate} />
        </span>
      </div>
      <p className="text-xs font-semibold mt-1" style={cChar}>{act.tarea}</p>
      <p className="text-[10px] mt-0.5" style={cSlate}>{ubicacionTexto(data.sedes, act)}</p>
      {minutosDe(act) > 0 && (
        <p className="text-[10px] mt-1 flex items-center gap-1 font-semibold" style={cOrange}>
          <Clock size={10} /> {cargaTexto(minutosDe(act))}
          {act.estado === "completada" ? <span style={cSlate}>· ejecutada</span> : <span style={cSlate}>· estimado</span>}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="text-[10px] min-w-0 truncate" style={cSlate}>
          {esServicio
            ? (act.proveedor || "Sin proveedor")
            : usuarioNombre(data.usuarios, act.tecnicoId)}
          {!esPrev && !esServicio && act.solicitanteId ? ` · Solicitó: ${usuarioNombre(data.usuarios, act.solicitanteId)}` : ""}
        </p>
        {esServicio && !ocultarCosto && costoServicio(act) > 0 && (
          <span className="text-[10px] font-bold shrink-0" style={cOrange}>{money(costoServicio(act))}</span>
        )}
      </div>
    </div>
  );
}

/* Minutos estimados de una actividad, para poder sumar la carga de un día. */
function minutosDe(a) {
  const v = Number(a?.duracionValor) || 0;
  if (!v) return 0;
  const u = a.duracionUnidad || "minutos";
  return u === "horas" ? v * 60 : u === "dias" ? v * 480 : v;   // jornada = 8 h
}

/* Formato corto de una carga en minutos: 45m · 2h · 2h 30m */
function cargaTexto(min) {
  if (!min) return "";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* Calendario mensual de la agenda. Se puede acotar a un grupo de sedes
   (técnico) y preseleccionar un responsable para que vea primero lo suyo. */
function Calendario({ data, sedes, tecnicoDefault, onEditar, ocultarCosto }) {
  const sedesVista = sedes || data.sedes;
  const sedeIds = sedesVista.map((s) => s.id);

  const [ancla, setAncla] = useState(new Date());
  const [fSede, setFSede] = useState("todas");
  const [fTecnico, setFTecnico] = useState(tecnicoDefault || "todos");
  const [fTipo, setFTipo] = useState("todos");
  const [diaModal, setDiaModal] = useState(null);

  const agenda = useMemo(() => {
    const enAlcance = (x) => sedeIds.includes(x.sedeId);
    const pre = data.ordenes.filter(enAlcance).map((o) => ({ ...o, tipo: "preventivo" }));
    const cor = data.solicitudes.filter((s) => s.fechaProgramada && enAlcance(s)).map((s) => ({ ...s, tipo: "correctivo", tarea: s.descripcion }));
    // Los servicios externos se agendan por su fecha programada
    const srv = (data.servicios || []).filter((x) => x.fecha && enAlcance(x)).map((x) => ({
      ...x, tipo: "servicio", tarea: x.trabajo, fechaProgramada: x.fecha, tecnicoId: "",
    }));
    return [...pre, ...cor, ...srv];
  }, [data.ordenes, data.solicitudes, data.servicios, sedeIds.join(",")]);

  const tecnicos = data.usuarios.filter((u) => u.rol === "tecnico");

  const filtrada = agenda.filter((a) =>
    (fSede === "todas" || a.sedeId === fSede) &&
    (fTecnico === "todos" || a.tecnicoId === fTecnico) &&
    (fTipo === "todos" || a.tipo === fTipo)
  );

  const porFecha = useMemo(() => {
    const m = {};
    filtrada.forEach((a) => { if (a.fechaProgramada) (m[a.fechaProgramada] = m[a.fechaProgramada] || []).push(a); });
    return m;
  }, [filtrada]);

  const shift = (d) => { const n = new Date(ancla); n.setMonth(n.getMonth() + d); setAncla(n); };

  const semanas = useMemo(() => {
    const y = ancla.getFullYear(), m = ancla.getMonth();
    const inicio = (new Date(y, m, 1).getDay() + 6) % 7;
    const dias = new Date(y, m + 1, 0).getDate();
    const cells = Array(inicio).fill(null);
    for (let d = 1; d <= dias; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [ancla]);

  const hoyStr = fmtDate(new Date());
  const titulo = `${MESES[ancla.getMonth()]} ${ancla.getFullYear()}`;
  const selectCls = "text-xs border rounded-md px-2 py-1.5 bg-white";

  // Carga total del mes visible, para dar contexto al encabezado
  const cargaMes = semanas.reduce((acc, d) => {
    if (!d) return acc;
    return acc + (porFecha[fmtDate(d)] || [])
      .filter((a) => a.estado !== "completada")
      .reduce((s, a) => s + minutosDe(a), 0);
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <button onClick={() => shift(-1)} className="w-7 h-7 rounded-md border flex items-center justify-center bg-white" style={bLine}><ChevronLeft size={14} color={COLORS.charcoal} /></button>
          <p className="text-sm font-bold capitalize text-center" style={{ color: COLORS.charcoal, minWidth: 130 }}>{titulo}</p>
          <button onClick={() => shift(1)} className="w-7 h-7 rounded-md border flex items-center justify-center bg-white" style={bLine}><ChevronRight size={14} color={COLORS.charcoal} /></button>
          <button onClick={() => setAncla(new Date())} className="text-[11px] font-semibold px-2 py-1 rounded-md border bg-white" style={{ borderColor: COLORS.line, color: COLORS.slate }}>Hoy</button>
        </div>
        {cargaMes > 0 && (
          <Chip color={COLORS.orange}><Clock size={10} /> {cargaTexto(cargaMes)} por ejecutar</Chip>
        )}
      </div>

      {/* Sedes como botones: es el filtro que más se usa en campo */}
      {sedesVista.length > 1 && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <button onClick={() => setFSede("todas")}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border"
            style={{
              background: fSede === "todas" ? COLORS.charcoal : "white",
              color: fSede === "todas" ? "white" : COLORS.slate,
              borderColor: fSede === "todas" ? COLORS.charcoal : COLORS.line,
            }}>
            Todas
          </button>
          {sedesVista.map((s) => {
            const activa = fSede === s.id;
            const col = sedeColor(data.sedes, s.id);
            return (
              <button key={s.id} onClick={() => setFSede(activa ? "todas" : s.id)}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border"
                style={{
                  background: activa ? `${col}18` : "white",
                  color: activa ? col : COLORS.slate,
                  borderColor: activa ? col : COLORS.line,
                }}>
                <span className="w-2 h-2 rounded-full" style={{ background: col }} />
                {s.nombre}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <Filter size={12} color={COLORS.slate} />
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={selectCls} style={inputStyle}>
          <option value="todos">Todo tipo</option>
          <option value="preventivo">Preventivos</option>
          <option value="correctivo">Correctivos</option>
          <option value="servicio">Servicios</option>
        </select>
        <select value={fTecnico} onChange={(e) => setFTecnico(e.target.value)} className={selectCls} style={inputStyle}>
          <option value="todos">Todos los técnicos</option>
          {tecnicoDefault && <option value={tecnicoDefault}>Solo mis actividades</option>}
          {tecnicos.filter((t) => t.id !== tecnicoDefault).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      <div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS_SEMANA.map((d, i) => <div key={i} className="text-center text-[10px] font-semibold" style={cSlate}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {semanas.map((d, i) => {
            if (!d) return <div key={i} />;
            const k = fmtDate(d);
            const dia = porFecha[k] || [];
            const sedesDia = [...new Set(dia.map((o) => o.sedeId))];
            const listas = dia.filter((a) => a.estado === "completada");
            const pendientes = dia.filter((a) => a.estado !== "completada");
            // La carga que sirve para planificar es la de lo que aún falta hacer
            const carga = pendientes.reduce((s, a) => s + minutosDe(a), 0);
            const hoy = k === hoyStr;
            return (
              <button key={i} onClick={() => dia.length && setDiaModal(k)}
                className="rounded-md border p-1 flex flex-col items-center justify-start"
                style={{
                  minHeight: 74,
                  borderColor: hoy ? COLORS.orange : COLORS.line,
                  background: dia.length ? COLORS.cream : "white",
                }}>
                <span className="text-[10px] font-semibold" style={{ color: hoy ? COLORS.orange : COLORS.charcoal }}>{d.getDate()}</span>
                {sedesDia.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                    {sedesDia.slice(0, 4).map((sid) => <span key={sid} className="w-1.5 h-1.5 rounded-full" style={{ background: sedeColor(data.sedes, sid) }} />)}
                  </div>
                )}
                {dia.length > 0 && (
                  <div className="flex flex-col items-center gap-0.5 mt-0.5 w-full">
                    <div className="flex items-center gap-1 flex-wrap justify-center">
                      {pendientes.length > 0 && (
                        <span className="text-[9px] font-bold px-1 rounded" style={{ background: `${COLORS.ambar}30`, color: COLORS.charcoal }}
                          title={`${pendientes.length} pendiente(s)`}>
                          {pendientes.length} pend.
                        </span>
                      )}
                      {listas.length > 0 && (
                        <span className="text-[9px] font-bold px-1 rounded" style={{ background: `${COLORS.verde}25`, color: COLORS.verde }}
                          title={`${listas.length} completada(s)`}>
                          {listas.length} ✓
                        </span>
                      )}
                    </div>
                    {carga > 0 && (
                      <span className="text-[9px] font-bold leading-tight" style={cOrange}>{cargaTexto(carga)}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {diaModal && (
        <Modal title={`Actividades del ${diaModal}`} onClose={() => setDiaModal(null)} wide>
          {(() => {
            const dia = porFecha[diaModal] || [];
            const listas = dia.filter((a) => a.estado === "completada");
            const pend = dia.filter((a) => a.estado !== "completada");
            const carga = pend.reduce((s, a) => s + minutosDe(a), 0);
            const cargaHecha = listas.reduce((s, a) => s + minutosDe(a), 0);
            return (
              <>
                <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                  {pend.length > 0 && (
                    <Chip color={COLORS.ambar}>{pend.length} pendiente{pend.length === 1 ? "" : "s"}{carga > 0 ? ` · ${cargaTexto(carga)}` : ""}</Chip>
                  )}
                  {listas.length > 0 && (
                    <Chip color={COLORS.verde}>{listas.length} completada{listas.length === 1 ? "" : "s"}{cargaHecha > 0 ? ` · ${cargaTexto(cargaHecha)}` : ""}</Chip>
                  )}
                </div>
                <div className="space-y-2">
                  {dia.map((a) => <TarjetaAgenda key={a.id} act={a} data={data} onEditar={onEditar} ocultarCosto={ocultarCosto} />)}
                </div>
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

function PanelProgramacion({ data, sedes, pendientes, onActivar, tecnicoDefault, nota, onEditar, ocultarCosto }) {
  return (
    <div className="mt-4 flex flex-col lg:flex-row gap-4">
      <div className="w-full lg:w-1/3 xl:w-1/4">
        <SectionTitle count={pendientes.length}>Actividades por sede</SectionTitle>
        <p className="text-[10px] mb-2" style={cSlate}>{nota}</p>
        <ArbolPendientes sedes={sedes} todosLosSedes={data.sedes} usuarios={data.usuarios}
          pendientes={pendientes} onActivar={onActivar} ocultarCosto={ocultarCosto} />
      </div>
      <div className="w-full lg:w-2/3 xl:w-3/4">
        <SectionTitle>Calendario de programación</SectionTitle>
        <Calendario data={data} sedes={sedes} tecnicoDefault={tecnicoDefault} onEditar={onEditar} ocultarCosto={ocultarCosto} />
      </div>
    </div>
  );
}

function AdminProgramacion({ data, persist, user }) {
  const [activar, setActivar] = useState(null);
  const [ejecutar, setEjecutar] = useState(null);   // orden abierta para ejecutar/editar
  const acciones = useAcciones(data, persist, user);
  const pendientes = getPendientes(data);

  /* La tarjeta abierta debe reflejar los cambios ya guardados (materiales,
     checklist, foto), así que se relee del estado en cada render. */
  const enEdicion = ejecutar
    ? (ejecutar.tipo === "preventivo" ? data.ordenes.find((o) => o.id === ejecutar.id)
      : ejecutar.tipo === "servicio" ? (data.servicios || []).find((x) => x.id === ejecutar.id)
      : data.solicitudes.find((x) => x.id === ejecutar.id))
    : null;

  const confirmar = ({ tecnicoId, fecha, duracionValor, duracionUnidad }) => {
    const item = activar;
    if (item.tipo === "correctivo") {
      persist((data) => ({
        ...data,
        solicitudes: data.solicitudes.map((s) =>
          s.id === item.solicitudId ? { ...s, tecnicoId, fechaProgramada: fecha, duracionValor, duracionUnidad, estado: "programada" } : s),
      }));
    } else {
      const n = data.otCounter || 1;
      const orden = {
        id: uid("ot"), codigo: `OT-${String(n).padStart(4, "0")}`,
        planId: item.planId, tarea: item.tarea, checklist: checklistDesdePasos(item.procedimientoPasos),
        categoria: item.categoria, frecuencia: item.frecuencia,
        duracionValor, duracionUnidad,
        sedeId: item.sedeId, faseId: item.faseId, activoId: item.activoId,
        tecnicoId, fechaProgramada: fecha, fechaCompletada: "",
        estado: "programada", observaciones: "", foto: "",
        materiales: [], materialesEstado: "", consumos: [], createdAt: fmtDate(new Date()),
      };
      persist((data) => ({ ...data, ordenes: [...data.ordenes, orden], otCounter: n + 1 }));
    }
    setActivar(null);
  };

  return (
    <div>
      <PanelProgramacion data={data} sedes={data.sedes} pendientes={pendientes} onActivar={setActivar}
        onEditar={setEjecutar}
        nota="Preventivos y correctivos sin programar (se activan aquí) y servicios externos ya agendados." />

      {activar && (
        <Modal title="Activar actividad" onClose={() => setActivar(null)}>
          <FormActivar item={activar} data={data} onConfirm={confirmar} onClose={() => setActivar(null)} />
        </Modal>
      )}

      {enEdicion && (
        <Modal title={`Ejecutar ${enEdicion.codigo}`} onClose={() => setEjecutar(null)} wide>
          <TarjetaActividad
            item={{
              ...enEdicion,
              tipo: ejecutar.tipo,
              tarea: ejecutar.tipo === "correctivo" ? enEdicion.descripcion
                : ejecutar.tipo === "servicio" ? enEdicion.trabajo : enEdicion.tarea,
              fechaProgramada: ejecutar.tipo === "servicio" ? enEdicion.fecha : enEdicion.fechaProgramada,
            }}
            data={data} acciones={acciones} rol="admin" abiertoInicial permitirReasignar />
        </Modal>
      )}
    </div>
  );
}

/* ============================================================================
   14. ADMIN · Correctivos y control de costos
   ========================================================================= */

/* Contexto para decidir: cuánto queda en la sede de la actividad y en el
   conjunto. Sin esto, aprobar un costo es una decisión a ciegas. */
function ContextoPresupuesto({ item, data }) {
  const mes = mesContable(item) || mesKey(fmtDate(new Date()));
  const sede = presupuestoSedeMes(data, item.sedeId, mes);
  const global = presupuestoGlobalMes(data, mes);
  const costo = costoEstimado(item);

  const disponibleSede = sede.disponible;
  const disponibleGlobal = global.disponible ?? (global.presupuesto - global.gastado - global.comprometido);
  const alcanzaSede = costo <= disponibleSede;
  const alcanzaGlobal = costo <= disponibleGlobal;

  const fila = (etiqueta, disponible, alcanza) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px]" style={cSlate}>{etiqueta}</span>
      <span className="text-[11px] font-bold" style={{ color: alcanza ? COLORS.verde : COLORS.rojo }}>
        {money(Math.max(0, disponible))}
        {!alcanza && <span className="font-normal"> · no alcanza</span>}
      </span>
    </div>
  );

  return (
    <div className="rounded-md p-2.5 space-y-1" style={{ background: COLORS.paper }}>
      <div className="flex items-center justify-between gap-2 pb-1 mb-1 border-b" style={bLine}>
        <span className="text-[11px] font-semibold" style={cChar}>Este costo</span>
        <span className="text-xs font-bold" style={cOrange}>{money(costo)}</span>
      </div>
      {fila(`Disponible en ${sedeNombre(data.sedes, item.sedeId)}`, disponibleSede, alcanzaSede)}
      {fila("Disponible en todas las sedes", disponibleGlobal, alcanzaGlobal)}
      <p className="text-[10px] pt-1" style={cSlate}>
        {alcanzaSede
          ? `Al aprobarlo quedarían ${money(disponibleSede - costo)} en la sede.`
          : `Excede el presupuesto de la sede en ${money(costo - disponibleSede)}.`}
        {" "}Cifras del mes {mesLabel(mes)}, ya descontando lo comprometido.
      </p>
    </div>
  );
}

function TarjetaCosto({ item, data, rol, onUpdate, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const info = MAT_ESTADO[item.materialesEstado];
  return (
    <div className="border rounded-md" style={cardStyle}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3 text-left gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {open ? <ChevronDown size={16} color={COLORS.slate} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} color={COLORS.slate} className="mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TipoChip tipo={item.tipo} />
              <span className="text-[10px] font-bold" style={cChar}>{item.codigo}</span>
            </div>
            <p className="font-semibold text-sm mt-1 truncate" style={cChar}>{item.tarea}</p>
            <p className="text-xs truncate" style={cSlate}>{ubicacionTexto(data.sedes, item)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-end gap-1">
            {info && <Chip color={info.color}>{info.label}</Chip>}
            <span className="text-xs font-bold" style={cOrange}>{money(costoEstimado(item))}</span>
          </div>
          <BotonDetalle item={item} />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t pt-3 space-y-3" style={bLine}>
          <p className="text-xs" style={cSlate}>
            Técnico: {usuarioNombre(data.usuarios, item.tecnicoId)}
            {item.solicitanteId ? ` · Solicitó: ${usuarioNombre(data.usuarios, item.solicitanteId)}` : ""}
            {item.fechaProgramada ? ` · ${item.fechaProgramada}` : ""}
          </p>
          {item.observaciones && <Field label="Observaciones del técnico"><ReadOnly>{item.observaciones}</ReadOnly></Field>}
          {item.fotoSolicitante && (
            <Field label="Foto del solicitante">
              <img src={item.fotoSolicitante} alt="Reportado por el solicitante" className="rounded-md max-h-40 border" style={bLine} />
            </Field>
          )}
          <FotoUploader foto={item.foto} onChange={() => {}} readOnly label="Evidencia del técnico" />
          <MaterialesPanel item={item} rol={rol} onUpdate={onUpdate} />
          <ContextoPresupuesto item={item} data={data} />
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   14b. TÉCNICO · "Mis actividades", con el mismo agrupado por etapa que ve
   el supervisor (Programadas, En presupuesto, En aprobación, Resueltas),
   pero solo con lo suyo, rol="tecnico" (sin permisos de corrección), y los
   servicios sin mostrar el valor — el técnico solo ve qué le toca ejecutar.
   ========================================================================= */
function TecnicoPreventivos({ data, acciones, ordenes }) {
  const enCosteo = ordenes.filter((o) => o.materialesEstado === "pendiente_costeo");
  const enAprobacion = ordenes.filter((o) => ["pendiente_aprobacion", "en_espera"].includes(o.materialesEstado));
  const rechazadas = ordenes.filter((o) => o.materialesEstado === "rechazado");
  const idsEnFlujoCostos = new Set([...enCosteo, ...enAprobacion, ...rechazadas].map((o) => o.id));

  const programadas = [...ordenes].filter((o) => o.estado === "programada")
    .sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || ""));
  const enEjecucion = [...ordenes].filter((o) => ["en_proceso", "espera"].includes(o.estado) && !idsEnFlujoCostos.has(o.id))
    .sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || ""));
  const finalizadas = [...ordenes].filter((o) => o.estado === "completada")
    .sort((a, b) => (b.fechaCompletada || "").localeCompare(a.fechaCompletada || ""));

  const tarjeta = (o) => <TarjetaActividad key={o.id} item={{ ...o, tipo: "preventivo" }} data={data} acciones={acciones} rol="tecnico" />;

  return (
    <div className="space-y-3">
      <SeccionPlegable titulo="Programadas" count={programadas.length} color={COLORS.ambar} defaultOpen>
        {programadas.map(tarjeta)}
        {programadas.length === 0 && <Empty>Sin preventivos programados.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="En Ejecución" count={enEjecucion.length} color={COLORS.orange} defaultOpen>
        {enEjecucion.map(tarjeta)}
        {enEjecucion.length === 0 && <Empty>Sin preventivos en ejecución.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="En presupuesto" count={enCosteo.length} color={COLORS.ambar}>
        {enCosteo.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="tecnico" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {enCosteo.length === 0 && <Empty>Nada esperando precios.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="En espera de aprobación del cliente" count={enAprobacion.length} color={ESTADOS.por_aprobar.color}>
        {enAprobacion.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="tecnico" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {enAprobacion.length === 0 && <Empty>Nada esperando decisión del cliente.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="Rechazados" count={rechazadas.length} color={COLORS.rojo}>
        {rechazadas.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="tecnico" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {rechazadas.length === 0 && <Empty>Nada rechazado.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="Resueltas" count={finalizadas.length} color={COLORS.verde} defaultOpen={false}>
        {finalizadas.slice(0, 5).map(tarjeta)}
        {finalizadas.length > 5 && <p className="text-[11px] text-center" style={cSlate}>{finalizadas.length - 5} más en Histórico.</p>}
        {finalizadas.length === 0 && <Empty>Aún no hay preventivos resueltos.</Empty>}
      </SeccionPlegable>
    </div>
  );
}

function TecnicoCorrectivos({ data, acciones, solicitudes }) {
  const enCosteo = solicitudes.filter((s) => s.materialesEstado === "pendiente_costeo");
  const enAprobacion = solicitudes.filter((s) => ["pendiente_aprobacion", "en_espera"].includes(s.materialesEstado));
  const rechazadas = solicitudes.filter((s) => s.materialesEstado === "rechazado");
  const idsEnFlujoCostos = new Set([...enCosteo, ...enAprobacion, ...rechazadas].map((s) => s.id));

  const programadas = [...solicitudes].filter((s) => s.estado === "programada")
    .sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || ""));
  const enEjecucion = [...solicitudes].filter((s) => ["en_proceso", "espera"].includes(s.estado) && !idsEnFlujoCostos.has(s.id))
    .sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || ""));
  const finalizadas = [...solicitudes].filter((s) => s.estado === "completada")
    .sort((a, b) => (b.fechaCompletada || "").localeCompare(a.fechaCompletada || ""));

  const tarjeta = (s) => <TarjetaActividad key={s.id} item={{ ...s, tipo: "correctivo", tarea: s.descripcion }} data={data} acciones={acciones} rol="tecnico" />;

  return (
    <div className="space-y-3">
      <SeccionPlegable titulo="Programadas" count={programadas.length} color={COLORS.ambar} defaultOpen>
        {programadas.map(tarjeta)}
        {programadas.length === 0 && <Empty>Sin correctivos programados.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="En Ejecución" count={enEjecucion.length} color={COLORS.orange} defaultOpen>
        {enEjecucion.map(tarjeta)}
        {enEjecucion.length === 0 && <Empty>Sin correctivos en ejecución.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="En presupuesto" count={enCosteo.length} color={COLORS.ambar}>
        {enCosteo.map((i) => <TarjetaCosto key={i.id} item={{ ...i, tipo: "correctivo", tarea: i.descripcion }} data={data} rol="tecnico" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {enCosteo.length === 0 && <Empty>Nada esperando precios.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="En espera de aprobación del cliente" count={enAprobacion.length} color={ESTADOS.por_aprobar.color}>
        {enAprobacion.map((i) => <TarjetaCosto key={i.id} item={{ ...i, tipo: "correctivo", tarea: i.descripcion }} data={data} rol="tecnico" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {enAprobacion.length === 0 && <Empty>Nada esperando decisión del cliente.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="Rechazados" count={rechazadas.length} color={COLORS.rojo}>
        {rechazadas.map((i) => <TarjetaCosto key={i.id} item={{ ...i, tipo: "correctivo", tarea: i.descripcion }} data={data} rol="tecnico" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {rechazadas.length === 0 && <Empty>Nada rechazado.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="Resueltas" count={finalizadas.length} color={COLORS.verde} defaultOpen={false}>
        {finalizadas.slice(0, 5).map(tarjeta)}
        {finalizadas.length > 5 && <p className="text-[11px] text-center" style={cSlate}>{finalizadas.length - 5} más en Histórico.</p>}
        {finalizadas.length === 0 && <Empty>Aún no hay correctivos resueltos.</Empty>}
      </SeccionPlegable>
    </div>
  );
}

/* Igual estructura visual que AdminServicios, pero sin mostrar ningún monto:
   el técnico solo necesita saber qué servicio le toca ejecutar y cuándo. */
function TecnicoServicios({ data, servicios }) {
  const porAprobar = servicios.filter((s) => s.estado === "por_aprobar");
  const programados = servicios.filter((s) => s.estado === "programada");
  const enEjecucion = servicios.filter((s) => s.estado === "en_proceso");
  const finalizados = [...servicios].filter((s) => s.estado === "completada")
    .sort((a, b) => (b.fechaCompletada || "").localeCompare(a.fechaCompletada || ""));

  const tarjeta = (srv) => (
    <div key={srv.id} className="border rounded-md p-2.5" style={{ ...cardStyle, borderLeft: `3px solid ${ESTADOS[srv.estado]?.color || COLORS.line}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold" style={cChar}>{srv.codigo}</span>
            <EstadoChip estado={srv.estado} />
            {srv.tipoProveedor && <Chip>{srv.tipoProveedor}</Chip>}
          </div>
          <p className="text-sm font-semibold mt-1" style={cChar}>{srv.trabajo}</p>
          <p className="text-xs" style={cSlate}>{ubicacionTexto(data.sedes, srv)}</p>
          <p className="text-[11px] mt-1" style={cSlate}>
            {srv.proveedor || "Proveedor por definir"}{srv.fecha ? ` · ${srv.fecha}` : " · sin fecha"}
          </p>
        </div>
        <BotonDetalle item={{ ...srv, tipo: "servicio", tarea: srv.trabajo, fechaProgramada: srv.fecha }} size={13} />
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <SeccionPlegable titulo="En espera de aprobación del cliente" count={porAprobar.length} color={ESTADOS.por_aprobar.color}>
        {porAprobar.map(tarjeta)}
        {porAprobar.length === 0 && <Empty>Sin solicitudes esperando aprobación.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="Programados" count={programados.length} color={COLORS.ambar} defaultOpen>
        {programados.map(tarjeta)}
        {programados.length === 0 && <Empty>Sin servicios programados.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="En Ejecución" count={enEjecucion.length} color={COLORS.orange} defaultOpen>
        {enEjecucion.map(tarjeta)}
        {enEjecucion.length === 0 && <Empty>Sin servicios en ejecución.</Empty>}
      </SeccionPlegable>
      <SeccionPlegable titulo="Finalizados" count={finalizados.length} color={COLORS.verde} defaultOpen={false}>
        {finalizados.slice(0, 5).map(tarjeta)}
        {finalizados.length > 5 && <p className="text-[11px] text-center" style={cSlate}>{finalizados.length - 5} más en Histórico.</p>}
        {finalizados.length === 0 && <Empty>Aún no hay servicios finalizados.</Empty>}
      </SeccionPlegable>
    </div>
  );
}

function TecnicoMisActividades({ data, persist, user, misSedeIds }) {
  const acciones = useAcciones(data, persist, user);
  const [sub, setSub] = useState("preventivos");

  const misOrdenes = data.ordenes.filter((o) => o.tecnicoId === user.id);
  const misSolicitudes = data.solicitudes.filter((s) => s.tecnicoId === user.id);
  const misServicios = (data.servicios || []).filter((s) => misSedeIds.includes(s.sedeId));

  const subs = [
    { id: "preventivos", label: "Preventivos", icon: <ClipboardList size={14} />, n: misOrdenes.filter((o) => o.estado !== "completada").length },
    { id: "correctivos", label: "Correctivos", icon: <AlertTriangle size={14} />, n: misSolicitudes.filter((s) => s.estado !== "completada").length },
    { id: "servicios", label: "Servicios", icon: <Wrench size={14} />, n: misServicios.filter((s) => s.estado !== "completada").length },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {subs.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap shrink-0"
            style={{
              background: sub === t.id ? `${COLORS.orange}15` : "white",
              color: sub === t.id ? COLORS.orange : COLORS.slate,
              border: `1px solid ${sub === t.id ? COLORS.orange : COLORS.line}`,
            }}>
            {t.icon} {t.label}
            {t.n > 0 && <Chip color={sub === t.id ? COLORS.orange : COLORS.slate}>{t.n}</Chip>}
          </button>
        ))}
      </div>

      {sub === "preventivos" && <TecnicoPreventivos data={data} acciones={acciones} ordenes={misOrdenes} />}
      {sub === "correctivos" && <TecnicoCorrectivos data={data} acciones={acciones} solicitudes={misSolicitudes} />}
      {sub === "servicios" && <TecnicoServicios data={data} servicios={misServicios} />}
    </div>
  );
}

function AdminCorrectivos({ data, persist, user }) {
  const acciones = useAcciones(data, persist, user);
  const [fSede, setFSede] = useState("todas");
  const [nuevo, setNuevo] = useState(false);
  const [msg, setMsg] = useState("");

  /* Alta directa de un correctivo: útil cuando la novedad llega por teléfono,
     por radio o la detecta el propio supervisor en recorrido. Nace pendiente,
     igual que una solicitud del usuario, para que pase por Programación. */
  const crearCorrectivo = (form) => {
    const now = new Date();
    const n = data.solCounter || 1;
    const nueva = {
      id: uid("sol"), codigo: `SOL-${String(n).padStart(4, "0")}`,
      sedeId: form.sedeId, faseId: form.faseId, activoId: form.activoId,
      descripcion: form.descripcion, criticidad: form.criticidad || "",
      solicitanteId: form.solicitanteId || user.id,
      fecha: fmtDate(now), hora: fmtHora(now),
      estado: "pendiente", tecnicoId: "", fechaProgramada: "", fechaCompletada: "",
      observaciones: "", foto: "", fotoSolicitante: form.foto || "", resolucion: "",
      materiales: [], materialesEstado: "",
      consumos: [], reprogramaciones: [], calificacion: 0, comentarioCalif: "",
    };
    persist((data) => ({ ...data, solicitudes: [nueva, ...data.solicitudes], solCounter: n + 1 }));
    setMsg(`Novedad ${nueva.codigo} reportada. Queda pendiente de programación.`);
    setTimeout(() => setMsg(""), 4000);
  };

  /* Mismas etapas que preventivos y servicios, para que las tres pestañas se
     lean igual: sin programar → programadas → en ejecución → costeo →
     aprobación → rechazados → resueltas. */
  const visibles = data.solicitudes.filter((s) => fSede === "todas" || s.sedeId === fSede);
  const sinProgramar = visibles.filter((s) => s.estado === "pendiente")
    .sort((a, b) => (CRITICIDAD[b.criticidad]?.nivel || 0) - (CRITICIDAD[a.criticidad]?.nivel || 0));
  const enFlujoCostosIds = new Set(
    visibles.filter((s) => ["pendiente_costeo", "pendiente_aprobacion", "en_espera", "rechazado"].includes(s.materialesEstado)).map((s) => s.id)
  );
  const programadas = visibles.filter((s) => s.estado === "programada")
    .sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || ""));
  const enEjecucion = visibles.filter((s) => ["en_proceso", "espera"].includes(s.estado) && !enFlujoCostosIds.has(s.id))
    .sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || ""));
  const finalizadas = visibles.filter((s) => s.estado === "completada")
    .sort((a, b) => (b.fechaCompletada || "").localeCompare(a.fechaCompletada || ""));

  const enCosteo = itemsConMateriales(data, ["pendiente_costeo"]);
  const enAprobacion = itemsConMateriales(data, ["pendiente_aprobacion", "en_espera"]);
  const rechazadas = itemsConMateriales(data, ["rechazado"]);

  const tarjetaAct = (sol) => (
    <TarjetaActividad key={sol.id} rol="admin" data={data} acciones={acciones}
      item={{ ...sol, tipo: "correctivo", tarea: sol.descripcion }} permitirReasignar />
  );

  return (
    <div className="mt-4 space-y-5">
      <button onClick={() => setNuevo(true)}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-md border"
        style={{ borderColor: COLORS.orange, color: COLORS.orange, background: "white" }}>
        <Plus size={14} /> Reportar novedad
      </button>

      {msg && (
        <div className="text-sm rounded-md p-3 flex items-center gap-2" style={{ background: `${COLORS.verde}15`, color: COLORS.verde }}>
          <CheckCircle2 size={16} /> {msg}
        </div>
      )}

      {data.sedes.length > 1 && (
        <select value={fSede} onChange={(e) => setFSede(e.target.value)}
          className="w-full border rounded-md px-2 py-2 text-sm bg-white" style={inputStyle}>
          <option value="todas">Todas las sedes</option>
          {data.sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      )}

      {nuevo && (
        <ModalReportarNovedad data={data} sedes={data.sedes} user={user} elegirSolicitante
          onSubmit={crearCorrectivo} onClose={() => setNuevo(false)} />
      )}

      <SeccionPlegable titulo="Sin Programar" count={sinProgramar.length} color={COLORS.slate}
        nota="Reportadas, aún sin técnico ni fecha. Se programan desde Programación.">
        {sinProgramar.map(tarjetaAct)}
        {sinProgramar.length === 0 && <Empty>Nada esperando programación.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="Programadas" count={programadas.length} color={COLORS.ambar}>
        {programadas.map(tarjetaAct)}
        {programadas.length === 0 && <Empty>Sin correctivos programados.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="En Ejecución" count={enEjecucion.length} color={COLORS.orange}>
        {enEjecucion.map(tarjetaAct)}
        {enEjecucion.length === 0 && <Empty>Sin correctivos en ejecución.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="En presupuesto" count={enCosteo.length} color={COLORS.ambar}>
        {enCosteo.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="admin" defaultOpen onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {enCosteo.length === 0 && <Empty>Nada esperando precios.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="En espera de aprobación del cliente" count={enAprobacion.length} color={ESTADOS.por_aprobar.color}>
        {enAprobacion.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="admin" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {enAprobacion.length === 0 && <Empty>Nada esperando decisión del cliente.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="Rechazados" count={rechazadas.length} color={COLORS.rojo}>
        {rechazadas.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="admin" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
        {rechazadas.length === 0 && <Empty>Nada rechazado.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="Resueltas" count={finalizadas.length} color={COLORS.verde} defaultOpen={false}>
        {finalizadas.slice(0, 5).map(tarjetaAct)}
        {finalizadas.length > 5 && (
          <p className="text-[11px] text-center" style={cSlate}>{finalizadas.length - 5} más en Histórico.</p>
        )}
        {finalizadas.length === 0 && <Empty>Aún no hay correctivos resueltos.</Empty>}
      </SeccionPlegable>
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
      out.push({ mes: MESES[d.getMonth()].slice(0, 3), gastado: Number(gm.gastado.toFixed(2)), presupuesto: gm.presupuesto });
    }
    return out;
  }, [data, mes]);

  const actividadesDetalle = detalle ? actividadesDeSedeMes(data, detalle, mes).filter((a) => costoEstimado(a) > 0) : [];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs" style={cSlate}>
          Presupuesto de <span className="font-semibold" style={cChar}>{money(PRESUPUESTO_MENSUAL_SEDE)}</span> por sede al mes.
        </p>
        <MesSelector mes={mes} onChange={onMesChange} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Presupuesto total" value={money(g.presupuesto)} icon={<Wallet size={14} />} color={COLORS.charcoal} sub={`${data.sedes.length} sedes`} />
        <Stat label="Gastado (aprobado)" value={money(g.gastado)} icon={<DollarSign size={14} />} color={COLORS.orange} sub={`${g.pct.toFixed(0)}% del total`} />
        <Stat label="Comprometido" value={money(g.comprometido)} icon={<Clock size={14} />} color={COLORS.ambar} sub="Sin aprobar aún" />
        <Stat label="Disponible" value={money(g.disponible)} icon={<TrendingUp size={14} />} color={g.disponible >= 0 ? COLORS.verde : COLORS.rojo}
          sub={g.excedidas > 0 ? `${g.excedidas} sede(s) excedida(s)` : g.enRiesgo > 0 ? `${g.enRiesgo} sede(s) en riesgo` : "Todo en orden"} />
      </div>

      <div className="border rounded-md p-3" style={cardStyle}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={cSlate}>Control por sede · {mesLabel(mes)}</p>
        <div className="space-y-3">
          {g.porSede.map((p) => {
            const est = ESTADO_PRESUPUESTO[p.estado];
            return (
              <button key={p.sedeId} onClick={() => setDetalle(detalle === p.sedeId ? null : p.sedeId)} className="w-full text-left">
                <PresupuestoBar p={p} />
                {detalle === p.sedeId && (
                  <div className="mt-2 pl-2 border-l-2 space-y-1" style={{ borderColor: est.color }}>
                    {actividadesDetalle.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-[11px] gap-2">
                        <span className="min-w-0 truncate" style={cChar}>{a.codigo} · {a.tarea || a.descripcion}</span>
                        <span className="shrink-0 font-semibold" style={{ color: a.materialesEstado === "aprobado" ? COLORS.orange : COLORS.slate }}>
                          {money(costoEstimado(a))}{a.materialesEstado !== "aprobado" ? " (sin aprobar)" : ""}
                        </span>
                      </div>
                    ))}
                    {actividadesDetalle.length === 0 && <p className="text-[11px]" style={cSlate}>Sin gastos registrados este mes.</p>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border rounded-md p-3" style={cardStyle}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={cSlate}>Últimos 6 meses</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={historico}>
            <CartesianGrid stroke={COLORS.line} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: COLORS.slate }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => money(v)} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="gastado" name="Gastado" fill={COLORS.orange} radius={[4, 4, 0, 0]} />
            <Bar dataKey="presupuesto" name="Presupuesto" fill={`${COLORS.charcoal}30`} radius={[4, 4, 0, 0]} />
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

/* ============================================================================
   SERVICIOS EXTERNOS
   Ciclo: el admin crea la solicitud describiendo el trabajo y su presupuesto
   estimado (sin proveedor todavía, solo su clasificación) → el cliente aprueba,
   deja en espera o rechaza → una vez aprobado, el admin cierra el proveedor,
   el valor final y la fecha, con lo que pasa a programada.
   ========================================================================= */

function FormServicio({ data, initial, onSave, onClose }) {
  const flat = flattenActivos(data.sedes);
  const [sedeId, setSedeId] = useState(initial?.sedeId || data.sedes[0]?.id || "");
  const [faseId, setFaseId] = useState(initial?.faseId || "");
  const [activoId, setActivoId] = useState(initial?.activoId || "");
  const [trabajo, setTrabajo] = useState(initial?.trabajo || "");
  const [detalle, setDetalle] = useState(initial?.detalle || "");
  const [tipoProveedor, setTipoProveedor] = useState(initial?.tipoProveedor || TIPOS_PROVEEDOR[0]);
  const [presupuesto, setPresupuesto] = useState(initial?.presupuesto ?? "");
  const [foto, setFoto] = useState(initial?.foto || "");

  const sede = data.sedes.find((s) => s.id === sedeId);
  const fase = sede?.fases.find((f) => f.id === faseId);
  const valido = sedeId && faseId && activoId && trabajo.trim() && detalle.trim() && Number(presupuesto) > 0;

  return (
    <div className="space-y-3">
      <Field label="Sede">
        <select value={sedeId} onChange={(e) => { setSedeId(e.target.value); setFaseId(""); setActivoId(""); }}
          className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
          {data.sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Fase">
          <select value={faseId} onChange={(e) => { setFaseId(e.target.value); setActivoId(""); }}
            className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
            <option value="">Selecciona</option>
            {(sede?.fases || []).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </Field>
        <Field label="Activo">
          <select value={activoId} onChange={(e) => setActivoId(e.target.value)} disabled={!faseId}
            className="w-full border rounded-md px-2 py-2 text-sm disabled:opacity-50" style={inputStyle}>
            <option value="">Selecciona</option>
            {(fase?.activos || []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Trabajo a realizar" hint="Título corto que identifica el servicio.">
        <input value={trabajo} onChange={(e) => setTrabajo(e.target.value)}
          placeholder="Ej. Mantenimiento del sistema de aire acondicionado"
          className={inputCls} style={inputStyle} />
      </Field>

      <Field label="Detalle del trabajo" hint="Alcance completo. Es lo que el cliente lee para decidir.">
        <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={4}
          placeholder="Ej. Revisión de compresor y presiones de trabajo, recarga de gas refrigerante R410A, cambio de filtros, limpieza de serpentines y prueba de funcionamiento. Incluye informe técnico y garantía de 6 meses."
          className={`${inputCls} resize-none`} style={inputStyle} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Tipo de proveedor" hint="El proveedor se define al aprobarse.">
          <select value={tipoProveedor} onChange={(e) => setTipoProveedor(e.target.value)}
            className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle}>
            {TIPOS_PROVEEDOR.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Presupuesto estimado (USD)">
          <input type="number" min="0" step="0.01" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)}
            placeholder="0.00" className={inputCls} style={inputStyle} />
        </Field>
      </div>

      <FotoUploader foto={foto} onChange={setFoto} carpeta="servicios" />

      <p className="text-[11px] rounded-md p-2.5" style={{ background: `${COLORS.ambar}15`, color: COLORS.charcoal }}>
        Al guardar, la solicitud se envía al cliente para su aprobación. El proveedor y la fecha se definen después.
      </p>

      <button disabled={!valido}
        onClick={() => {
          onSave({
            sedeId, faseId, activoId, trabajo: trabajo.trim(), detalle: detalle.trim(), tipoProveedor,
            presupuesto: Number(presupuesto) || 0, foto,
          });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40" style={{ background: COLORS.orange }}>
        {initial ? "Guardar cambios" : "Enviar a aprobación"}
      </button>
    </div>
  );
}

/* Cierre del servicio aprobado: proveedor, valor final y fecha. */
function FormCerrarServicio({ srv, onConfirm, onClose }) {
  const [proveedor, setProveedor] = useState(srv.proveedor || "");
  const [valor, setValor] = useState(srv.presupuestoAprobado ?? srv.presupuesto);
  const [fecha, setFecha] = useState(srv.fecha || "");

  return (
    <div className="space-y-3">
      <div className="rounded-md p-2.5" style={{ background: COLORS.cream }}>
        <p className="text-xs font-semibold" style={cChar}>{srv.trabajo}</p>
        <p className="text-[11px] mt-1" style={cSlate}>
          Aprobado por el cliente en <span className="font-semibold" style={cChar}>{money(srv.presupuestoAprobado ?? srv.presupuesto)}</span>
        </p>
      </div>

      <Field label="Proveedor" hint={srv.tipoProveedor ? `Clasificación: ${srv.tipoProveedor}` : undefined}>
        <input value={proveedor} onChange={(e) => setProveedor(e.target.value)}
          placeholder="Nombre de la empresa contratada" className={inputCls} style={inputStyle} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Valor final (USD)" hint="Puede diferir de lo aprobado.">
          <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)}
            className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Fecha programada" hint="Opcional.">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </div>

      {fecha && (
        <p className="text-[11px] rounded-md p-2.5" style={{ background: `${COLORS.verde}12`, color: COLORS.charcoal }}>
          Al fijar la fecha, el servicio pasa a <b>Programada</b> y aparece en el calendario.
        </p>
      )}

      <button
        onClick={() => {
          onConfirm({
            proveedor: proveedor.trim(),
            presupuestoAprobado: Number(valor) || 0,
            fecha,
            estado: fecha ? "programada" : "aprobada",
          });
          onClose();
        }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white" style={{ background: COLORS.orange }}>
        Guardar
      </button>
    </div>
  );
}

function AdminServicios({ data, persist, user }) {
  const acciones = useAcciones(data, persist, user);
  const [modal, setModal] = useState(null);     // {srv} para editar la solicitud
  const [cerrar, setCerrar] = useState(null);   // servicio aprobado por definir

  const servicios = data.servicios || [];
  const set = (id, patch) => persist((data) => ({ ...data, servicios: servicios.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const crear = (form) => {
    const n = data.srvCounter || 1;
    persist((data) => ({
      ...data,
      servicios: [{
        id: uid("srv"), codigo: `SRV-${String(n).padStart(4, "0")}`,
        ...form, proveedor: "", presupuestoAprobado: null,
        fecha: "", estado: "por_aprobar",
        observaciones: "", resolucion: "", motivoRechazo: "",
        fechaCompletada: "", horaCompletada: "", reprogramaciones: [],
        createdAt: fmtDate(new Date()),
      }, ...servicios],
      srvCounter: n + 1,
    }));
  };

  // Agrupación por etapa, en el mismo orden que preventivos y correctivos
  const porAprobar = servicios.filter((s) => s.estado === "por_aprobar");
  const aprobados = servicios.filter((s) => s.estado === "aprobada");
  const programados = servicios.filter((s) => s.estado === "programada");
  const enEjecucion = servicios.filter((s) => s.estado === "en_proceso");
  const finalizados = servicios.filter((s) => s.estado === "completada");
  const rechazados = servicios.filter((s) => s.estado === "rechazada");

  const tarjeta = (srv, extra) => (
    <div key={srv.id} className="border rounded-md p-3" style={{ ...cardStyle, borderLeft: `3px solid ${ESTADOS[srv.estado]?.color || COLORS.line}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold" style={cChar}>{srv.codigo}</span>
            <EstadoChip estado={srv.estado} />
            {srv.tipoProveedor && <Chip>{srv.tipoProveedor}</Chip>}
          </div>
          <p className="text-sm font-semibold mt-1" style={cChar}>{srv.trabajo}</p>
          {srv.detalle && <p className="text-xs mt-0.5" style={cSlate}>{srv.detalle.length > 110 ? srv.detalle.slice(0, 108) + "…" : srv.detalle}</p>}
          <p className="text-xs" style={cSlate}>{ubicacionTexto(data.sedes, srv)}</p>
          <p className="text-[11px] mt-1" style={cSlate}>
            {srv.proveedor || "Proveedor por definir"}
            {srv.fecha ? ` · ${srv.fecha}` : " · sin fecha"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-sm font-bold" style={cOrange}>
            {money(srv.presupuestoAprobado ?? srv.presupuesto)}
          </span>
          {srv.presupuestoAprobado != null && srv.presupuestoAprobado !== srv.presupuesto && (
            <span className="text-[10px]" style={cSlate}>solicitado {money(srv.presupuesto)}</span>
          )}
          <div className="flex items-center gap-1.5">
            <BotonDetalle item={{ ...srv, tipo: "servicio", tarea: srv.trabajo, fechaProgramada: srv.fecha }} size={13} />
            {srv.estado !== "completada" && (
              <button onClick={() => setModal({ srv })} title="Editar la ficha del servicio"><Pencil size={13} color={COLORS.slate} /></button>
            )}
            <DeleteBtn onConfirm={() => persist((data) => ({ ...data, servicios: servicios.filter((x) => x.id !== srv.id) }))} />
          </div>
        </div>
      </div>
      {srv.motivoRechazo && (
        <p className="text-[11px] mt-2 rounded p-2" style={{ background: `${COLORS.rojo}12`, color: COLORS.charcoal }}>
          <b>Rechazado:</b> {srv.motivoRechazo}
        </p>
      )}
      {extra}
    </div>
  );

  return (
    <div className="mt-4 space-y-5">
      <button onClick={() => setModal({})}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-md border"
        style={{ borderColor: COLORS.orange, color: COLORS.orange, background: "white" }}>
        <Plus size={14} /> Solicitar servicio externo
      </button>

      <SeccionPlegable titulo="En espera de aprobación del cliente" count={porAprobar.length} color={ESTADOS.por_aprobar.color}>
        {porAprobar.map((s) => tarjeta(s))}
        {porAprobar.length === 0 && <Empty>Sin solicitudes esperando aprobación.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="Aprobados · por definir proveedor y fecha" count={aprobados.length} color={ESTADOS.aprobada.color}>
        {aprobados.map((s) => tarjeta(s,
          <button onClick={() => setCerrar(s)}
            className="w-full mt-2 text-xs font-semibold py-2 rounded-md text-white"
            style={{ background: COLORS.orange }}>
            Definir proveedor y fecha
          </button>
        ))}
        {aprobados.length === 0 && <Empty>Nada aprobado pendiente de programar.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="Programados" count={programados.length} color={COLORS.ambar}>
        {programados.map((srv) => (
          <div key={srv.id}>
            <div className="flex justify-end mb-1">
              <button onClick={() => setModal({ srv })} className="flex items-center gap-1 text-[10px] font-semibold" style={cSlate}>
                <Pencil size={10} /> Editar ficha
              </button>
            </div>
            <TarjetaActividad
              item={{ ...srv, tipo: "servicio", tarea: srv.trabajo, fechaProgramada: srv.fecha }}
              data={data} acciones={acciones} rol="admin" />
          </div>
        ))}
        {programados.length === 0 && <Empty>Sin servicios programados.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="En Ejecución" count={enEjecucion.length} color={COLORS.orange}>
        {enEjecucion.map((srv) => (
          <div key={srv.id}>
            <div className="flex justify-end mb-1">
              <button onClick={() => setModal({ srv })} className="flex items-center gap-1 text-[10px] font-semibold" style={cSlate}>
                <Pencil size={10} /> Editar ficha
              </button>
            </div>
            <TarjetaActividad
              item={{ ...srv, tipo: "servicio", tarea: srv.trabajo, fechaProgramada: srv.fecha }}
              data={data} acciones={acciones} rol="admin" />
          </div>
        ))}
        {enEjecucion.length === 0 && <Empty>Sin servicios en ejecución.</Empty>}
      </SeccionPlegable>

      <SeccionPlegable titulo="Finalizados" count={finalizados.length} color={COLORS.verde} defaultOpen={false}>
        {finalizados.slice(0, 5).map((s) => tarjeta(s))}
        {finalizados.length > 5 && (
          <p className="text-[11px] text-center" style={cSlate}>{finalizados.length - 5} más en Histórico.</p>
        )}
        {finalizados.length === 0 && <Empty>Aún no hay servicios finalizados.</Empty>}
      </SeccionPlegable>

      {rechazados.length > 0 && (
        <SeccionPlegable titulo="Rechazados" count={rechazados.length} color={COLORS.rojo} defaultOpen={false}
          nota="No consumen presupuesto, pero quedan registrados para consulta.">
          {rechazados.map((s) => tarjeta(s))}
        </SeccionPlegable>
      )}

      {modal && (
        <Modal title={modal.srv ? "Editar solicitud" : "Solicitar servicio externo"} onClose={() => setModal(null)} wide>
          <FormServicio data={data} initial={modal.srv} onClose={() => setModal(null)}
            onSave={(f) => (modal.srv ? set(modal.srv.id, f) : crear(f))} />
        </Modal>
      )}

      {cerrar && (
        <Modal title={`Programar ${cerrar.codigo}`} onClose={() => setCerrar(null)} wide>
          <FormCerrarServicio srv={cerrar} onClose={() => setCerrar(null)}
            onConfirm={(patch) => set(cerrar.id, patch)} />
        </Modal>
      )}
    </div>
  );
}

function AdminPreventivos({ data, persist, user }) {
  const acciones = useAcciones(data, persist, user);
  const [activar, setActivar] = useState(null);
  const [fSede, setFSede] = useState("todas");
  const [q, setQ] = useState("");
  const hoy = fmtDate(new Date());

  const coincide = (x, texto) => {
    if (fSede !== "todas" && x.sedeId !== fSede) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return (texto || "").toLowerCase().includes(t) ||
      (x.codigo || "").toLowerCase().includes(t) ||
      ubicacionTexto(data.sedes, x).toLowerCase().includes(t);
  };

  // Aún sin orden generada
  const sinProgramar = ordenarPorUrgencia(
    getPendientes(data).filter((p) => p.tipo === "preventivo" && coincide(p, p.tarea))
  );

  // Órdenes vivas, separando las que quedaron con fecha vencida
  const abiertas = data.ordenes
    .filter((o) => ESTADOS_ABIERTOS.includes(o.estado) && coincide(o, o.tarea))
    .sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || ""));

  const atrasadas = abiertas.filter((o) => o.fechaProgramada && o.fechaProgramada < hoy);
  const alDia = abiertas.filter((o) => !o.fechaProgramada || o.fechaProgramada >= hoy);

  const enFlujoCostosIds = new Set(
    data.ordenes.filter((o) => ["pendiente_costeo", "pendiente_aprobacion", "en_espera", "rechazado"].includes(o.materialesEstado)).map((o) => o.id)
  );
  const programadas = alDia.filter((o) => o.estado === "programada");
  const enEjecucion = alDia.filter((o) => ["en_proceso", "espera"].includes(o.estado) && !enFlujoCostosIds.has(o.id));

  // Etapas de costo, solo de órdenes preventivas
  const soloPrev = (arr) => arr.filter((i) => i.tipo === "preventivo" && coincide(i, i.tarea));
  const enCosteo = soloPrev(itemsConMateriales(data, ["pendiente_costeo"]));
  const enAprobacion = soloPrev(itemsConMateriales(data, ["pendiente_aprobacion", "en_espera"]));
  const rechazadas = soloPrev(itemsConMateriales(data, ["rechazado"]));
  const finalizadas = data.ordenes
    .filter((o) => o.estado === "completada" && coincide(o, o.tarea))
    .sort((a, b) => (b.fechaCompletada || "").localeCompare(a.fechaCompletada || ""));

  const confirmar = ({ tecnicoId, fecha, duracionValor, duracionUnidad }) => {
    const item = activar;
    const n = data.otCounter || 1;
    persist((data) => ({
      ...data,
      ordenes: [...data.ordenes, {
        id: uid("ot"), codigo: `OT-${String(n).padStart(4, "0")}`,
        planId: item.planId, tarea: item.tarea, checklist: checklistDesdePasos(item.procedimientoPasos),
        categoria: item.categoria, frecuencia: item.frecuencia,
        duracionValor, duracionUnidad,
        sedeId: item.sedeId, faseId: item.faseId, activoId: item.activoId,
        tecnicoId, fechaProgramada: fecha, fechaCompletada: "",
        estado: "programada", observaciones: "", foto: "",
        materiales: [], materialesEstado: "", consumos: [], reprogramaciones: [],
        createdAt: fmtDate(new Date()),
      }],
      otCounter: n + 1,
    }));
    setActivar(null);
  };

  const tarjeta = (o) => (
    <TarjetaActividad key={o.id} item={{ ...o, tipo: "preventivo" }} data={data}
      acciones={acciones} rol="admin" permitirReasignar />
  );

  return (
    <div className="mt-4">
      <p className="text-xs mb-3" style={cSlate}>
        Preventivos que siguen abiertos. Los completados están en Histórico.
      </p>

      <div className="flex gap-2 mb-3 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por tarea, código o activo…"
          className="flex-1 min-w-44 border rounded-md px-3 py-2 text-sm outline-none" style={inputStyle} />
        <select value={fSede} onChange={(e) => setFSede(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm bg-white" style={inputStyle}>
          <option value="todas">Todas las sedes</option>
          {data.sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Sin Programar" value={sinProgramar.length} icon={<ClipboardList size={14} />} color={COLORS.slate} sub="Sin orden generada" />
        <Stat label="Atrasadas" value={atrasadas.length} icon={<AlertTriangle size={14} />}
          color={atrasadas.length ? COLORS.rojo : COLORS.verde} sub="Fecha ya vencida" />
        <Stat label="Vigentes" value={alDia.length} icon={<CalendarDays size={14} />} color={COLORS.orange} sub="Programadas o en curso" />
      </div>

      {atrasadas.length > 0 && (
        <div className="mb-3">
          <SeccionPlegable titulo="Atrasadas" count={atrasadas.length} color={COLORS.rojo}
            nota="Su fecha ya pasó, así que no aparecen en el calendario del mes en curso. Ábrelas y usa Reprogramar para moverlas a una fecha válida; el cambio queda en el historial.">
            {atrasadas.map((o) => (
              <div key={o.id} className="rounded-md" style={{ boxShadow: `0 0 0 1.5px ${COLORS.rojo}55` }}>
                <div className="flex items-center gap-1.5 px-2.5 pt-2">
                  <AlertTriangle size={11} color={COLORS.rojo} />
                  <span className="text-[10px] font-semibold" style={{ color: COLORS.rojo }}>
                    Programada el {o.fechaProgramada} · {Math.round((new Date(`${hoy}T00:00:00`) - new Date(`${o.fechaProgramada}T00:00:00`)) / 86400000)} día(s) de atraso
                  </span>
                </div>
                {tarjeta(o)}
              </div>
            ))}
          </SeccionPlegable>
        </div>
      )}

      <div className="space-y-3">
        <SeccionPlegable titulo="Sin Programar" count={sinProgramar.length} color={COLORS.slate}>
          {sinProgramar.map((item) => (
            <TarjetaPendiente key={item.key} item={item} sedes={data.sedes} usuarios={data.usuarios}
              onActivar={() => setActivar(item)} />
          ))}
          {sinProgramar.length === 0 && <Empty>Todo el plan preventivo está activado.</Empty>}
        </SeccionPlegable>

        <SeccionPlegable titulo="Programadas" count={programadas.length} color={COLORS.ambar}>
          {programadas.map(tarjeta)}
          {programadas.length === 0 && <Empty>Sin preventivos programados.</Empty>}
        </SeccionPlegable>

        <SeccionPlegable titulo="En Ejecución" count={enEjecucion.length} color={COLORS.orange}>
          {enEjecucion.map(tarjeta)}
          {enEjecucion.length === 0 && <Empty>Sin órdenes preventivas en ejecución.</Empty>}
        </SeccionPlegable>

        <SeccionPlegable titulo="En presupuesto" count={enCosteo.length} color={COLORS.ambar}>
          {enCosteo.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="admin" defaultOpen onUpdate={(p) => acciones.updateActividad(i, p)} />)}
          {enCosteo.length === 0 && <Empty>Nada esperando precios.</Empty>}
        </SeccionPlegable>

        <SeccionPlegable titulo="En espera de aprobación del cliente" count={enAprobacion.length} color={ESTADOS.por_aprobar.color}>
          {enAprobacion.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="admin" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
          {enAprobacion.length === 0 && <Empty>Nada esperando decisión del cliente.</Empty>}
        </SeccionPlegable>

        <SeccionPlegable titulo="Rechazados" count={rechazadas.length} color={COLORS.rojo}>
          {rechazadas.map((i) => <TarjetaCosto key={i.id} item={i} data={data} rol="admin" onUpdate={(p) => acciones.updateActividad(i, p)} />)}
          {rechazadas.length === 0 && <Empty>Nada rechazado.</Empty>}
        </SeccionPlegable>

        <SeccionPlegable titulo="Resueltas" count={finalizadas.length} color={COLORS.verde} defaultOpen={false}>
          {finalizadas.slice(0, 5).map(tarjeta)}
          {finalizadas.length > 5 && (
            <p className="text-[11px] text-center" style={cSlate}>{finalizadas.length - 5} más en Histórico.</p>
          )}
          {finalizadas.length === 0 && <Empty>Aún no hay preventivos completados.</Empty>}
        </SeccionPlegable>
      </div>

      {activar && (
        <Modal title="Activar preventivo" onClose={() => setActivar(null)}>
          <FormActivar item={activar} data={data} onConfirm={confirmar} onClose={() => setActivar(null)} />
        </Modal>
      )}
    </div>
  );
}

/* Decisión del cliente sobre un servicio externo: puede aprobarlo por el
   valor solicitado o por uno distinto, dejarlo en espera o rechazarlo. */
function TarjetaServicioCliente({ srv, data, onDecidir }) {
  const [valor, setValor] = useState(srv.presupuesto);
  const [motivo, setMotivo] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const ahora = () => `${fmtDate(new Date())} · ${fmtHora(new Date())}`;

  return (
    <div className="border rounded-md p-3" style={{ ...cardStyle, borderLeft: `3px solid #7B5EA7` }}>
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <TipoChip tipo="servicio" />
        <span className="text-[10px] font-bold" style={cChar}>{srv.codigo}</span>
        {srv.tipoProveedor && <Chip>{srv.tipoProveedor}</Chip>}
      </div>

      <p className="text-sm font-semibold" style={cChar}>{srv.trabajo}</p>
      <p className="text-xs" style={cSlate}>{ubicacionTexto(data.sedes, srv)}</p>

      {srv.detalle && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>Detalle del trabajo</p>
          <p className="text-xs whitespace-pre-wrap rounded-md p-2.5" style={{ background: COLORS.paper, color: COLORS.charcoal }}>
            {srv.detalle}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-2">
        <Dato label="Sede">{sedeNombre(data.sedes, srv.sedeId)}</Dato>
        <Dato label="Tipo de proveedor">{srv.tipoProveedor || "Sin clasificar"}</Dato>
        <Dato label="Solicitado el">{srv.createdAt || "—"}</Dato>
        <Dato label="Proveedor">{srv.proveedor || "Se define al aprobar"}</Dato>
      </div>

      {srv.foto && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>Evidencia</p>
          <img src={srv.foto} alt="Referencia" className="rounded-md max-h-48 border w-full object-contain" style={bLine} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t" style={bLine}>
        <span className="text-xs" style={cSlate}>Presupuesto solicitado</span>
        <span className="text-base font-bold" style={cOrange}>{money(srv.presupuesto)}</span>
      </div>

      {!rechazando ? (
        <>
          <Field label="Aprobar por (USD)" hint="Puedes ajustar el monto autorizado.">
            <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)}
              className="w-full border rounded-md px-2 py-2 text-sm outline-none" style={inputStyle} />
          </Field>
          <div className="grid grid-cols-3 gap-1.5 mt-2">
            <button onClick={() => onDecidir({ estado: "aprobada", presupuestoAprobado: Number(valor) || 0, decididoEn: ahora() })}
              className="text-xs font-semibold py-2 rounded-md text-white" style={{ background: COLORS.verde }}>
              Aprobar
            </button>
            <button onClick={() => onDecidir({ estado: "por_aprobar", enEspera: true, decididoEn: ahora() })}
              className="text-xs font-semibold py-2 rounded-md border" style={{ borderColor: COLORS.ambar, color: COLORS.ambar }}>
              En espera
            </button>
            <button onClick={() => setRechazando(true)}
              className="text-xs font-semibold py-2 rounded-md border" style={{ borderColor: COLORS.rojo, color: COLORS.rojo }}>
              Rechazar
            </button>
          </div>
        </>
      ) : (
        <div className="mt-2">
          <Field label="Motivo del rechazo">
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
              placeholder="Por qué no se autoriza este servicio" className={`${inputCls} resize-none`} style={inputStyle} />
          </Field>
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => setRechazando(false)}
              className="flex-1 text-xs font-semibold py-2 rounded-md border" style={{ borderColor: COLORS.line, color: COLORS.charcoal }}>
              Cancelar
            </button>
            <button disabled={!motivo.trim()}
              onClick={() => onDecidir({ estado: "rechazada", motivoRechazo: motivo.trim(), decididoEn: ahora() })}
              className="flex-1 text-xs font-semibold py-2 rounded-md text-white disabled:opacity-40" style={{ background: COLORS.rojo }}>
              Confirmar rechazo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Agrupa los tres tipos de actividad en un solo apartado. */
function AdminActividades({ data, persist, user }) {
  const [sub, setSub] = useState("preventivos");
  const hoy = fmtDate(new Date());

  const nPrev = getPendientes(data).filter((p) => p.tipo === "preventivo").length +
    data.ordenes.filter((o) => ESTADOS_ABIERTOS.includes(o.estado)).length;
  const nCorr = data.solicitudes.filter((s) => s.estado !== "completada").length;
  const nServ = (data.servicios || []).filter((s) => s.estado !== "completada").length;
  const atrasados = data.ordenes.filter((o) => ESTADOS_ABIERTOS.includes(o.estado) && o.fechaProgramada && o.fechaProgramada < hoy).length;

  const subs = [
    { id: "preventivos", label: "Preventivos", icon: <ClipboardList size={14} />, n: nPrev, alerta: atrasados },
    { id: "correctivos", label: "Correctivos", icon: <AlertTriangle size={14} />, n: nCorr },
    { id: "servicios", label: "Servicios", icon: <Wrench size={14} />, n: nServ },
    { id: "historico", label: "Histórico", icon: <Clock size={14} /> },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-1 mb-1 overflow-x-auto pb-1">
        {subs.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap shrink-0"
            style={{
              background: sub === t.id ? `${COLORS.orange}15` : "white",
              color: sub === t.id ? COLORS.orange : COLORS.slate,
              border: `1px solid ${sub === t.id ? COLORS.orange : COLORS.line}`,
            }}>
            {t.icon} {t.label}
            {t.n > 0 && <Chip color={sub === t.id ? COLORS.orange : COLORS.slate}>{t.n}</Chip>}
            {t.alerta > 0 && <Chip color={COLORS.rojo}>{t.alerta} atrasadas</Chip>}
          </button>
        ))}
      </div>

      {sub === "preventivos" && <AdminPreventivos data={data} persist={persist} user={user} />}
      {sub === "correctivos" && <AdminCorrectivos data={data} persist={persist} user={user} />}
      {sub === "servicios" && <AdminServicios data={data} persist={persist} user={user} />}
      {sub === "historico" && <VistaHistorico data={data} sedes={data.sedes} rol="admin" />}
    </div>
  );
}

/* ============================================================================
   REINICIO DE DATOS  ·  para ciclos de prueba
   Los usuarios nunca se borran: sin ellos nadie podría entrar al sistema.
   Borrar sedes arrastra todo lo que cuelga de ellas, porque una actividad
   sin su activo quedaría huérfana y rompería los indicadores.
   ========================================================================= */

function AdminReinicio({ data, persist }) {
  const [sel, setSel] = useState({ actividades: true, planes: true, bodega: false, sedes: false, resumenes: true });
  const [confirmar, setConfirmar] = useState(false);
  const [hecho, setHecho] = useState("");

  const nActividades = (data.ordenes || []).length + (data.solicitudes || []).length + (data.servicios || []).length;
  const nPlanes = (data.planes || []).length;
  const nBodega = (data.stock || []).length;
  const nActivos = flattenActivos(data.sedes).length;
  const nResumenes = Object.keys(data.resumenesMes || {}).length;

  // Borrar sedes obliga a borrar lo que depende de ellas
  const sedesArrastra = sel.sedes;
  const efectivo = {
    actividades: sel.actividades || sedesArrastra,
    planes: sel.planes || sedesArrastra,
    bodega: sel.bodega || sedesArrastra,
    sedes: sel.sedes,
    resumenes: sel.resumenes || sedesArrastra,
  };

  const grupos = [
    { id: "actividades", label: "Actividades", detalle: `${nActividades} entre órdenes, solicitudes y servicios`, n: nActividades },
    { id: "planes", label: "Planes de mantenimiento", detalle: `${nPlanes} planes con sus procedimientos y aplicaciones`, n: nPlanes },
    { id: "bodega", label: "Bodega", detalle: `${nBodega} artículos en stock`, n: nBodega },
    { id: "resumenes", label: "Resúmenes de gestión", detalle: `${nResumenes} mes(es) generados`, n: nResumenes },
    { id: "sedes", label: "Sedes, fases y activos", detalle: `${data.sedes.length} sedes · ${nActivos} activos`, n: data.sedes.length, peligroso: true },
  ];

  const algoSeleccionado = Object.values(efectivo).some(Boolean);

  const ejecutar = () => {
    const d = { ...data };

    if (efectivo.actividades) {
      d.ordenes = []; d.solicitudes = []; d.servicios = [];
      d.otCounter = 1; d.solCounter = 1; d.srvCounter = 1;
    }
    if (efectivo.planes) d.planes = [];
    if (efectivo.bodega) d.stock = [];
    if (efectivo.resumenes) d.resumenesMes = {};
    if (efectivo.sedes) {
      d.sedes = [];
      // Los usuarios conservan su rol pero pierden el alcance de sedes borradas
      d.usuarios = d.usuarios.map((u) => ({ ...u, sedeIds: [] }));
    }

    persist(d);
    const partes = grupos.filter((g) => efectivo[g.id]).map((g) => g.label.toLowerCase());
    setHecho(`Se limpiaron: ${partes.join(", ")}. Los ${data.usuarios.length} usuarios se conservaron.`);
    setConfirmar(false);
    setTimeout(() => setHecho(""), 8000);
  };

  return (
    <div className="mt-3">
      <p className="text-xs mb-3" style={cSlate}>
        Vacía las colecciones que elijas para volver a cargar información desde cero.
        Los usuarios y sus claves nunca se borran.
      </p>

      <div className="space-y-2">
        {grupos.map((g) => {
          const marcado = efectivo[g.id];
          const forzado = marcado && !sel[g.id];
          return (
            <button key={g.id} onClick={() => setSel({ ...sel, [g.id]: !sel[g.id] })}
              className="w-full flex items-start gap-2.5 border rounded-md p-2.5 text-left"
              style={{
                borderColor: marcado ? (g.peligroso ? COLORS.rojo : COLORS.orange) : COLORS.line,
                background: marcado ? (g.peligroso ? `${COLORS.rojo}0D` : `${COLORS.orange}0D`) : "white",
              }}>
              <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  borderColor: marcado ? (g.peligroso ? COLORS.rojo : COLORS.orange) : COLORS.line,
                  background: marcado ? (g.peligroso ? COLORS.rojo : COLORS.orange) : "white",
                }}>
                {marcado && <CheckCircle2 size={11} color="white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-xs font-semibold flex items-center gap-1.5" style={cChar}>
                  {g.label}
                  {g.peligroso && <Chip color={COLORS.rojo}>arrastra todo</Chip>}
                  {forzado && <Chip color={COLORS.slate}>incluido</Chip>}
                </span>
                <span className="text-[10px] block" style={cSlate}>{g.detalle}</span>
              </span>
              <Chip color={g.n > 0 ? COLORS.charcoal : COLORS.slate}>{g.n}</Chip>
            </button>
          );
        })}
      </div>

      {sedesArrastra && (
        <p className="text-[11px] rounded-md p-2.5 mt-2.5" style={{ background: `${COLORS.rojo}12`, color: COLORS.charcoal }}>
          Al borrar las sedes también se eliminan planes, actividades y bodega, porque todos cuelgan de un activo.
          Los usuarios se conservan, pero quedarán sin sedes asignadas: tendrás que reasignarlas en Usuarios.
        </p>
      )}

      <div className="mt-3 pt-3 border-t" style={bLine}>
        {!confirmar ? (
          <button onClick={() => setConfirmar(true)} disabled={!algoSeleccionado}
            className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40"
            style={{ background: COLORS.charcoal }}>
            Limpiar lo seleccionado
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-center" style={{ color: COLORS.rojo }}>
              Esta acción no se puede deshacer. ¿Continuar?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmar(false)}
                className="flex-1 py-2.5 rounded-md font-semibold text-sm border"
                style={{ borderColor: COLORS.line, color: COLORS.charcoal }}>
                Cancelar
              </button>
              <button onClick={ejecutar}
                className="flex-1 py-2.5 rounded-md font-semibold text-sm text-white"
                style={{ background: COLORS.rojo }}>
                Sí, limpiar
              </button>
            </div>
          </div>
        )}
      </div>

      {hecho && (
        <div className="text-sm rounded-md p-3 mt-3 flex items-start gap-2" style={{ background: `${COLORS.verde}15`, color: COLORS.verde }}>
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> {hecho}
        </div>
      )}
    </div>
  );
}

function AdminConfiguracion({ data, persist, setPlanModal }) {
  const [sub, setSub] = useState("usuarios");
  const subs = [
    { id: "usuarios", label: "Usuarios", icon: <Users size={14} /> },
    { id: "planes", label: "Planes de mantenimiento", icon: <ClipboardList size={14} /> },
    { id: "reinicio", label: "Reiniciar datos", icon: <Trash2 size={14} /> },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-1 mb-1 overflow-x-auto pb-1">
        {subs.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap shrink-0"
            style={{
              background: sub === t.id ? `${COLORS.orange}15` : "white",
              color: sub === t.id ? COLORS.orange : COLORS.slate,
              border: `1px solid ${sub === t.id ? COLORS.orange : COLORS.line}`,
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {sub === "usuarios" && <AdminUsuarios data={data} persist={persist} />}
      {sub === "reinicio" && <AdminReinicio data={data} persist={persist} />}

      {sub === "planes" && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <p className="text-xs" style={cSlate}>Catálogo de tareas preventivas y dónde aplican.</p>
            <button onClick={() => setPlanModal({})} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white" style={{ background: COLORS.orange }}>
              <Plus size={13} /> Nuevo plan
            </button>
          </div>
          <div className="space-y-2">
            {data.planes.map((p) => (
              <TarjetaPlan key={p.id} plan={p} sedes={data.sedes}
                onEdit={() => setPlanModal({ plan: p })}
                onDelete={() => persist((data) => ({ ...data, planes: data.planes.filter((x) => x.id !== p.id) }))} />
            ))}
            {data.planes.length === 0 && <Empty>Aún no hay planes. Crea el primero con "Nuevo plan".</Empty>}
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
  const valorTotal = items.reduce((a, x) => a + x.cantidad * x.costoUnitario, 0);
  const bajos = items.filter((x) => x.cantidad <= x.minimo);
  const agotados = items.filter((x) => x.cantidad <= 0);

  const setItem = (id, patch) => persist((data) => ({ ...data, stock: data.stock.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const th = "text-left text-[10px] font-semibold uppercase tracking-wide px-2.5 py-2 whitespace-nowrap";
  const td = "px-2.5 py-2 text-xs align-middle";
  const cellInput = "w-full border rounded px-1.5 py-1 text-xs outline-none bg-white";

  return (
    <div className="mt-4">
      <p className="text-xs mb-3" style={cSlate}>
        {editable
          ? "Insumos ya comprados. El técnico los consume directo en preventivos: el consumo descuenta existencias y carga su valor al presupuesto de la sede, sin aprobación."
          : "Existencias disponibles en tus sedes. Se descuentan solas cuando cargas un consumo en una actividad preventiva."}
      </p>

      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm bg-white" style={inputStyle}>
          {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        {editable && (
          <button onClick={() => setNuevo({ nombre: "", unidad: "u", cantidad: 0, costoUnitario: 0, minimo: 0 })}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white" style={{ background: COLORS.orange }}>
            <Plus size={13} /> Agregar artículo
          </button>
        )}
      </div>

      <div className={`grid ${editable ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2"} gap-3 mb-3`}>
        <Stat label="Artículos" value={items.length} icon={<ClipboardList size={14} />} color={COLORS.charcoal}
          sub={agotados.length ? `${agotados.length} agotado(s)` : "Todos con existencias"} />
        <Stat label="Bajo mínimo" value={bajos.length} icon={<AlertTriangle size={14} />}
          color={bajos.length ? COLORS.rojo : COLORS.verde}
          sub={bajos.length ? bajos.map((b) => b.nombre).slice(0, 2).join(", ") : "Todo abastecido"} />
        {editable && (
          <Stat label="Valor en bodega" value={money(valorTotal)} icon={<Wallet size={14} />} color={COLORS.orange} sub="Existencias × costo" />
        )}
      </div>

      <div className="border rounded-md overflow-x-auto" style={cardStyle}>
        <table className="w-full border-collapse" style={{ minWidth: editable ? 640 : 420 }}>
          <thead>
            <tr style={{ background: COLORS.charcoal }}>
              <th className={th} style={{ color: "white" }}>Artículo</th>
              <th className={th} style={{ color: "white" }}>Existencias</th>
              <th className={th} style={{ color: "white" }}>Unidad</th>
              <th className={th} style={{ color: "white" }}>Mínimo</th>
              {editable && <th className={th} style={{ color: "white" }}>Costo unit.</th>}
              {editable && <th className={th} style={{ color: "white" }}>Valor</th>}
              <th className={th} style={{ color: "white" }}>Estado</th>
              {editable && <th className={th} style={{ color: "white" }}></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => {
              const agotado = x.cantidad <= 0;
              const bajo = !agotado && x.cantidad <= x.minimo;
              const color = agotado ? COLORS.rojo : bajo ? COLORS.ambar : COLORS.verde;
              return (
                <tr key={x.id} style={{ background: i % 2 ? COLORS.paper : "white", borderTop: `1px solid ${COLORS.line}` }}>
                  <td className={td} style={{ ...cChar, fontWeight: 600 }}>
                    {editable
                      ? <CampoVivo value={x.nombre} onCommit={(v) => setItem(x.id, { nombre: v })}
                          className={cellInput} style={bLine} />
                      : x.nombre}
                  </td>
                  <td className={td}>
                    {editable
                      ? <CampoVivo type="number" min="0" value={x.cantidad}
                          onCommit={(v) => setItem(x.id, { cantidad: Number(v) || 0 })}
                          className={cellInput} style={{ borderColor: COLORS.line, width: 68 }} />
                      : <span style={{ color, fontWeight: 700 }}>{x.cantidad}</span>}
                  </td>
                  <td className={td} style={cSlate}>
                    {editable
                      ? <CampoVivo value={x.unidad} onCommit={(v) => setItem(x.id, { unidad: v })}
                          className={cellInput} style={{ borderColor: COLORS.line, width: 74 }} />
                      : x.unidad}
                  </td>
                  <td className={td} style={cSlate}>
                    {editable
                      ? <CampoVivo type="number" min="0" value={x.minimo}
                          onCommit={(v) => setItem(x.id, { minimo: Number(v) || 0 })}
                          className={cellInput} style={{ borderColor: COLORS.line, width: 62 }} />
                      : x.minimo}
                  </td>
                  {editable && (
                    <td className={td}>
                      <CampoVivo type="number" min="0" step="0.01" value={x.costoUnitario}
                        onCommit={(v) => setItem(x.id, { costoUnitario: Number(v) || 0 })}
                        className={cellInput} style={{ borderColor: COLORS.line, width: 78 }} />
                    </td>
                  )}
                  {editable && (
                    <td className={td} style={{ ...cOrange, fontWeight: 700 }}>{money(x.cantidad * x.costoUnitario)}</td>
                  )}
                  <td className={td}>
                    <Chip color={color}>{agotado ? "Agotado" : bajo ? "Bajo mínimo" : "Disponible"}</Chip>
                  </td>
                  {editable && (
                    <td className={td}>
                      <DeleteBtn onConfirm={() => persist((data) => ({ ...data, stock: data.stock.filter((y) => y.id !== x.id) }))} />
                    </td>
                  )}
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={editable ? 8 : 5} className="px-3 py-5 text-sm text-center" style={cSlate}>
                Esta sede aún no tiene artículos en bodega.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {nuevo && (
        <Modal title="Nuevo artículo de bodega" onClose={() => setNuevo(null)}>
          <div className="space-y-3">
            <Field label="Nombre del artículo">
              <input autoFocus value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                placeholder="Ej. Foco LED 18W" className={inputCls} style={inputStyle} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cantidad inicial">
                <input type="number" min="0" value={nuevo.cantidad}
                  onChange={(e) => setNuevo({ ...nuevo, cantidad: Number(e.target.value) || 0 })} className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Unidad">
                <input value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })}
                  placeholder="u, galón, rollo…" className={inputCls} style={inputStyle} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Costo unitario (USD)">
                <input type="number" min="0" step="0.01" value={nuevo.costoUnitario}
                  onChange={(e) => setNuevo({ ...nuevo, costoUnitario: Number(e.target.value) || 0 })} className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Mínimo de alerta">
                <input type="number" min="0" value={nuevo.minimo}
                  onChange={(e) => setNuevo({ ...nuevo, minimo: Number(e.target.value) || 0 })} className={inputCls} style={inputStyle} />
              </Field>
            </div>
            <button disabled={!nuevo.nombre.trim()}
              onClick={() => {
                persist((data) => ({ ...data, stock: [...(data.stock || []), { ...nuevo, id: uid("stk"), sedeId, nombre: nuevo.nombre.trim() }] }));
                setNuevo(null);
              }}
              className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40" style={{ background: COLORS.orange }}>
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
  const pre = (data.ordenes || []).filter((o) => o.estado === "completada" && dentro(o))
    .map((o) => ({ ...o, tipo: "preventivo" }));
  const cor = (data.solicitudes || []).filter((s) => s.estado === "completada" && dentro(s))
    .map((s) => ({ ...s, tipo: "correctivo", tarea: s.descripcion }));
  const srv = (data.servicios || []).filter((s) => s.estado === "completada" && dentro(s))
    .map((s) => ({ ...s, tipo: "servicio", tarea: s.trabajo, fechaCompletada: s.fecha }));
  return [...pre, ...cor, ...srv].sort((a, b) =>
    (b.fechaCompletada || "").localeCompare(a.fechaCompletada || ""));
}

/* Exporta el histórico a CSV. Formato simple de tabla, una fila por tarea. */
function exportarCSV(filas, data) {
  const cols = [
    "Tipo", "Codigo", "Tarea", "Sede", "Ubicacion", "Categoria",
    "Fecha solicitud", "Fecha cierre", "Hora cierre", "Tiempo respuesta (dias)",
    "Responsable", "Solicitante", "Costo USD", "Calificacion", "Observaciones", "Resolucion",
  ];
  const esc = (v) => {
    const t = String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ");
    return /[",;]/.test(t) ? `"${t}"` : t;
  };

  const filasCsv = filas.map((h) => {
    const esServ = h.tipo === "servicio";
    const costo = esServ ? costoServicio(h) : costoAprobado(h) + costoConsumos(h);
    const resp = h.tipo === "correctivo" && h.fecha && h.fechaCompletada
      ? (horasEntre(h.fecha, h.hora, h.fechaCompletada, h.horaCompletada) / 24).toFixed(2) : "";
    return [
      tipoMeta(h.tipo).label, h.codigo, h.tarea,
      sedeNombre(data.sedes, h.sedeId), ubicacionTexto(data.sedes, h), h.categoria || "",
      h.fecha || "", h.fechaCompletada || "", h.horaCompletada || "", resp,
      esServ ? (h.proveedor || "") : usuarioNombre(data.usuarios, h.tecnicoId),
      h.solicitanteId ? usuarioNombre(data.usuarios, h.solicitanteId) : "",
      costo.toFixed(2), h.calificacion || "", h.observaciones || "", h.resolucion || "",
    ].map(esc).join(",");
  });

  // BOM para que Excel respete tildes
  const csv = "\uFEFF" + [cols.join(","), ...filasCsv].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
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
  const costo = items.reduce((a, h) =>
    a + (h.tipo === "servicio" ? costoServicio(h) : costoAprobado(h) + costoConsumos(h)), 0);

  return (
    <div className="border rounded-md overflow-hidden" style={{ borderColor: COLORS.line, borderLeft: `3px solid ${meta.color}` }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2.5"
        style={{ background: open ? COLORS.paper : "white" }}>
        {open ? <ChevronDown size={14} color={COLORS.slate} /> : <ChevronRight size={14} color={COLORS.slate} />}
        <span className="text-xs font-bold uppercase tracking-wide flex-1 text-left" style={{ color: meta.color }}>
          {TIPO_PLURAL[tipo]}
        </span>
        {costo > 0 && <Chip color={COLORS.orange}>{money(costo)}</Chip>}
        <Chip color={meta.color}>{items.length}</Chip>
      </button>
      {open && (
        <div className="p-2 space-y-2" style={{ borderTop: `1px solid ${COLORS.line}` }}>
          {items.map((h) => <RegistroHistorico key={h.id} h={h} data={data} />)}
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

  const todo = useMemo(() => historicoDe(data, sedeIds), [data, sedeIds.join(",")]);

  const filtrado = todo.filter((h) => {
    if (fSede !== "todas" && h.sedeId !== fSede) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return (h.codigo || "").toLowerCase().includes(t) ||
      (h.tarea || "").toLowerCase().includes(t) ||
      (h.proveedor || "").toLowerCase().includes(t) ||
      usuarioNombre(data.usuarios, h.tecnicoId).toLowerCase().includes(t) ||
      ubicacionTexto(data.sedes, h).toLowerCase().includes(t);
  });

  const ordenar = (arr) => [...arr].sort((a, b) => {
    const fa = a.fechaCompletada || "", fb = b.fechaCompletada || "";
    return orden === "reciente" ? fb.localeCompare(fa) : fa.localeCompare(fb);
  });

  const costoTotal = filtrado.reduce((a, h) =>
    a + (h.tipo === "servicio" ? costoServicio(h) : costoAprobado(h) + costoConsumos(h)), 0);

  const grupos = ["preventivo", "correctivo", "servicio"]
    .map((t) => ({ tipo: t, items: ordenar(filtrado.filter((h) => h.tipo === t)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-4">
      <p className="text-xs mb-3" style={cSlate}>
        Todo lo ejecutado y cerrado, agrupado por tipo. Busca por código (OT, SOL, SRV), tarea, activo, técnico o proveedor.
      </p>

      <div className="flex gap-2 mb-3 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar: OT-0001, SOL-0003, luminarias, Cristian…"
          className="flex-1 min-w-48 border rounded-md px-3 py-2 text-sm outline-none" style={inputStyle} />
        {sedes.length > 1 && (
          <select value={fSede} onChange={(e) => setFSede(e.target.value)} className="border rounded-md px-2 py-2 text-sm bg-white" style={inputStyle}>
            <option value="todas">Todas las sedes</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        <select value={orden} onChange={(e) => setOrden(e.target.value)} className="border rounded-md px-2 py-2 text-sm bg-white" style={inputStyle}>
          <option value="reciente">Más reciente primero</option>
          <option value="antiguo">Más antiguo primero</option>
        </select>
        <button onClick={() => exportarCSV(ordenar(filtrado), data)} disabled={filtrado.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white disabled:opacity-40"
          style={{ background: COLORS.charcoal }}>
          <Download size={13} /> Descargar CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Stat label="Tareas cerradas" value={filtrado.length} icon={<CheckCircle2 size={14} />} color={COLORS.verde}
          sub={q.trim() || fSede !== "todas" ? `de ${todo.length} en total` : "Histórico completo"} />
        <Stat label="Costo acumulado" value={money(costoTotal)} icon={<DollarSign size={14} />} color={COLORS.orange} sub="Materiales, bodega y servicios" />
      </div>

      <div className="space-y-2">
        {grupos.map((g, i) => (
          <GrupoHistorico key={g.tipo} tipo={g.tipo} items={g.items} data={data} abiertoInicial={grupos.length === 1 || i === 0} />
        ))}
        {grupos.length === 0 && (
          <Empty>{q.trim() ? `Sin resultados para “${q}”.` : "Todavía no hay tareas cerradas."}</Empty>
        )}
      </div>
    </div>
  );
}

function RegistroHistorico({ h, data }) {
  const [open, setOpen] = useState(false);
  const esServ = h.tipo === "servicio";
  const costo = esServ ? costoServicio(h) : costoAprobado(h) + costoConsumos(h);
  const respuesta = h.tipo === "correctivo" && h.fecha && h.fechaCompletada
    ? duracionTexto(horasEntre(h.fecha, h.hora, h.fechaCompletada, h.horaCompletada) / 24) : null;

  return (
    <div className="border rounded-md" style={{ ...cardStyle, borderLeft: `3px solid ${tipoMeta(h.tipo).color}` }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3 text-left gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {open ? <ChevronDown size={16} color={COLORS.slate} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} color={COLORS.slate} className="mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TipoChip tipo={h.tipo} />
              <span className="text-[10px] font-bold" style={cChar}>{h.codigo}</span>
              {h.calificacion > 0 && <Estrellas valor={h.calificacion} size={11} readOnly />}
            </div>
            <p className="font-semibold text-sm mt-1 truncate" style={cChar}>{h.tarea}</p>
            <p className="text-xs truncate" style={cSlate}>{ubicacionTexto(data.sedes, h)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-semibold" style={{ color: COLORS.verde }}>{h.fechaCompletada || "—"}</span>
            {costo > 0 && <span className="text-xs font-bold" style={cOrange}>{money(costo)}</span>}
          </div>
          <BotonDetalle item={h} />
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t pt-3 space-y-2.5" style={bLine}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="font-semibold" style={cSlate}>{esServ ? "Proveedor" : "Ejecutó"}</p>
              <p style={cChar}>{esServ ? (h.proveedor || "—") : usuarioNombre(data.usuarios, h.tecnicoId)}</p>
            </div>
            <div>
              <p className="font-semibold" style={cSlate}>Cierre</p>
              <p style={cChar}>{h.fechaCompletada || "—"}{h.horaCompletada ? ` · ${h.horaCompletada}` : ""}</p>
            </div>
            {h.tipo === "correctivo" && (
              <>
                <div>
                  <p className="font-semibold" style={cSlate}>Solicitó</p>
                  <p style={cChar}>{usuarioNombre(data.usuarios, h.solicitanteId)} · {h.fecha}</p>
                </div>
                <div>
                  <p className="font-semibold" style={cSlate}>Tiempo de respuesta</p>
                  <p style={{ color: COLORS.verde, fontWeight: 600 }}>{respuesta || "—"}</p>
                </div>
              </>
            )}
          </div>

          {h.observaciones && <Field label="Observaciones"><ReadOnly>{h.observaciones}</ReadOnly></Field>}
          {h.resolucion && <Field label="Resolución"><ReadOnly>{h.resolucion}</ReadOnly></Field>}
          {h.comentarioCalif && (
            <Field label="Comentario del solicitante"><ReadOnly>“{h.comentarioCalif}”</ReadOnly></Field>
          )}

          {(h.consumos || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>Consumo de bodega</p>
              {h.consumos.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span style={cChar}>{c.nombre} · {c.cantidad} {c.unidad}</span>
                  <span className="font-semibold" style={cOrange}>{money(c.cantidad * c.costoUnitario)}</span>
                </div>
              ))}
            </div>
          )}

          {(h.materiales || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={cSlate}>
                Materiales {h.materialesEstado === "aprobado" ? "(aprobados)" : `(${MAT_ESTADO[h.materialesEstado]?.label || "sin aprobar"})`}
              </p>
              {h.materiales.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span style={cChar}>{m.nombre} · {m.cantidad} {m.unidad}</span>
                  <span className="font-semibold" style={cOrange}>{money(m.cantidad * m.costoUnitario)}</span>
                </div>
              ))}
            </div>
          )}

          {h.foto && <img src={h.foto} alt="Evidencia" className="rounded-md max-h-40 border" style={bLine} />}
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
    claves.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const activos = flattenActivos(data.sedes);
  const enVentana = (data.solicitudes || []).filter(
    (s) => sedeIds.includes(s.sedeId) && claves.has(mesKey(s.fecha))
  );

  const porActivo = {};
  enVentana.forEach((s) => {
    const k = `${s.sedeId}|${s.activoId}`;
    (porActivo[k] = porActivo[k] || { sedeId: s.sedeId, activoId: s.activoId, count: 0 }).count++;
  });

  return Object.values(porActivo)
    .filter((x) => x.count >= 2)
    .map((x) => ({
      ...x,
      nombre: activos.find((a) => a.activoId === x.activoId)?.activoNombre || "un activo",
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
  const avance = avancePlan(data, sedeIds, mes);
  const presu = sedeIds.length > 1 ? presupuestoGlobalMes(data, mes) : { ...presupuestoSedeMes(data, sedeIds[0], mes) };
  const ambito = sedes.length > 1 ? "el conjunto de sedes" : sedes[0]?.nombre || "la sede";

  // --- Párrafo general: texto plano + tramos en negrita (indicadores y remanente) ---
  const p = [];
  const txt = (t) => p.push({ t, b: false });
  const neg = (t) => p.push({ t, b: true });

  txt(`En ${mesLabel(mes)}, ${ambito} registró `);
  neg(`${kpi.nFallas} correctivo${kpi.nFallas === 1 ? "" : "s"} (${kpi.cerrados} cerrado${kpi.cerrados === 1 ? "" : "s"})`);
  txt(avance.total > 0 ? " y un cumplimiento del plan preventivo de " : ". ");
  if (avance.total > 0) { neg(`${avance.cumplimiento.toFixed(0)}%`); txt(". "); }
  if (kpi.mtbf !== null) { txt("El tiempo medio entre fallas fue de "); neg(`${kpi.mtbf.toFixed(1)} días`); txt(kpi.mttr !== null ? " y el de respuesta de " : ". "); }
  if (kpi.mtbf !== null && kpi.mttr !== null) { neg(duracionTexto(kpi.mttr)); txt(". "); }
  txt("El presupuesto de materiales cerró con ");
  neg(`${money(Math.max(0, presu.disponible))} disponibles`);
  txt(` de ${money(presu.presupuesto)}. `);
  if (sat.promedio !== null) { txt("La satisfacción promedio fue de "); neg(`${sat.promedio.toFixed(1)}/5`); txt("."); }

  // --- Viñetas por sede: solo recurrencias, servicios que subieron el costo, costo/estudiante ---
  const vinetas = sedes.map((s) => {
    const recurr = recurrenciasCorrectivos(data, [s.id], mes);
    const serviciosMes = (data.servicios || []).filter((x) => x.sedeId === s.id && mesServicio(x) === mes && costoServicio(x) > 0);
    const kSede = indicadoresMes(data, [s.id], mes);

    const partes = [];
    partes.push(
      recurr.length > 0
        ? `falla recurrente en ${recurr[0].nombre} (${recurr[0].count}×)`
        : "sin fallas recurrentes"
    );
    partes.push(
      serviciosMes.length > 0
        ? `${serviciosMes.length > 1 ? `${serviciosMes.length} servicios externos, el mayor` : "servicio externo"} ${serviciosMes[0].trabajo.length > 28 ? serviciosMes[0].trabajo.slice(0, 26) + "…" : serviciosMes[0].trabajo} (${money(costoServicio(serviciosMes[0]))}) subió el costo`
        : "sin servicios externos este mes"
    );
    partes.push(
      kSede.costoPorEstudiante !== null ? `${money(kSede.costoPorEstudiante)}/estudiante` : "sin estudiantes registrados"
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

const _esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/* Barras verticales agrupadas. series: [{nombre,color,valores[]}] */
function svgBarras(labels, series, { w = 500, h = 150, fmt = (v) => v } = {}) {
  const pad = { t: 12, r: 8, b: 26, l: 34 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const paso = iw / Math.max(1, labels.length);
  const bw = Math.min(26, (paso * 0.62) / series.length);

  const ejes = [0, 0.5, 1].map((f) => {
    const y = pad.t + ih - f * ih;
    return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#E3E0D8"/>
            <text x="${pad.l - 5}" y="${y + 3}" text-anchor="end" font-size="7" fill="#8D939B">${fmt(Math.round(max * f))}</text>`;
  }).join("");

  const barras = labels.map((l, i) => {
    const cx = pad.l + paso * i + paso / 2;
    const grupo = series.map((s, j) => {
      const v = s.valores[i] || 0;
      const bh = (v / max) * ih;
      const x = cx - (bw * series.length) / 2 + bw * j;
      return `<rect x="${x}" y="${pad.t + ih - bh}" width="${bw - 1.5}" height="${Math.max(0, bh)}" fill="${s.color}" rx="1"/>` +
        (v > 0 ? `<text x="${x + bw / 2 - 0.75}" y="${pad.t + ih - bh - 2.5}" text-anchor="middle" font-size="6.5" fill="#35383C">${fmt(v)}</text>` : "");
    }).join("");
    return grupo + `<text x="${cx}" y="${h - 8}" text-anchor="middle" font-size="7" fill="#787D85">${_esc(l)}</text>`;
  }).join("");

  const leyenda = series.length > 1
    ? `<g>${series.map((s, i) =>
        `<rect x="${pad.l + i * 78}" y="2" width="7" height="7" fill="${s.color}" rx="1"/>
         <text x="${pad.l + i * 78 + 10}" y="8.5" font-size="7" fill="#787D85">${_esc(s.nombre)}</text>`).join("")}</g>`
    : "";

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${ejes}${barras}${leyenda}</svg>`;
}

/* Medidor semicircular para MTBF / MTTR */
function svgMedidor(valor, max, color, unidad = "d") {
  const w = 150, h = 88, cx = w / 2, cy = 74, r = 52, gr = 13;
  const frac = valor === null ? 0 : Math.max(0, Math.min(valor / max, 1));
  const arco = (desde, hasta, col) => {
    const a1 = Math.PI - desde * Math.PI, a2 = Math.PI - hasta * Math.PI;
    const p = (a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    const [x1, y1] = p(a1), [x2, y2] = p(a2);
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
function svgLinea(puntos, { w = 500, h = 150, color = "#ED5B23", fmt = (v) => v } = {}) {
  const pad = { t: 14, r: 12, b: 24, l: 40 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const vals = puntos.map((p) => p.v);
  const max = Math.max(0.001, ...vals) * 1.15;
  const paso = puntos.length > 1 ? iw / (puntos.length - 1) : 0;
  const xy = (p, i) => [pad.l + paso * i, pad.t + ih - (p.v / max) * ih];

  const grid = [0, 0.5, 1].map((f) => {
    const y = pad.t + ih - f * ih;
    return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#E3E0D8"/>
            <text x="${pad.l - 5}" y="${y + 3}" text-anchor="end" font-size="7" fill="#8D939B">${fmt(max * f)}</text>`;
  }).join("");

  const d = puntos.map((p, i) => { const [x, y] = xy(p, i); return `${i ? "L" : "M"} ${x} ${y}`; }).join(" ");
  const pts = puntos.map((p, i) => {
    const [x, y] = xy(p, i);
    return `<circle cx="${x}" cy="${y}" r="2.6" fill="${color}"/>
            <text x="${x}" y="${y - 6}" text-anchor="middle" font-size="6.5" fill="#35383C">${fmt(p.v)}</text>
            <text x="${x}" y="${h - 7}" text-anchor="middle" font-size="7" fill="#787D85">${_esc(p.label)}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}
    <path d="${d}" stroke="${color}" stroke-width="2" fill="none"/>${pts}</svg>`;
}

/* Barra apilada horizontal (cumplimiento del plan, presupuesto) */
function barraApilada(segmentos, { alto = 11 } = {}) {
  const total = segmentos.reduce((a, s) => a + s.v, 0) || 1;
  return `<div class="stack" style="height:${alto}px">` +
    segmentos.filter((s) => s.v > 0).map((s) =>
      `<span style="width:${(s.v / total) * 100}%;background:${s.c}" title="${_esc(s.n)}"></span>`).join("") +
    `</div>`;
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
  const r = data.resumenesMes?.[mes] || generarResumenUnificado(data, sedes, mes);
  const parrafoHTML = r.parrafo.map((seg) => (seg.b ? `<b>${_esc(seg.t)}</b>` : _esc(seg.t))).join("");
  const vinetasHTML = r.vinetas.map((v) => `<li><b>${_esc(v.nombre)}:</b> ${_esc(v.texto)}</li>`).join("");
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
    ${cel("MTBF", kpi.mtbf !== null ? `${kpi.mtbf.toFixed(1)} d` : "—",
        kpi.nFallas > 0 ? `${kpi.diasTranscurridos} d ÷ ${kpi.nFallas} correctivos` : "sin correctivos", colorMTBF(kpi.mtbf))}
    ${cel("MTTR", kpi.mttr !== null ? duracionTexto(kpi.mttr) : "—",
        kpi.cerrados > 0 ? `promedio de ${kpi.cerrados} cierre(s)` : "sin cierres", colorMTTR(kpi.mttr))}
    ${cel("Satisfacción", sat.promedio !== null ? `${sat.promedio.toFixed(1)} / 5` : "—",
        sat.total > 0 ? `${sat.total} de ${sat.cerradas} calificadas` : "sin calificaciones",
        sat.promedio === null ? "#8D939B" : sat.promedio >= 4.5 ? "#2E7D5B" : sat.promedio >= 3.5 ? "#D9A441" : "#C1442D")}
  </div>`;
}

function filaCumplimiento(a, nombre) {
  const pct = a.cumplimiento;
  const c = pct === null ? "#8D939B" : pct >= 80 ? "#2E7D5B" : pct >= 50 ? "#D9A441" : "#C1442D";
  return `<div class="cump">
    <div class="cump-h"><span>${_esc(nombre)}</span><b style="color:${c}">${pct === null ? "—" : pct.toFixed(0) + "%"}</b></div>
    ${barraApilada([
      { n: "Completadas", v: a.completadas, c: "#2E7D5B" },
      { n: "En Ejecución", v: a.enEjecucion, c: "#ED5B23" },
      { n: "Sin Programar", v: a.sinProgramar, c: "#C1442D" },
    ])}
    <span class="cump-d">${a.total} tareas · ${a.completadas} completadas · ${a.enEjecucion} en ejecución${a.sinProgramar ? ` · ${a.sinProgramar} sin programar` : ""}</span>
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
  const fila = (l, v, c) => v > 0
    ? `<tr><td><span class="pt" style="background:${c}"></span>${_esc(l)}</td><td class="r">${money(v)}</td>
       <td class="r mut">${kpi.costoTotal ? ((v / kpi.costoTotal) * 100).toFixed(0) : 0}%</td></tr>` : "";
  return `<table class="mini">
    <tbody>
      ${fila("Fee de servicio", kpi.costoFee, "#2E7D5B")}
      ${fila("Materiales y bodega", kpi.costoMateriales, "#ED5B23")}
      ${fila("Servicios externos", kpi.costoServicios, "#3B6EA5")}
      <tr class="tot-r"><td>Total del mes</td><td class="r">${money(kpi.costoTotal)}</td><td></td></tr>
      ${kpi.costoPorEstudiante !== null
        ? `<tr><td>Costo por estudiante</td><td class="r">${money(kpi.costoPorEstudiante)}</td><td class="r mut">${kpi.estudiantes} est.</td></tr>` : ""}
    </tbody></table>`;
}

function construirReporteMensualHTML(data, mes) {
  const sedes = data.sedes;
  const ids = sedes.map((s) => s.id);
  const kpi = indicadoresMes(data, ids, mes);
  const sat = satisfaccion(data, ids);
  const glob = presupuestoGlobalMes(data, mes);
  const avanceG = avancePlan(data, ids, mes);
  const serie = serieCostoEstudiante(data, ids, mes).map((p) => ({ label: p.mes, v: p.costo }));

  // Conteo de actividades del mes
  const delMes = (arr, campo) => arr.filter((x) => mesKey(x[campo] || "") === mes);
  const ordMes = data.ordenes.filter((o) => mesContable(o) === mes);
  const solMes = data.solicitudes.filter((s) => mesContable(s) === mes);
  const srvMes = (data.servicios || []).filter((s) => mesKey(s.fecha) === mes);
  const cerradas = [...ordMes, ...solMes, ...srvMes].filter((x) => x.estado === "completada").length;
  const totalAct = ordMes.length + solMes.length + srvMes.length;

  const porSede = sedes.map((s) => ({
    nombre: s.nombre,
    prev: data.ordenes.filter((o) => o.sedeId === s.id && mesContable(o) === mes).length,
    corr: data.solicitudes.filter((x) => x.sedeId === s.id && mesContable(x) === mes).length,
    serv: (data.servicios || []).filter((x) => x.sedeId === s.id && mesKey(x.fecha) === mes).length,
  }));

  const graficaActividades = svgBarras(
    porSede.map((p) => p.nombre.length > 11 ? p.nombre.slice(0, 10) + "…" : p.nombre),
    [
      { nombre: "Preventivos", color: "#ED5B23", valores: porSede.map((p) => p.prev) },
      { nombre: "Correctivos", color: "#35383C", valores: porSede.map((p) => p.corr) },
      { nombre: "Servicios", color: "#3B6EA5", valores: porSede.map((p) => p.serv) },
    ], { w: 500, h: 155 });

  /* --- Desglose por sede --- */
  const seccionesSede = sedes.map((s) => {
    const k = indicadoresMes(data, [s.id], mes);
    const st = satisfaccion(data, [s.id]);
    const p = { ...presupuestoSedeMes(data, s.id, mes), nombre: s.nombre };
    const a = avancePlan(data, [s.id], mes);
    const acts = [
      ...data.ordenes.filter((o) => o.sedeId === s.id && mesContable(o) === mes).map((o) => ({ ...o, tipo: "preventivo" })),
      ...data.solicitudes.filter((x) => x.sedeId === s.id && mesContable(x) === mes).map((x) => ({ ...x, tipo: "correctivo", tarea: x.descripcion })),
      ...(data.servicios || []).filter((x) => x.sedeId === s.id && mesKey(x.fecha) === mes).map((x) => ({ ...x, tipo: "servicio", tarea: x.trabajo })),
    ].sort((x, y) => (x.fechaProgramada || x.fecha || "").localeCompare(y.fechaProgramada || y.fecha || ""));

    const filas = acts.map((x) => `<tr>
        <td><b>${_esc(x.codigo)}</b></td>
        <td>${_esc(tipoMeta(x.tipo).label)}</td>
        <td>${_esc(x.tarea)}</td>
        <td class="c">${_esc(ESTADOS[x.estado]?.label || x.estado)}</td>
        <td class="r">${costoActividad(x) > 0 ? money(costoActividad(x)) : "—"}</td>
      </tr>`).join("");

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
          ${filas ? `<table class="mini act"><thead><tr><th>Código</th><th>Tipo</th><th>Trabajo</th><th class="c">Estado</th><th class="r">Costo</th></tr></thead><tbody>${filas}</tbody></table>`
            : '<p class="mut">Sin actividades registradas este mes.</p>'}</div>
      </div>
    </section>`;
  }).join("");

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
.marca img{max-height:34px;margin-bottom:3px}
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
  <div class="marca"><img src="${LOGO_REPORTE}" alt="Innova Schools"><br><b>IndustriaMe</b>Gestión de mantenimiento<br>${_esc(fmtDate(new Date()))}</div>
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
    ${sedes.map((s) => { const a = avancePlan(data, [s.id], mes); return a.total ? filaCumplimiento(a, s.nombre) : ""; }).join("") ||
      '<p class="mut">Sin planes asignados.</p>'}
    <p class="mut">Global: ${avanceG.cumplimiento === null ? "—" : avanceG.cumplimiento.toFixed(0) + "% completado"} sobre ${avanceG.total} tareas.</p>
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
  const pre = (data.ordenes || []).filter(dentro).map((o) => ({ ...o, tipo: "preventivo" }));
  const cor = (data.solicitudes || []).filter((s) => dentro(s) && s.estado !== "pendiente")
    .map((s) => ({ ...s, tipo: "correctivo", tarea: s.descripcion }));
  const srv = (data.servicios || []).filter(dentro)
    .map((s) => ({ ...s, tipo: "servicio", tarea: s.trabajo, fechaProgramada: s.fecha }));
  return [...pre, ...cor, ...srv];
}

/* Tiempo a mostrar: real si ya cerró, estimado si aún no. */
function tiempoActividad(a) {
  if (a.tipo === "servicio") return { txt: "Según proveedor", real: false };
  if (a.fechaCompletada && a.fecha) {
    const d = horasEntre(a.fecha, a.hora, a.fechaCompletada, a.horaCompletada) / 24;
    if (d > 0) return { txt: duracionTexto(d), real: true };
  }
  if (a.duracionValor) {
    const u = DURACION_UNIDADES.find(([v]) => v === a.duracionUnidad)?.[1] || a.duracionUnidad;
    return { txt: `${a.duracionValor} ${u}`, real: false };
  }
  // Correctivo abierto: lo útil es cuánto lleva esperando
  if (a.fecha && !a.fechaCompletada) {
    const d = horasEntre(a.fecha, a.hora, fmtDate(new Date()), fmtHora(new Date())) / 24;
    if (d > 0) return { txt: `${duracionTexto(d)} abierta`, real: false };
  }
  return { txt: "—", real: false };
}

/* Costo de un servicio: manda el valor con el que el cliente aprobó.
   Un servicio rechazado no cuesta nada. */
const costoServicio = (s) =>
  s.estado === "rechazada" || s.estado === "por_aprobar" ? 0
    : Number(s.presupuestoAprobado ?? s.presupuesto) || 0;

const costoActividad = (a) =>
  a.tipo === "servicio" ? costoServicio(a) : costoAprobado(a) + costoConsumos(a);

/* Checklist ejecutado, para el parte de trabajo impreso.
   Los pasos sin llenar quedan con línea para completar a mano en campo. */
function checklistHTML(items) {
  if (!items || items.length === 0) return "";
  const e = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  const filas = items.map((p) => {
    if (p.tipo === "texto") return `<tr><td colspan="2" class="p-txt"><b>${e(p.texto)}</b></td></tr>`;

    let val = "";
    if (p.tipo === "check") {
      val = p.valor ? "☑" : "☐";
    } else if (p.tipo === "numero") {
      val = (p.valor === "" || p.valor == null)
        ? `_______ ${e(p.unidad || "")}`
        : `<b>${e(p.valor)} ${e(p.unidad || "")}</b>`;
    } else if (p.tipo === "validacion") {
      val = p.valor === "si" ? "<b>SÍ</b> / No" : p.valor === "no" ? "Sí / <b>NO</b>" : "Sí / No";
    } else if (p.tipo === "estado") {
      const m = { bueno: "Bueno", alarma: "Alarma", malo: "Malo" };
      val = ESTADO_PASO_IDS.map((k) => (p.valor === k ? `<b>${m[k]}</b>` : m[k])).join(" / ");
    }
    const pre = p.tipo === "check" ? `${val} ` : "";
    const post = p.tipo === "check" ? "" : `<td class="p-val">${val}</td>`;
    return `<tr><td class="p-lbl">${pre}${e(p.texto)}</td>${post || '<td></td>'}</tr>`;
  }).join("");

  return `<div class="blk"><h4>Procedimiento</h4><table class="chk"><tbody>${filas}</tbody></table></div>`;
}

/* Documento HTML autónomo en A4 listo para imprimir o guardar como PDF. */
/* El logo se referencia por su URL final, la que Vite genera al compilar.
   Dentro de las plantillas HTML no se puede usar el import directamente. */
const LOGO_REPORTE = logoCliente;

/* ============================================================================
   GENERACIÓN DE PDF
   ----------------------------------------------------------------------------
   El documento HTML se renderiza fuera de pantalla, se convierte a imagen y se
   reparte en páginas A4. Es la vía que permite entregar un archivo PDF real,
   en lugar de depender del diálogo de impresión del navegador.
========================================================================== */
async function generarPDF(html, { onProgreso } = {}) {
  const contenedor = document.createElement("div");
  // Fuera de la vista pero con ancho real de A4, para que el diseño no se deforme
  contenedor.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;";
  contenedor.innerHTML = html.replace(/<!DOCTYPE[\s\S]*?<body>/i, "").replace(/<\/body>[\s\S]*$/i, "");

  // Los estilos del documento se copian aparte
  const estilos = (html.match(/<style>([\s\S]*?)<\/style>/i) || [])[1] || "";
  const tag = document.createElement("style");
  tag.textContent = estilos;
  contenedor.prepend(tag);
  document.body.appendChild(contenedor);

  try {
    onProgreso?.("Preparando el documento…");
    // Esperar a que las fotos terminen de cargar antes de capturar
    const imgs = [...contenedor.querySelectorAll("img")];
    await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => {
      img.onload = r; img.onerror = r;
    }))));
    await new Promise((r) => setTimeout(r, 120));

    onProgreso?.("Dibujando las páginas…");
    const lienzo = await html2canvas(contenedor, {
      scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const anchoPag = pdf.internal.pageSize.getWidth();
    const altoPag = pdf.internal.pageSize.getHeight();
    const margen = 8;
    const anchoUtil = anchoPag - margen * 2;
    const altoTotal = (lienzo.height * anchoUtil) / lienzo.width;

    // Se recorta el lienzo en trozos del alto de una página
    const altoTrozoPx = Math.floor((altoPag - margen * 2) * (lienzo.width / anchoUtil));
    let y = 0, pagina = 0;

    while (y < lienzo.height) {
      const alto = Math.min(altoTrozoPx, lienzo.height - y);
      const trozo = document.createElement("canvas");
      trozo.width = lienzo.width;
      trozo.height = alto;
      trozo.getContext("2d").drawImage(lienzo, 0, y, lienzo.width, alto, 0, 0, lienzo.width, alto);

      if (pagina > 0) pdf.addPage();
      pdf.addImage(trozo.toDataURL("image/jpeg", 0.88), "JPEG",
        margen, margen, anchoUtil, (alto * anchoUtil) / lienzo.width);

      y += alto;
      pagina++;
      onProgreso?.(`Página ${pagina}…`);
    }

    return pdf.output("blob");
  } finally {
    document.body.removeChild(contenedor);
  }
}

/* Compartir el PDF por WhatsApp, correo o lo que ofrezca el dispositivo.
   En móvil usa el menú nativo; en escritorio, donde no existe, lo descarga. */
async function compartirPDF(blob, nombre) {
  const archivo = new File([blob], nombre, { type: "application/pdf" });

  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return "compartido";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelado";   // el usuario cerró el menú
      console.error("[compartir]", e);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "descargado";
}

/* Reporte de monitoreo: tabla pivote (variable en filas, fecha en columnas)
   para descargar en PDF desde el popup de cada nodo monitoreado. */
function construirReporteMonitoreoHTML(titulo, breadcrumb, variablesConDelta, fechas) {
  const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const emitido = `${fmtDate(new Date())} ${fmtHora(new Date())}`;

  const etiqueta = (tipo, valor) => {
    if (tipo === "estado") return ESTADO_PASO[valor]?.label || valor || "—";
    if (tipo === "validacion") return VALIDACION[valor]?.label || valor || "—";
    if (tipo === "check") return valor ? "Hecho" : "Pendiente";
    return valor ?? "—";
  };

  const filas = Object.entries(variablesConDelta).map(([texto, v]) => {
    const porFecha = {};
    v.lecturas.forEach((l) => { porFecha[l.fecha] = l; });
    const celdas = fechas.map((f) => {
      const l = porFecha[f];
      if (!l) return `<td class="c mut">—</td>`;
      if (v.tipo === "numero") {
        const diff = (l.diferencia !== null && l.diferencia !== undefined)
          ? `<br><span class="mut" style="color:${l.diferencia >= 0 ? "#3E8E5B" : "#C0392B"}">${l.diferencia >= 0 ? "+" : ""}${l.diferencia}</span>`
          : "";
        return `<td class="c"><b>${esc(l.valor)}</b>${diff}</td>`;
      }
      return `<td class="c">${esc(etiqueta(v.tipo, l.valor))}</td>`;
    }).join("");
    return `<tr><td><b>${esc(texto)}</b>${v.unidad ? ` <span class="mut">(${esc(v.unidad)})</span>` : ""}</td>${celdas}</tr>`;
  }).join("");

  const encabezadoFechas = fechas.map((f) => `<th class="c">${esc(f)}</th>`).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Monitoreo · ${esc(titulo)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;color:#35383C;font-size:9pt;line-height:1.4}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #35383C;padding-bottom:8px;margin-bottom:12px}
.hdr h1{font-size:14pt;letter-spacing:.02em;text-transform:uppercase}
.hdr .sub{font-size:8.5pt;color:#787D85;margin-top:2px}
.hdr .marca{text-align:right;font-size:8.5pt;color:#787D85}
.hdr .marca b{display:block;font-size:11pt;color:#ED5B23;letter-spacing:.06em}
.marca img{max-height:30px;margin-bottom:3px}
table{width:100%;border-collapse:collapse;font-size:8pt}
thead th{background:#35383C;color:#fff;text-align:left;padding:5px 4px;font-size:7.5pt;text-transform:uppercase;white-space:nowrap}
tbody td{padding:4px;border-bottom:1px solid #E3E0D8;vertical-align:top;white-space:nowrap}
tbody tr:nth-child(even){background:#F7F6F3}
.c{text-align:center}
.mut{color:#8D939B;font-size:7pt}
.pie{margin-top:14px;padding-top:6px;border-top:1px solid #D8D4CB;font-size:7.5pt;color:#8D939B;display:flex;justify-content:space-between}
</style></head><body>
<div class="hdr">
  <div><h1>Monitoreo de condición</h1><p class="sub">${esc(titulo)} · ${esc(breadcrumb)}</p></div>
  <div class="marca"><img src="${LOGO_REPORTE}" alt="Innova Schools"><br><b>IndustriaMe</b>Gestión de mantenimiento<br>${esc(emitido)}</div>
</div>
<table>
  <thead><tr><th>Variable</th>${encabezadoFechas}</tr></thead>
  <tbody>${filas || `<tr><td colspan="${fechas.length + 1}" class="c">Sin lecturas</td></tr>`}</tbody>
</table>
<div class="pie"><span>IndustriaMe S.A.S. · Reporte de monitoreo</span><span>Generado el ${esc(emitido)}</span></div>
</body></html>`;
}

function construirReporteHTML(items, data, meta) {
  const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const nom = (id) => esc(usuarioNombre(data.usuarios, id));

  const filas = items.map((a, i) => {
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
  }).join("");

  const detalles = items.map((a, i) => {
    const t = tiempoActividad(a);
    const costo = costoActividad(a);
    const linea = (k, v) => v ? `<div class="dl"><span>${k}</span><b>${esc(v)}</b></div>` : "";
    const consumos = (a.consumos || []).map((c) =>
      `<tr><td>${esc(c.nombre)}</td><td class="c">${c.cantidad} ${esc(c.unidad)}</td><td class="r">${money(c.cantidad * c.costoUnitario)}</td></tr>`).join("");
    const materiales = (a.materiales || []).map((m) =>
      `<tr><td>${esc(m.nombre)}</td><td class="c">${m.cantidad} ${esc(m.unidad)}</td><td class="r">${money(m.cantidad * m.costoUnitario)}</td></tr>`).join("");

    return `<section class="det">
      <div class="det-h">
        <div><span class="tag" style="background:${tipoMeta(a.tipo).color}">${esc(tipoMeta(a.tipo).label)}</span>
             <b class="cod">${esc(a.codigo)}</b></div>
        <span class="est">${esc(ESTADOS[a.estado]?.label || a.estado)}</span>
      </div>
      <h3>${esc(a.tarea)}</h3>
      <p class="ubi">${esc(ubicacionTexto(data.sedes, a))}</p>

      <div class="grid">
        ${linea("Responsable", a.tipo === "servicio" ? (a.proveedor || "—") : usuarioNombre(data.usuarios, a.tecnicoId))}
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

      ${checklistHTML(a.checklist)}
      ${(a.fotoSolicitante || a.foto) ? `<div class="blk"><h4>Registro fotográfico</h4><div class="fotos">
        ${a.fotoSolicitante ? `<figure><img src="${a.fotoSolicitante}"><figcaption>Reportado por el solicitante</figcaption></figure>` : ""}
        ${a.foto ? `<figure><img src="${a.foto}"><figcaption>Evidencia del técnico</figcaption></figure>` : ""}
      </div></div>` : ""}
      ${(a.reprogramaciones || []).length ? `<div class="blk"><h4>Reprogramaciones (${a.reprogramaciones.length})</h4>${
        a.reprogramaciones.map((r) => `<div class="rep">
          <b>${esc(r.fechaAnterior || "sin fecha")} → ${esc(r.fechaNueva)}</b> · ${esc(r.motivo)}
          ${r.detalle ? `<br><span>${esc(r.detalle)}</span>` : ""}
          <br><span class="mut">${esc(nom(r.usuarioId))} · ${esc(r.sello)}</span>
        </div>`).join("")
      }</div>` : ""}
      ${a.observaciones ? `<div class="blk"><h4>Observaciones</h4><p>${esc(a.observaciones)}</p></div>` : ""}
      ${a.resolucion ? `<div class="blk"><h4>Resolución</h4><p>${esc(a.resolucion)}</p></div>` : ""}
      ${consumos ? `<div class="blk"><h4>Consumo de bodega</h4><table class="mini"><tbody>${consumos}</tbody></table></div>` : ""}
      ${materiales ? `<div class="blk"><h4>Materiales</h4><table class="mini"><tbody>${materiales}</tbody></table></div>` : ""}

      <div class="firma">
        <div><span></span><p>Ejecutado por</p></div>
        <div><span></span><p>Recibido conforme</p></div>
      </div>
    </section>`;
  }).join("");

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
.chk{width:100%;border-collapse:collapse}
.chk td{padding:2.5px 4px;border-bottom:1px solid #F0EEE9;font-size:8pt;vertical-align:top}
.chk .p-txt{padding-top:6px;border-bottom:none;font-size:8.3pt}
.chk .p-lbl{width:70%}
.chk .p-val{width:30%;text-align:right;white-space:nowrap}
.rep{border-left:2px solid #D9A441;padding:2px 0 2px 7px;margin-bottom:4px;font-size:8pt}
.rep .mut{color:#8D939B;font-size:7.5pt}
.fotos{display:flex;gap:10px;flex-wrap:wrap}
.fotos figure{margin:0;max-width:48%}
.fotos img{width:100%;border:1px solid #D8D4CB;border-radius:2px;max-height:200px;object-fit:contain}
.fotos figcaption{font-size:7pt;color:#8D939B;margin-top:2px;text-align:center}
.marca img{max-height:34px;margin-bottom:3px}
.firma{display:flex;gap:30px;margin-top:14px;padding-top:6px}
.firma div{flex:1;text-align:center}
.firma span{display:block;border-bottom:1px solid #8D939B;height:22px}
.firma p{font-size:7.5pt;color:#8D939B;margin-top:3px;text-transform:uppercase;letter-spacing:.04em}
.pie{margin-top:14px;padding-top:6px;border-top:1px solid #D8D4CB;font-size:7.5pt;color:#8D939B;display:flex;justify-content:space-between}
@media print{ .det{page-break-inside:avoid} }
</style></head><body>
<div class="hdr">
  <div><h1>${esc(meta.titulo)}</h1><p class="sub">${esc(meta.subtitulo)}</p></div>
  <div class="marca"><img src="${LOGO_REPORTE}" alt="Innova Schools"><br><b>IndustriaMe</b>Gestión de mantenimiento<br>${esc(meta.emitido)}</div>
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
        try { ventana.focus(); ventana.print(); } catch (e) { /* el usuario aún puede imprimir manualmente desde la pestaña */ }
      }, 350);
      return "ventana";
    }
  } catch (e) { console.error("No se pudo abrir la pestaña de impresión", e); }

  try {
    const marco = document.createElement("iframe");
    marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(marco);
    marco.srcdoc = html;
    marco.onload = () => {
      try { marco.contentWindow.focus(); marco.contentWindow.print(); }
      catch (e) { console.error(e); }
      setTimeout(() => document.body.removeChild(marco), 1000);
    };
    return "iframe";
  } catch (e) {
    console.error("No se pudo preparar la impresión, se intenta descargar el archivo", e);
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
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
  const [sel, setSel] = useState(null);           // null = todas las filtradas
  const sedeIds = sedes.map((s) => s.id);

  const todas = useMemo(() => actividadesReporte(data, sedeIds), [data, sedeIds.join(",")]);

  const rango = useMemo(() => {
    if (preset === "semana") {
      const f = new Date(); f.setDate(f.getDate() + 7);
      return { d: hoy, h: fmtDate(f), campo: "fechaProgramada" };
    }
    if (preset === "hoy_hecho") return { d: hoy, h: hoy, campo: "fechaCompletada" };
    if (preset === "hoy_plan") return { d: hoy, h: hoy, campo: "fechaProgramada" };
    return { d: desde, h: hasta, campo: "fechaProgramada" };
  }, [preset, desde, hasta, hoy]);

  const filtradas = todas.filter((a) => {
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      const hit = (a.codigo || "").toLowerCase().includes(t) || (a.tarea || "").toLowerCase().includes(t);
      if (!hit) return false;
      return true;   // al buscar por código se ignora el rango de fechas
    }
    const f = a[rango.campo] || "";
    if (!f || f < rango.d || f > rango.h) return false;
    if (fSede !== "todas" && a.sedeId !== fSede) return false;
    if (fTecnico !== "todos" && a.tecnicoId !== fTecnico) return false;
    if (fTipo !== "todos" && a.tipo !== fTipo) return false;
    return true;
  }).sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || "") || (a.codigo || "").localeCompare(b.codigo || ""));

  const marcadas = sel === null ? filtradas : filtradas.filter((a) => sel.includes(a.id));
  const alternar = (id) => {
    const base = sel === null ? filtradas.map((x) => x.id) : sel;
    setSel(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };
  const todasMarcadas = sel === null || marcadas.length === filtradas.length;

  const meta = {
    titulo: q.trim() ? `Orden de trabajo · ${q.trim().toUpperCase()}`
      : preset === "hoy_hecho" ? "Reporte de trabajo ejecutado" : "Programa de trabajo",
    subtitulo: [
      q.trim() ? `Búsqueda: ${q.trim()}` : `${PRESETS[preset].desc}: ${rango.d}${rango.h !== rango.d ? ` a ${rango.h}` : ""}`,
      fSede !== "todas" ? sedeNombre(data.sedes, fSede) : `${sedes.length} sede(s)`,
      fTecnico !== "todos" ? usuarioNombre(data.usuarios, fTecnico) : null,
    ].filter(Boolean).join(" · "),
    emitido: `${hoy} ${fmtHora(new Date())}`,
  };

  const generar = () => construirReporteHTML(marcadas, data, meta);

  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [avisoPDF, setAvisoPDF] = useState("");

  /* El PDF puede tardar unos segundos si hay muchas fotos, así que se avisa
     del avance en el propio botón en vez de dejar la pantalla congelada. */
  const hacerPDF = async (accion) => {
    setGenerando(true);
    setAvisoPDF("");
    setProgreso("Preparando…");
    try {
      const blob = await generarPDF(generar(), { onProgreso: setProgreso });
      const nombre = `parte-trabajo-${hoy}.pdf`;
      if (accion === "compartir") {
        const via = await compartirPDF(blob, nombre);
        setAvisoPDF(
          via === "compartido" ? "Reporte compartido."
          : via === "cancelado" ? ""
          : "Tu dispositivo no permite compartir archivos, así que se descargó el PDF."
        );
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = nombre;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setAvisoPDF(`Descargado ${nombre}`);
      }
    } catch (e) {
      console.error("[pdf]", e);
      setAvisoPDF("No se pudo generar el PDF. Intenta con menos órdenes seleccionadas.");
    } finally {
      setGenerando(false);
      setProgreso("");
      setTimeout(() => setAvisoPDF(""), 6000);
    }
  };
  const tecnicos = data.usuarios.filter((u) => u.rol === "tecnico");

  return (
    <div className="mt-4">
      <p className="text-xs mb-3" style={cSlate}>
        Arma el parte de trabajo: elige el alcance, marca las órdenes y descarga el PDF en A4 para imprimir o compartir.
      </p>

      {/* Alcance rápido */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {Object.entries(PRESETS).map(([k, p]) => (
          <button key={k} onClick={() => { setPreset(k); setQ(""); setSel(null); }}
            className="text-xs font-semibold px-3 py-2 rounded-md border"
            style={{
              background: preset === k && !q.trim() ? COLORS.charcoal : "white",
              color: preset === k && !q.trim() ? "white" : COLORS.slate,
              borderColor: preset === k && !q.trim() ? COLORS.charcoal : COLORS.line,
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {preset === "libre" && !q.trim() && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label="Desde"><input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setSel(null); }}
            className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle} /></Field>
          <Field label="Hasta"><input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setSel(null); }}
            className="w-full border rounded-md px-2 py-2 text-sm" style={inputStyle} /></Field>
        </div>
      )}

      {/* Filtros finos */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <input value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }}
          placeholder="O busca una orden puntual: OT-0003, SOL-0002…"
          className="flex-1 min-w-44 border rounded-md px-3 py-2 text-sm outline-none" style={inputStyle} />
        <select value={fTipo} onChange={(e) => { setFTipo(e.target.value); setSel(null); }} className="border rounded-md px-2 py-2 text-sm bg-white" style={inputStyle}>
          <option value="todos">Todo tipo</option>
          <option value="preventivo">Preventivos</option>
          <option value="correctivo">Correctivos</option>
          <option value="servicio">Servicios</option>
        </select>
        {sedes.length > 1 && (
          <select value={fSede} onChange={(e) => { setFSede(e.target.value); setSel(null); }} className="border rounded-md px-2 py-2 text-sm bg-white" style={inputStyle}>
            <option value="todas">Todas las sedes</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        <select value={fTecnico} onChange={(e) => { setFTecnico(e.target.value); setSel(null); }} className="border rounded-md px-2 py-2 text-sm bg-white" style={inputStyle}>
          <option value="todos">Todos los responsables</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button onClick={() => hacerPDF("compartir")} disabled={marcadas.length === 0 || generando}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white disabled:opacity-40"
          style={{ background: COLORS.orange }}>
          <Send size={13} /> {generando ? (progreso || "Generando…") : "Compartir PDF"}
        </button>
        <button onClick={() => hacerPDF("descargar")} disabled={marcadas.length === 0 || generando}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border disabled:opacity-40"
          style={{ borderColor: COLORS.line, color: COLORS.charcoal }}>
          <Download size={13} /> Descargar PDF
        </button>
        <span className="text-[11px]" style={cSlate}>
          {marcadas.length} de {filtradas.length} orden(es) en el reporte
        </span>
      </div>

      {avisoPDF && (
        <p className="text-[11px] rounded-md px-3 py-2 mb-3"
          style={{ background: `${COLORS.verde}15`, color: COLORS.charcoal }}>
          {avisoPDF}
        </p>
      )}

      {/* Selección */}
      <div className="border rounded-md overflow-x-auto" style={cardStyle}>
        <table className="w-full border-collapse" style={{ minWidth: 620 }}>
          <thead>
            <tr style={{ background: COLORS.charcoal }}>
              <th className="px-2.5 py-2 w-8">
                <input type="checkbox" checked={todasMarcadas}
                  onChange={() => setSel(todasMarcadas ? [] : null)} />
              </th>
              {["Orden", "Sede", "Descripción del trabajo", "Tiempo", "Responsable", "Estado"].map((h) => (
                <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-wide px-2.5 py-2 whitespace-nowrap" style={{ color: "white" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((a, i) => {
              const marcada = sel === null || sel.includes(a.id);
              const t = tiempoActividad(a);
              return (
                <tr key={a.id} style={{ background: i % 2 ? COLORS.paper : "white", borderTop: `1px solid ${COLORS.line}`, opacity: marcada ? 1 : .45 }}>
                  <td className="px-2.5 py-2"><input type="checkbox" checked={marcada} onChange={() => alternar(a.id)} /></td>
                  <td className="px-2.5 py-2 text-xs">
                    <span className="font-bold" style={cChar}>{a.codigo}</span>
                    <span className="block"><Chip color={tipoMeta(a.tipo).color}>{tipoMeta(a.tipo).label}</Chip></span>
                  </td>
                  <td className="px-2.5 py-2 text-xs" style={cSlate}>{sedeNombre(data.sedes, a.sedeId)}</td>
                  <td className="px-2.5 py-2 text-xs" style={cChar}>
                    {a.tarea}
                    <span className="block text-[10px]" style={cSlate}>{ubicacionTexto(data.sedes, a)}</span>
                  </td>
                  <td className="px-2.5 py-2 text-xs whitespace-nowrap" style={cSlate}>
                    {t.txt}<span className="block text-[10px]">{t.real ? "real" : "estimado"}</span>
                  </td>
                  <td className="px-2.5 py-2 text-xs" style={cSlate}>
                    {a.tipo === "servicio" ? (a.proveedor || "—") : usuarioNombre(data.usuarios, a.tecnicoId)}
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
              <tr><td colSpan={7} className="px-3 py-6 text-sm text-center" style={cSlate}>
                {q.trim() ? `Sin resultados para “${q}”.` : "No hay órdenes en este rango. Prueba otro alcance."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] mt-2" style={cSlate}>
        El reporte incluye el resumen en tabla y el desglose de cada orden, con espacio para firmas.
        En el diálogo de impresión elige “Guardar como PDF” para compartirlo.
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
  const cambiarRol = (r) => { setRol(r); setSedeIds(ROLES[r].sedes === "todas" ? [] : sedeIds.slice(0, ROLES[r].sedes === "una" ? 1 : undefined)); };
  const toggleSede = (id) =>
    setSedeIds((p) => (modoSedes === "una" ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const valido = nombre.trim() && clave.trim().length >= 4 && (modoSedes === "todas" || sedeIds.length > 0);

  return (
    <div className="space-y-3">
      <Field label="Nombre completo">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Patricia Mejía" className={inputCls} style={inputStyle} />
      </Field>

      <Field label="Rol" hint={ROLES[rol].desc}>
        <div className="grid grid-cols-2 gap-2">
          {ROL_IDS.map((r) => (
            <button key={r} onClick={() => cambiarRol(r)} className="text-[11px] font-semibold py-2 px-2 rounded-md border text-left leading-tight"
              style={{
                borderColor: rol === r ? ROLES[r].color : COLORS.line,
                background: rol === r ? `${ROLES[r].color}15` : "white",
                color: rol === r ? ROLES[r].color : COLORS.slate,
              }}>
              {ROLES[r].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Clave de acceso">
        <div className="relative">
          <input type={showClave ? "text" : "password"} value={clave} onChange={(e) => setClave(e.target.value)}
            placeholder="Mínimo 4 caracteres" className={`${inputCls} pr-10`} style={inputStyle} />
          <button onClick={() => setShowClave(!showClave)} className="absolute right-3 top-1/2 -translate-y-1/2">
            {showClave ? <EyeOff size={15} color={COLORS.slate} /> : <Eye size={15} color={COLORS.slate} />}
          </button>
        </div>
      </Field>

      {modoSedes === "todas" ? (
        <div className="text-xs rounded-md p-2.5" style={{ background: COLORS.cream, color: COLORS.slate }}>
          Este rol tiene acceso a <span className="font-semibold" style={cChar}>todas las sedes</span>.
        </div>
      ) : (
        <Field label={modoSedes === "una" ? "Sede que representa" : "Sedes a cargo"}
          hint={modoSedes === "varias" ? "Un técnico puede tener varias sedes." : null}>
          <div className="space-y-1.5">
            {sedes.map((s) => {
              const on = sedeIds.includes(s.id);
              return (
                <button key={s.id} onClick={() => toggleSede(s.id)}
                  className="w-full flex items-center gap-2 border rounded-md px-2.5 py-2 text-left"
                  style={{ borderColor: on ? COLORS.orange : COLORS.line, background: on ? `${COLORS.orange}0D` : "white" }}>
                  <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                    style={{ borderColor: on ? COLORS.orange : COLORS.line, background: on ? COLORS.orange : "white" }}>
                    {on && <CheckCircle2 size={11} color="white" />}
                  </span>
                  <span className="text-xs font-medium" style={cChar}>{s.nombre}</span>
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <button disabled={!valido}
        onClick={() => { onSave({ id: initial?.id || uid("usr"), nombre: nombre.trim(), rol, clave: clave.trim(), sedeIds: modoSedes === "todas" ? [] : sedeIds }); onClose(); }}
        className="w-full py-2.5 rounded-md font-semibold text-sm text-white disabled:opacity-40" style={{ background: COLORS.orange }}>
        {initial ? "Guardar cambios" : "Crear usuario"}
      </button>
    </div>
  );
}

function AdminUsuarios({ data, persist }) {
  const [modal, setModal] = useState(null);

  const guardar = (u) => {
    const existe = data.usuarios.some((x) => x.id === u.id);
    persist((data) => ({ ...data, usuarios: existe ? data.usuarios.map((x) => (x.id === u.id ? u : x)) : [...data.usuarios, u] }));
  };

  return (
    <div className="mt-4">
      <div className="flex justify-end mb-3">
        <button onClick={() => setModal({})} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-white" style={{ background: COLORS.orange }}>
          <Plus size={13} /> Nuevo usuario
        </button>
      </div>

      {ROL_IDS.map((rolId) => {
        const usuarios = data.usuarios.filter((u) => u.rol === rolId);
        if (usuarios.length === 0) return null;
        return (
          <div key={rolId} className="mb-5">
            <SectionTitle count={usuarios.length}>{ROLES[rolId].label}</SectionTitle>
            <div className="space-y-2">
              {usuarios.map((u) => <FilaUsuario key={u.id} user={u} data={data} onEdit={() => setModal({ user: u })}
                onDelete={() => persist((data) => ({ ...data, usuarios: data.usuarios.filter((x) => x.id !== u.id) }))} />)}
            </div>
          </div>
        );
      })}

      {modal && (
        <Modal title={modal.user ? "Editar usuario" : "Nuevo usuario"} onClose={() => setModal(null)}>
          <FormUsuario initial={modal.user} sedes={data.sedes} onSave={guardar} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

function FilaUsuario({ user, data, onEdit, onDelete }) {
  const [ver, setVer] = useState(false);
  const rol = rolDe(user);
  const sedesTxt = rol.sedes === "todas" ? "Todas las sedes" : user.sedeIds.map((id) => sedeNombre(data.sedes, id)).join(", ") || "Sin sede";

  return (
    <div className="border rounded-md p-3" style={{ borderColor: COLORS.line, borderLeft: `3px solid ${rol.color}`, background: "white" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={cChar}>{user.nombre}</p>
          <p className="text-[11px] mt-0.5 truncate" style={cSlate}>{sedesTxt}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <KeyRound size={11} color={COLORS.slate} />
            <span className="text-xs font-mono" style={cSlate}>{ver ? user.clave : "••••••"}</span>
            <button onClick={() => setVer(!ver)}>{ver ? <EyeOff size={12} color={COLORS.slate} /> : <Eye size={12} color={COLORS.slate} />}</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onEdit}><Pencil size={13} color={COLORS.slate} /></button>
          <DeleteBtn onConfirm={onDelete} />
        </div>
      </div>
    </div>
  );
}


/* ============================================================================
   16.5. MONITOREO DE CONDICIÓN — árbol compacto sede → fase → activo.
   Cada nivel con datos muestra un botón (i) que abre el histórico completo
   en un popup, filtrable por mes; validación/estado/check se ven en tabla.
   ========================================================================= */
function VistaMonitoreo({ data }) {
  const grupos = useMemo(() => {
    const planIds = new Set((data.planes || []).filter((p) => p.monitoreo).map((p) => p.id));
    const mapa = {};
    (data.ordenes || []).forEach((o) => {
      if (!o.planId || !planIds.has(o.planId) || !o.sedeId) return;
      const checklist = o.checklist || [];
      if (!checklist.length) return;
      const key = `${o.sedeId}|${o.faseId || ""}|${o.activoId || ""}`;
      const fecha = o.fechaCompletada || o.fechaProgramada || "";
      const g = mapa[key] || (mapa[key] = {
        sedeId: o.sedeId, faseId: o.faseId || "", activoId: o.activoId || "", variables: {},
      });
      checklist.forEach((it) => {
        if (it.tipo === "texto") return;
        const v = g.variables[it.texto] || (g.variables[it.texto] = { tipo: it.tipo, unidad: it.unidad, lecturas: [] });
        v.lecturas.push({ fecha, valor: it.tipo === "numero" ? Number(it.valor) || 0 : it.valor });
      });
    });
    Object.values(mapa).forEach((g) =>
      Object.values(g.variables).forEach((v) => v.lecturas.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")))
    );
    return mapa;
  }, [data.planes, data.ordenes]);

  const [popup, setPopup] = useState(null);
  const sedesConDatos = (data.sedes || []).filter((sede) => Object.values(grupos).some((g) => g.sedeId === sede.id));

  return (
    <div className="space-y-2">
      <p className="text-xs" style={cSlate}>
        Sedes, fases y activos con seguimiento activo. El ícono <Info size={11} className="inline align-text-top" color={COLORS.orange} /> abre
        el histórico completo. Para agregar más, marca un plan como "monitoreo de condición" en Configuración.
      </p>
      {sedesConDatos.length ? (
        <div className="border rounded-md overflow-hidden divide-y" style={cardStyle}>
          {sedesConDatos.map((sede) => (
            <FilaSede key={sede.id} sede={sede} grupos={grupos} onVer={setPopup} />
          ))}
        </div>
      ) : (
        <Empty>
          Aún no hay lecturas. Marca un plan como "monitoreo de condición" y completa al menos una orden con checklist para ver datos aquí.
        </Empty>
      )}

      {popup && <PopupMonitoreo {...popup} onClose={() => setPopup(null)} />}
    </div>
  );
}

function FilaSede({ sede, grupos, onVer }) {
  const [open, setOpen] = useState(false);
  const fasesConDatos = (sede.fases || []).filter((fase) =>
    (fase.activos || []).some((a) => grupos[`${sede.id}|${fase.id}|${a.id}`]) || grupos[`${sede.id}|${fase.id}|`]
  );
  const grupoSede = grupos[`${sede.id}||`];
  const hayHijos = fasesConDatos.length > 0;

  return (
    <div style={bLine}>
      <div className="flex items-center gap-1.5 py-1.5 px-2.5 cursor-pointer hover:bg-black/[0.02]"
        onClick={() => hayHijos && setOpen(!open)}>
        {hayHijos ? (open ? <ChevronDown size={13} color={COLORS.charcoal} /> : <ChevronRight size={13} color={COLORS.charcoal} />)
          : <span className="w-[13px] shrink-0" />}
        <p className="text-xs font-bold flex-1 truncate" style={cChar}>{sede.nombre}</p>
        {grupoSede && (
          <button onClick={(e) => { e.stopPropagation(); onVer({ titulo: "Sede completa", breadcrumb: sede.nombre, grupo: grupoSede }); }}
            className="shrink-0 p-0.5">
            <Info size={14} color={COLORS.orange} />
          </button>
        )}
      </div>
      {open && fasesConDatos.map((fase) => (
        <FilaFase key={fase.id} sede={sede} fase={fase} grupos={grupos} onVer={onVer} />
      ))}
    </div>
  );
}

function FilaFase({ sede, fase, grupos, onVer }) {
  const [open, setOpen] = useState(false);
  const activosConDatos = (fase.activos || []).filter((a) => grupos[`${sede.id}|${fase.id}|${a.id}`]);
  const grupoFase = grupos[`${sede.id}|${fase.id}|`];
  const hayHijos = activosConDatos.length > 0;

  return (
    <div style={bLine}>
      <div className="flex items-center gap-1.5 py-1.5 pl-7 pr-2.5 cursor-pointer hover:bg-black/[0.02]"
        style={{ borderTop: `1px solid ${COLORS.line}` }} onClick={() => hayHijos && setOpen(!open)}>
        {hayHijos ? (open ? <ChevronDown size={12} color={COLORS.slate} /> : <ChevronRight size={12} color={COLORS.slate} />)
          : <span className="w-3 shrink-0" />}
        <Layers size={11} color={COLORS.orange} className="shrink-0" />
        <p className="text-xs font-semibold flex-1 truncate" style={cSlate}>{fase.nombre}</p>
        {grupoFase && (
          <button onClick={(e) => { e.stopPropagation(); onVer({ titulo: "Fase completa", breadcrumb: `${sede.nombre} · ${fase.nombre}`, grupo: grupoFase }); }}
            className="shrink-0 p-0.5">
            <Info size={13} color={COLORS.orange} />
          </button>
        )}
      </div>
      {open && activosConDatos.map((a) => (
        <FilaActivo key={a.id} sede={sede} fase={fase} activo={a} grupo={grupos[`${sede.id}|${fase.id}|${a.id}`]} onVer={onVer} />
      ))}
    </div>
  );
}

function FilaActivo({ sede, fase, activo, grupo, onVer }) {
  return (
    <div className="flex items-center gap-1.5 py-1.5 pl-11 pr-2.5 cursor-pointer hover:bg-black/[0.02]"
      style={{ borderTop: `1px solid ${COLORS.line}` }}
      onClick={() => onVer({ titulo: activo.nombre, breadcrumb: `${sede.nombre} · ${fase.nombre} · ${activo.nombre}`, grupo })}>
      <p className="text-xs flex-1 truncate" style={cSlate}>{activo.nombre}</p>
      <Info size={13} color={COLORS.orange} className="shrink-0" />
    </div>
  );
}

/* Popup con el histórico completo de un nodo (sede/fase/activo): tabla
   compacta con las fechas en columnas (giradas, para ahorrar espacio) y
   cada variable en una fila. En variables numéricas se calcula, de forma
   automática y genérica, la diferencia contra la lectura anterior de esa
   misma variable — útil para contadores acumulados (ej. horas de un
   generador: 80 - 50 = 30 horas de uso). En variables donde ese dato no
   aplica (ej. voltaje) simplemente se ve la fluctuación entre tomas, sin
   necesidad de configurar nada por variable. */
function PopupMonitoreo({ titulo, breadcrumb, grupo, onClose }) {
  const variables = grupo?.variables || {};

  const variablesConDelta = useMemo(() => {
    const out = {};
    Object.entries(variables).forEach(([texto, v]) => {
      out[texto] = {
        ...v,
        lecturas: v.lecturas.map((l, i) => ({
          ...l,
          diferencia: v.tipo === "numero" && i > 0 ? l.valor - v.lecturas[i - 1].valor : null,
        })),
      };
    });
    return out;
  }, [variables]);

  const todasFechas = [...new Set(Object.values(variablesConDelta).flatMap((v) => v.lecturas.map((l) => l.fecha)).filter(Boolean))].sort();
  const [verTodo, setVerTodo] = useState(true);
  const [mes, setMes] = useState(() => mesKey(todasFechas[todasFechas.length - 1] || fmtDate(new Date())));
  const fechasVisibles = todasFechas.filter((f) => verTodo || mesKey(f) === mes);

  const etiquetaCorta = (tipo, valor) => {
    if (tipo === "estado") return { txt: valor === "bueno" ? "Bueno" : valor === "alarma" ? "Alarma" : valor === "malo" ? "Malo" : "—", color: ESTADO_PASO[valor]?.color || COLORS.slate };
    if (tipo === "validacion") return { txt: valor === "si" ? "Sí" : valor === "no" ? "No" : "—", color: VALIDACION[valor]?.color || COLORS.slate };
    if (tipo === "check") return { txt: valor ? "✓" : "–", color: valor ? COLORS.verde : COLORS.slate };
    return { txt: String(valor ?? "—"), color: COLORS.charcoal };
  };

  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [avisoPDF, setAvisoPDF] = useState("");

  const hacerPDF = async () => {
    setGenerando(true); setAvisoPDF(""); setProgreso("Preparando…");
    try {
      const html = construirReporteMonitoreoHTML(titulo, breadcrumb, variablesConDelta, fechasVisibles);
      const blob = await generarPDF(html, { onProgreso: setProgreso });
      const slug = `${titulo}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const nombre = `monitoreo-${slug || "reporte"}-${fmtDate(new Date())}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setAvisoPDF(`Descargado ${nombre}`);
    } catch (e) {
      console.error("[pdf monitoreo]", e);
      setAvisoPDF("No se pudo generar el PDF.");
    } finally {
      setGenerando(false); setProgreso("");
      setTimeout(() => setAvisoPDF(""), 6000);
    }
  };

  return (
    <Modal title={titulo} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs -mt-2" style={cSlate}>{breadcrumb}</p>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setVerTodo(true)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md"
              style={verTodo ? { background: COLORS.orange, color: "white" } : { border: `1px solid ${COLORS.line}`, color: COLORS.slate }}>
              Todo el histórico
            </button>
            <button onClick={() => setVerTodo(false)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md"
              style={!verTodo ? { background: COLORS.orange, color: "white" } : { border: `1px solid ${COLORS.line}`, color: COLORS.slate }}>
              Por mes
            </button>
            {!verTodo && <MesSelector mes={mes} onChange={setMes} />}
          </div>
          <button onClick={hacerPDF} disabled={generando}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md text-white disabled:opacity-60 shrink-0"
            style={{ background: COLORS.charcoal }}>
            <Download size={12} /> {generando ? (progreso || "Generando…") : "Descargar PDF"}
          </button>
        </div>
        {avisoPDF && <p className="text-[11px]" style={cSlate}>{avisoPDF}</p>}

        {fechasVisibles.length ? (
          <div className="overflow-x-auto border rounded-md" style={bLine}>
            <table style={{ borderCollapse: "collapse", width: "max-content" }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white text-left px-2 py-1.5 text-xs font-semibold"
                    style={{ borderBottom: `1px solid ${COLORS.line}`, borderRight: `1px solid ${COLORS.line}`, minWidth: 130, ...cChar }}>
                    Variable
                  </th>
                  {fechasVisibles.map((f) => (
                    <th key={f} className="px-0.5 py-1 align-bottom" style={{ borderBottom: `1px solid ${COLORS.line}`, width: 26 }}>
                      <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 10, fontWeight: 600, color: COLORS.slate, whiteSpace: "nowrap" }}>
                        {f}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(variablesConDelta).map(([texto, v]) => {
                  const porFecha = {};
                  v.lecturas.forEach((l) => { porFecha[l.fecha] = l; });
                  return (
                    <tr key={texto}>
                      <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-xs font-semibold"
                        style={{ borderBottom: `1px solid ${COLORS.line}`, borderRight: `1px solid ${COLORS.line}`, ...cSlate }}>
                        {texto}{v.unidad ? ` (${v.unidad})` : ""}
                      </td>
                      {fechasVisibles.map((f) => {
                        const l = porFecha[f];
                        if (!l) {
                          return <td key={f} className="text-center text-xs" style={{ borderBottom: `1px solid ${COLORS.line}`, ...cSlate }}>—</td>;
                        }
                        if (v.tipo === "numero") {
                          return (
                            <td key={f} className="text-center px-1 py-1" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
                              <div className="text-xs font-semibold" style={cChar}>{l.valor}</div>
                              {l.diferencia !== null && (
                                <div style={{ fontSize: 9, color: l.diferencia >= 0 ? COLORS.verde : COLORS.rojo }}>
                                  {l.diferencia >= 0 ? "+" : ""}{l.diferencia}
                                </div>
                              )}
                            </td>
                          );
                        }
                        const et = etiquetaCorta(v.tipo, l.valor);
                        return (
                          <td key={f} className="text-center px-1 py-1 text-xs font-bold" style={{ borderBottom: `1px solid ${COLORS.line}`, color: et.color }}>
                            {et.txt}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Sin lecturas en este periodo.</Empty>
        )}

        <p className="text-[10px]" style={cSlate}>
          En variables numéricas, el número pequeño debajo del valor es la diferencia con la lectura anterior — por ejemplo, horas de uso desde la última toma.
        </p>
      </div>
    </Modal>
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
    { id: "programacion", label: "Programación", icon: <CalendarDays size={14} /> },
    { id: "actividades", label: "Actividades", icon: <ClipboardList size={14} /> },
    { id: "monitoreo", label: "Monitoreo", icon: <BarChart3 size={14} /> },
    { id: "bodega", label: "Bodega", icon: <Layers size={14} /> },
    { id: "presupuesto", label: "Presupuesto", icon: <Wallet size={14} /> },
    { id: "reportes", label: "Reportes", icon: <Download size={14} /> },
    { id: "config", label: "Configuración", icon: <Users size={14} /> },
  ];

  const [planModal, setPlanModal] = useState(null);

  return (
   <ProveedorDetalle data={data}>
    <div className="max-w-6xl mx-auto px-4 pb-16">
      <AppHeader user={user} onLogout={onLogout} ultimaSync={ultimaSync} sedesTexto="Todas las sedes" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "dashboard" && <Dashboard data={data} persist={persist} sedes={data.sedes} mes={mes} onMesChange={setMes} mostrarPresupuesto mostrarCosto mostrarSatisfaccion />}
      {tab === "presupuesto" && <VistaPresupuesto data={data} mes={mes} onMesChange={setMes} />}
      {tab === "sedes" && <AdminSedes data={data} persist={persist} />}
      {tab === "programacion" && <AdminProgramacion data={data} persist={persist} user={user} />}
      {tab === "actividades" && <AdminActividades data={data} persist={persist} user={user} />}
      {tab === "monitoreo" && <VistaMonitoreo data={data} />}
      {tab === "bodega" && <VistaBodega data={data} persist={persist} sedes={data.sedes} editable />}
      {tab === "reportes" && <VistaReportes data={data} sedes={data.sedes} user={user} />}
      {tab === "config" && <AdminConfiguracion data={data} persist={persist} setPlanModal={setPlanModal} />}

      {planModal && (
        <Modal title={planModal.plan ? "Editar plan" : "Nuevo plan"} onClose={() => setPlanModal(null)} wide>
          <FormPlan data={data} initial={planModal.plan}
            onAddCategoria={(c) => persist((data) => ({ ...data, categorias: [...(data.categorias || CATEGORIAS_BASE), c] }))}
            onSave={(plan) => {
              const existe = data.planes.some((p) => p.id === plan.id);
              persist((data) => ({ ...data, planes: existe ? data.planes.map((p) => (p.id === plan.id ? plan : p)) : [...data.planes, plan] }));
            }}
            onClose={() => setPlanModal(null)} />
        </Modal>
      )}
    </div>
   </ProveedorDetalle>
  );
}

function VistaCliente({ data, persist, user, onLogout, ultimaSync }) {
  const acciones = useAcciones(data, persist, user);
  const [tab, setTab] = useState("dashboard");
  const [mes, setMes] = useState(mesKey(fmtDate(new Date())));

  const porAprobar = itemsConMateriales(data, ["pendiente_aprobacion"]);
  const serviciosPorAprobar = (data.servicios || []).filter((s) => s.estado === "por_aprobar");
  const enEspera = itemsConMateriales(data, ["en_espera"]);
  const historial = itemsConMateriales(data, ["aprobado", "rechazado"]);
  const bandeja = porAprobar.length + enEspera.length + serviciosPorAprobar.length;

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={14} /> },
    { id: "programacion", label: "Programación", icon: <CalendarDays size={14} /> },
    { id: "aprobaciones", label: `Aprobaciones (${bandeja})`, icon: <CheckCircle2 size={14} /> },
    { id: "presupuesto", label: "Presupuesto", icon: <Wallet size={14} /> },
    { id: "reportes", label: "Reportes", icon: <Download size={14} /> },
    { id: "historico", label: "Histórico", icon: <ClipboardList size={14} /> },
  ];

  const pendientesCliente = getPendientes(data);

  return (
   <ProveedorDetalle data={data}>
    <div className="max-w-5xl mx-auto px-4 pb-16">
      <AppHeader user={user} onLogout={onLogout} ultimaSync={ultimaSync} sedesTexto="Todas las sedes · Solo lectura" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "dashboard" && <Dashboard data={data} persist={persist} sedes={data.sedes} mes={mes} onMesChange={setMes} mostrarPresupuesto mostrarCosto mostrarSatisfaccion />}
      {tab === "presupuesto" && <VistaPresupuesto data={data} mes={mes} onMesChange={setMes} />}
      {tab === "reportes" && <VistaReportes data={data} sedes={data.sedes} user={user} />}
      {tab === "historico" && <VistaHistorico data={data} sedes={data.sedes} rol="cliente" />}

      {tab === "programacion" && (
        <PanelProgramacion data={data} sedes={data.sedes} pendientes={pendientesCliente}
          nota="Vista de solo lectura: aquí puedes consultar toda la programación, pero no puedes activar ni editar nada." />
      )}

      {tab === "aprobaciones" && (
        <div className="mt-4 space-y-5">
          <div>
            <SectionTitle count={serviciosPorAprobar.length}>Servicios externos por aprobar</SectionTitle>
            <p className="text-xs mb-3" style={cSlate}>
              Trabajos especializados que requieren contratar a un tercero. Al aprobarlos se define el proveedor.
            </p>
            <div className="space-y-2">
              {serviciosPorAprobar.map((srv) => (
                <TarjetaServicioCliente key={srv.id} srv={srv} data={data}
                  onDecidir={(patch) => persist((data) => ({ ...data, servicios: data.servicios.map((x) => (x.id === srv.id ? { ...x, ...patch } : x)) }))} />
              ))}
              {serviciosPorAprobar.length === 0 && <Empty>No hay servicios esperando tu decisión.</Empty>}
            </div>
          </div>

          <div>
            <p className="text-xs mb-3" style={cSlate}>
              Actividades correctivas con materiales costeados que requieren tu aprobación antes de ejecutarse.
            </p>
            <SectionTitle count={porAprobar.length}>Pendientes de tu aprobación</SectionTitle>
            <div className="space-y-2">
              {porAprobar.map((i) => (
                <TarjetaCosto key={i.id} item={i} data={data} rol="cliente" defaultOpen onUpdate={(p) => acciones.updateActividad(i, p)} />
              ))}
              {porAprobar.length === 0 && <Empty>No hay solicitudes de costo nuevas.</Empty>}
            </div>
          </div>

          {enEspera.length > 0 && (
            <div>
              <SectionTitle count={enEspera.length}>En espera de tu decisión</SectionTitle>
              <p className="text-xs mb-2" style={cSlate}>
                Las dejaste en espera. Siguen reservando presupuesto hasta que las apruebes o rechaces.
              </p>
              <div className="space-y-2">
                {enEspera.map((i) => (
                  <TarjetaCosto key={i.id} item={i} data={data} rol="cliente" defaultOpen onUpdate={(p) => acciones.updateActividad(i, p)} />
                ))}
              </div>
            </div>
          )}

          {historial.length > 0 && (
            <div>
              <SectionTitle count={historial.length}>Historial de decisiones</SectionTitle>
              <div className="space-y-2">
                {historial.map((i) => (
                  <TarjetaCosto key={i.id} item={i} data={data} rol="cliente" onUpdate={(p) => acciones.updateActividad(i, p)} />
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
      case "solicitante": return <VistaSolicitante data={data} persist={persist} user={user} onLogout={() => setUser(null)} ultimaSync={ultimaSync} />;
      case "tecnico": return <VistaTecnico data={data} persist={persist} user={user} onLogout={() => setUser(null)} ultimaSync={ultimaSync} />;
      case "cliente": return <VistaCliente data={data} persist={persist} user={user} onLogout={() => setUser(null)} ultimaSync={ultimaSync} />;
      default: return <VistaAdmin data={data} persist={persist} user={user} onLogout={() => setUser(null)} ultimaSync={ultimaSync} />;
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
        <div className="flex items-center justify-center h-screen text-sm" style={cSlate}>Cargando sistema…</div>
      ) : !user ? (
        <Login usuarios={data.usuarios} onLogin={setUser} />
      ) : vista()}
    </div>
  );
}
