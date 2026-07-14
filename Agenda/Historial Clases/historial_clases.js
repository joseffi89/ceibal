const AGENDA_FIELDS = [
  "id",
  "ID_Grupo",
  "ID_Grupo_Grupo",
  "ID_Grupo_display",
  "Clase",
  "Hora_Desde",
  "Estado_Clase",
  "Estado_Clase_Display",
  "Estado_Clase_Estado",
  "Estado_Estado",
  "Estado_Clase_ID",
  "ID_Estado_Clase",
  "Tipo_de_Clase",
  "DR_a_cargo_Apellido_y_Nombre"
];

const INFORME_FIELDS = [
  "id",
  "ID_Clase",
  "ID_Grupo",
  "Clase",
  "Hora_Desde",
  "Estado",
  "Estado_Estado",
  "Estado_Clase",
  "Estado_Clase_Display",
  "Estado_Clase_Estado",
  "Estado_Clase_ID",
  "ID_Estado_Clase",
  "Tipo_de_Clase",
  "DR_a_cargo_Apellido_y_Nombre",
  "Hora",
  "Plataforma",
  "Evidencia",
  "Propuesta",
  "Etapa",
  "Notas_Pedagogicas",
  "Notas_Complementarias",
  "Motivo",
  "Coordinacion_con_DA"
];

const state = {
  selectedRecord: null,
  viewMode: "recent",
  agendaByGroup: new Map(),
  informesByClase: new Map(),
  informesByGroup: new Map(),
  loadingTables: null,
  loadingInformes: null,
  informesLoaded: false,
  agendaLoadedFull: false,
  historyVisible: false
};

const ESTADO_TEXT_BY_ID = {
  1: "Dictada",
  4: "Cancelada por el DR",
  5: "Cancelada con anticipacion",
  6: "Cancelada sin anticipacion",
  7: "Cancelada por factores externos"
};

function getLabel(value) {
  return Array.isArray(value) ? value[1] : value;
}

function getId(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getGrupoId(record) {
  return getId(record?.ID_Grupo_Grupo) || getId(record?.ID_Grupo) || record?.id;
}

function getSelectedGrupoId(record) {
  return getId(record?.ID_Grupo_Grupo) || record?.id || getId(record?.ID_Grupo);
}

function mapKey(value) {
  const id = getId(value);
  return id === null || id === undefined ? "" : String(id);
}

function isEmpty(value) {
  return value === null || value === undefined || value === "";
}

function getDisplayText(...values) {
  for (const value of values) {
    const label = getLabel(value);
    if (label === null || label === undefined || label === "") continue;
    const text = String(label).trim();
    if (!text || /^\d+$/.test(text)) continue;
    return text;
  }

  return "";
}

function getEstadoId(agendaRow, informe) {
  return Number(
    getId(informe?.Estado_Clase_ID) ||
    getId(informe?.ID_Estado_Clase) ||
    getId(informe?.Estado) ||
    getId(agendaRow.Estado_Clase_ID) ||
    getId(agendaRow.ID_Estado_Clase) ||
    getId(agendaRow.Estado_Clase)
  );
}

function getEstadoTexto(agendaRow, informe) {
  const estadoId = getEstadoId(agendaRow, informe);

  return getDisplayText(
    informe?.Estado_Estado,
    informe?.Estado_Clase_Estado,
    informe?.Estado_Clase_Display,
    informe?.Estado_Clase,
    agendaRow.Estado_Estado,
    agendaRow.Estado_Clase_Estado,
    agendaRow.Estado_Clase_Display,
    agendaRow.Estado_Clase
  ) || ESTADO_TEXT_BY_ID[estadoId] || "Pendiente";
}

function normalizeRecord(record) {
  const fields = record?.fields || record || {};
  const normalized = { id: record?.id ?? fields.id };

  AGENDA_FIELDS.forEach(field => {
    if (field !== "id") normalized[field] = fields[field];
  });

  return normalized;
}

function tableToRows(table, fields) {
  if (!table?.id) return [];

  return table.id.map((id, index) => {
    const row = { id };
    fields.forEach(field => {
      if (field !== "id") row[field] = table[field]?.[index];
    });
    return row;
  });
}

function compareClaseRows(a, b) {
  const infA = state.informesByClase.has(a.id);
  const infB = state.informesByClase.has(b.id);
  const fechaA = a.Clase || 0;
  const fechaB = b.Clase || 0;

  if (infA && !infB) return -1;
  if (!infA && infB) return 1;
  if (infA && infB) return fechaB - fechaA;
  return fechaA - fechaB;
}

function compareRecentReports(a, b) {
  return (b.Clase || 0) - (a.Clase || 0);
}

function indexAgenda(records) {
  const next = new Map();

  records.forEach(raw => {
    const row = normalizeRecord(raw);
    const groupId = getGrupoId(row);
    if (!groupId) return;

    if (!next.has(groupId)) next.set(groupId, []);
    next.get(groupId).push(row);
  });

  next.forEach(rows => rows.sort(compareClaseRows));
  state.agendaByGroup = next;
}

function indexInformes(table) {
  const nextByClase = new Map();
  const nextByGroup = new Map();

  tableToRows(table, INFORME_FIELDS).forEach(row => {
    const claseId = getId(row.ID_Clase);
    if (claseId) nextByClase.set(claseId, row);

    const group = mapKey(row.ID_Grupo);
    if (group) {
      if (!nextByGroup.has(group)) nextByGroup.set(group, []);
      nextByGroup.get(group).push(row);
    }
  });

  nextByGroup.forEach(rows => rows.sort(compareRecentReports));
  state.informesByClase = nextByClase;
  state.informesByGroup = nextByGroup;
}

async function ensureInformesLoaded() {
  if (state.informesLoaded) return;
  if (state.loadingInformes) return state.loadingInformes;

  state.loadingInformes = grist.docApi.fetchTable("Informe")
    .then(table => {
      indexInformes(table);
      state.informesLoaded = true;
    })
    .finally(() => {
      state.loadingInformes = null;
    });

  return state.loadingInformes;
}

async function ensureTablesLoaded() {
  if (state.loadingTables) return state.loadingTables;

  state.loadingTables = (async () => {
    const fetches = [];
    const positions = {};

    if (!state.informesLoaded) {
      positions.informes = fetches.length;
      fetches.push(ensureInformesLoaded());
    }

    if (!state.agendaLoadedFull) {
      positions.agenda = fetches.length;
      fetches.push(grist.docApi.fetchTable("Agenda"));
    }

    const results = await Promise.all(fetches);
    const agenda = results[positions.agenda];

    if (agenda) {
      indexAgenda(tableToRows(agenda, AGENDA_FIELDS));
      state.agendaLoadedFull = true;
    }
  })().finally(() => {
    state.loadingTables = null;
  });

  return state.loadingTables;
}

function formatDateValue(value) {
  const labelValue = getLabel(value);

  if (typeof labelValue === "number" && labelValue > 1000000000) {
    const date = new Date(labelValue * 1000);
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ).toLocaleDateString("es-AR");
  }

  return String(labelValue ?? "").trim();
}

function appendFormattedValue(container, value, fieldName) {
  if (isEmpty(value)) {
    const empty = document.createElement("span");
    empty.className = "empty-val";
    empty.textContent = "---";
    container.appendChild(empty);
    return;
  }

  const text = formatDateValue(value);

  if (text.startsWith("http")) {
    const link = document.createElement("a");
    link.href = text;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = fieldName === "Evidencia" ? "VER EVIDENCIA" : "VER LINK";
    container.appendChild(link);
    return;
  }

  container.textContent = text;
}

function getCamposVisualizar(agendaRow, informe) {
  const estadoOriginal = getEstadoTexto(agendaRow, informe);
  const estadoTexto = estadoOriginal.toLowerCase();
  const estadoId = getEstadoId(agendaRow, informe);
  const tieneEvidencia = !isEmpty(informe?.Evidencia);
  const result = {
    campos: [],
    badgeClass: "st-default",
    textoBadge: estadoOriginal
  };

  if (estadoId === 1 || estadoTexto.includes("dictada")) {
    result.campos = ["Propuesta", "Etapa"];
    if (tieneEvidencia) result.campos.push("Evidencia");
    result.campos.push("Notas_Pedagogicas", "Notas_Complementarias");
    result.badgeClass = "st-dictada";

    const plataforma = getLabel(informe?.Plataforma);
    if (plataforma) result.textoBadge = `Dictada a traves de ${plataforma}`;
    return result;
  }

  if (tieneEvidencia) result.campos.push("Evidencia");

  if ([4, 5, 6, 7].includes(estadoId) || estadoTexto.includes("cancelada")) {
    result.badgeClass = "st-rojo";
    result.campos.push("Motivo", "Notas_Complementarias", "Coordinacion_con_DA");
  } else {
    result.campos.push("Motivo", "Notas_Complementarias");
  }

  return result;
}

function createInfoField(fieldName, value) {
  if (fieldName === "Notas_Complementarias" && isEmpty(value)) return null;

  const field = document.createElement("div");
  field.className = "campo-ficha";
  if (!["Propuesta", "Etapa"].includes(fieldName)) {
    field.classList.add("full-width");
  }

  const label = document.createElement("div");
  label.className = "label-ficha";
  label.textContent = fieldName.replace(/_/g, " ");

  const content = document.createElement("div");
  content.className = "valor-ficha";
  appendFormattedValue(content, value, fieldName);

  field.append(label, content);
  return field;
}

function createFicha(agendaRow) {
  const informe = state.informesByClase.get(agendaRow.id);
  const { campos, badgeClass, textoBadge } = getCamposVisualizar(agendaRow, informe);
  const horaMostrar = informe?.Hora || agendaRow.Hora_Desde || "--:--";
  const dr = getLabel(agendaRow.DR_a_cargo_Apellido_y_Nombre) || "Sin DR";

  const ficha = document.createElement("div");
  ficha.className = "ficha";

  const header = document.createElement("div");
  header.className = "ficha-header";

  const titleBox = document.createElement("div");
  const title = document.createElement("div");
  title.className = "ficha-titulo";
  title.textContent = `${formatDateValue(agendaRow.Clase)} - ${horaMostrar} hs`;

  const subtitle = document.createElement("div");
  subtitle.className = "ficha-sub";
  subtitle.textContent = `${agendaRow.Tipo_de_Clase || "Clase"} | ${dr}`;

  titleBox.append(title, subtitle);

  const badge = document.createElement("span");
  badge.className = `badge ${badgeClass}`;
  badge.textContent = textoBadge;

  header.append(titleBox, badge);

  const body = document.createElement("div");
  body.className = "ficha-body";

  if (informe) {
    campos.forEach(fieldName => {
      const field = createInfoField(fieldName, informe[fieldName]);
      if (field) body.appendChild(field);
    });
  } else {
    const pending = document.createElement("div");
    pending.className = "msg-pendiente";
    pending.textContent = "Informe no cargado";
    body.appendChild(pending);
  }

  ficha.append(header, body);
  return ficha;
}

function agendaRowFromInforme(informe) {
  const claseId = getId(informe.ID_Clase);
  const estadoTexto = getEstadoTexto({}, informe);

  return {
    id: claseId || informe.id,
    ID_Grupo: informe.ID_Grupo,
    Clase: informe.Clase,
    Hora_Desde: informe.Hora_Desde,
    Estado_Clase: estadoTexto,
    Estado_Clase_Display: estadoTexto,
    Estado_Clase_Estado: estadoTexto,
    Estado_Clase_ID: informe.Estado_Clase_ID || informe.ID_Estado_Clase || informe.Estado,
    ID_Estado_Clase: informe.ID_Estado_Clase,
    Tipo_de_Clase: informe.Tipo_de_Clase,
    DR_a_cargo_Apellido_y_Nombre: informe.DR_a_cargo_Apellido_y_Nombre
  };
}

function getRowsForCurrentView(rows) {
  if (state.viewMode === "full") return [...rows].sort(compareClaseRows);

  return rows
    .filter(row => state.informesByClase.has(row.id))
    .sort(compareRecentReports)
    .slice(0, 4);
}

function getRecentRowsForGroup(grupoId) {
  return (state.informesByGroup.get(mapKey(grupoId)) || [])
    .slice(0, 4)
    .map(agendaRowFromInforme);
}

function renderEmpty(message) {
  const container = document.getElementById("historialContenido");
  container.textContent = "";

  const empty = document.createElement("div");
  empty.className = "msg-pendiente";
  empty.textContent = message;
  container.appendChild(empty);
}

function updateSelectedGroup(record) {
  const actionButtons = document.querySelectorAll("[data-history-view]");

  if (!record) {
    state.selectedRecord = null;
    state.historyVisible = false;
    document.getElementById("grupoLabel").textContent = "---";
    actionButtons.forEach(btn => { btn.disabled = true; });
    renderEmpty("Selecciona un grupo para ver su historial.");
    return;
  }

  state.selectedRecord = normalizeRecord(record);
  state.historyVisible = false;
  const grupoId = getSelectedGrupoId(state.selectedRecord);
  const grupoLabel = document.getElementById("grupoLabel");
  grupoLabel.textContent =
    state.selectedRecord.ID_Grupo_display ||
    getLabel(state.selectedRecord.ID_Grupo) ||
    `Grupo ${grupoId}`;

  actionButtons.forEach(btn => { btn.disabled = false; });
  renderEmpty("Grupo seleccionado. Elegi una vista para cargar las clases.");
}

async function renderHistorial() {
  if (!state.selectedRecord) {
    renderEmpty("Selecciona un grupo para ver su historial.");
    return;
  }

  const actionButtons = document.querySelectorAll("[data-history-view]");
  const grupoId = getSelectedGrupoId(state.selectedRecord);
  state.historyVisible = true;
  actionButtons.forEach(btn => { btn.disabled = true; });
  renderEmpty("Cargando historial...");

  try {
    if (state.viewMode === "recent") {
      await ensureInformesLoaded();
    } else {
      await ensureTablesLoaded();
    }

    const allRows = state.viewMode === "recent"
      ? []
      : state.agendaByGroup.get(grupoId) || [];
    const rows = state.viewMode === "recent"
      ? getRecentRowsForGroup(grupoId)
      : getRowsForCurrentView(allRows);
    const container = document.getElementById("historialContenido");
    container.textContent = "";

    if (rows.length === 0) {
      const message = state.viewMode === "recent"
        ? "No hay informes cargados para mostrar en el ultimo mes."
        : "No hay clases cargadas para este grupo.";
      renderEmpty(message);
      return;
    }

    const fragment = document.createDocumentFragment();
    rows.forEach(row => fragment.appendChild(createFicha(row)));
    container.appendChild(fragment);
  } catch (error) {
    console.error("Error al cargar historial:", error);
    renderEmpty("No se pudo cargar el historial.");
  } finally {
    actionButtons.forEach(btn => { btn.disabled = !state.selectedRecord; });
  }
}

function initHistoryButtons() {
  document.getElementById("btnUltimoMes")?.setAttribute("data-history-view", "recent");
  document.getElementById("btnHistorialCompleto")?.setAttribute("data-history-view", "full");

  document.querySelectorAll("[data-history-view]").forEach(button => {
    button.addEventListener("click", () => {
      state.viewMode = button.dataset.historyView;
      renderHistorial();
    });
  });
}

if (typeof grist !== "undefined") {
  initHistoryButtons();

  grist.onRecords(records => {
    if (!state.agendaLoadedFull) {
      indexAgenda(records || []);
      state.agendaLoadedFull = true;
    }
    if (!state.historyVisible) return;
    renderHistorial();
  });

  grist.onRecord(updateSelectedGroup);
  grist.ready({ requiredAccess: "full" });
}
