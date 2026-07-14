(function () {
  const CAMPOS_DICTADA = [
    "Plataforma",
    "Evidencia",
    "Hora",
    "Propuesta",
    "Etapa",
    "Notas_Pedagogicas",
    "Notas_Complementarias",
    "Fecha_Coord",
    "Hora_Coord",
    "Via_de_Comunicacion",
    "Tema_Tratado",
    "Coordinacion_con_DA",
    "Evidencia_Coordinacion",
    "Problemas_Tecnicos"
  ];

  const CAMPOS_CANCELADA = [
    "Motivo",
    "Evidencia",
    "Notas_Pedagogicas",
    "Notas_Complementarias",
    "Via_de_Comunicacion",
    "Problemas_Tecnicos"
  ];

  const CAMPOS_INFORME = [
    "id",
    "ID_Clase",
    ...new Set([...CAMPOS_DICTADA, ...CAMPOS_CANCELADA])
  ];

  const ESTADOS_CANCELADOS = new Set([2, 4, 5, 6, 7]);

  const state = {
    informeByClase: new Map(),
    loadingInformes: null,
    informesLoaded: false,
    selectedRecord: null,
    selectedRecordId: null,
    detailVisible: false
  };

  const contenido = document.getElementById("contenido");
  const idLabel = document.getElementById("idLabel");
  const grupoLabel = document.getElementById("grupoLabel");
  const badgeEstado = document.getElementById("badgeEstado");
  const btnVerInforme = document.getElementById("btnVerInforme");

  function getFields(record) {
    return record?.fields || record || {};
  }

  function getLabel(value) {
    return Array.isArray(value) ? value[1] : value;
  }

  function getId(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function isEmpty(value) {
    const label = getLabel(value);
    return label === null || label === undefined || String(label).trim() === "" || String(label).trim() === "---";
  }

  function clearNode(node) {
    node.textContent = "";
  }

  function renderMessage(message, isError) {
    clearNode(contenido);
    const div = document.createElement("div");
    div.className = "msg";
    if (isError) div.style.color = "#e11d48";
    div.textContent = message;
    contenido.appendChild(div);
  }

  function normalizeRecord(record) {
    const fields = getFields(record);
    return {
      id: record?.id ?? fields.id,
      ID_Grupo: fields.ID_Grupo,
      ID_Grupo_display: fields.ID_Grupo_display,
      Grupo: fields.Grupo,
      ID_Clase: fields.ID_Clase,
      ID_Clase_display: fields.ID_Clase_display,
      Estado_Clase: fields.Estado_Clase,
      Estado_Clase_Display: fields.Estado_Clase_Display,
      Estado_Clase_ID: fields.Estado_Clase_ID
    };
  }

  function normalizeInforme(table, index) {
    return CAMPOS_INFORME.reduce((row, field) => {
      if (field === "id") row.id = table.id?.[index];
      else row[field] = table[field]?.[index];
      return row;
    }, {});
  }

  function indexInformes(table) {
    const next = new Map();
    const ids = table?.id || [];

    ids.forEach((_, index) => {
      const row = normalizeInforme(table, index);
      const claseId = getId(row.ID_Clase);
      if (claseId) next.set(Number(claseId), row);
    });

    state.informeByClase = next;
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

  function formatDate(value) {
    const raw = getLabel(value);
    if (!raw) return null;

    const date = typeof raw === "number"
      ? new Date(raw * (raw < 10000000000 ? 1000 : 1))
      : new Date(raw);

    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function formatValue(value, fieldName) {
    if (isEmpty(value)) return null;
    if (fieldName === "Fecha_Coord") return formatDate(value);

    return String(getLabel(value)).trim();
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
      return false;
    }
  }

  function appendValue(container, value, fieldName) {
    if (isHttpUrl(value)) {
      const link = document.createElement("a");
      link.href = value;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = fieldName === "Evidencia" || fieldName === "Evidencia_Coordinacion"
        ? "Ver evidencia"
        : value;
      container.appendChild(link);
      return;
    }

    container.textContent = value;
  }

  function createField(fieldName, value) {
    const formatted = formatValue(value, fieldName);
    if (!formatted) return null;

    const field = document.createElement("div");
    field.className = "campo";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = fieldName.replace(/_/g, " ");

    const content = document.createElement("div");
    content.className = "valor";
    appendValue(content, formatted, fieldName);

    field.append(label, content);
    return field;
  }

  function getEstadoInfo(record) {
    const estadoId = Number(getId(record.Estado_Clase_ID));
    const estadoTexto = String(getLabel(record.Estado_Clase) || getLabel(record.Estado_Clase_Display) || "S/E");

    if (estadoId === 1) {
      return { badgeClass: "st-dictada", fields: CAMPOS_DICTADA, text: estadoTexto };
    }

    if (ESTADOS_CANCELADOS.has(estadoId)) {
      return { badgeClass: "st-rojo", fields: CAMPOS_CANCELADA, text: estadoTexto };
    }

    return { badgeClass: "st-default", fields: [], text: estadoTexto };
  }

  function renderBadge(className, text) {
    clearNode(badgeEstado);
    const badge = document.createElement("span");
    badge.className = `badge ${className}`;
    badge.textContent = text || "S/E";
    badgeEstado.appendChild(badge);
  }

  function renderInforme(informe, fields) {
    clearNode(contenido);
    const fragment = document.createDocumentFragment();

    fields.forEach(fieldName => {
      const field = createField(fieldName, informe[fieldName]);
      if (field) fragment.appendChild(field);
    });

    if (!fragment.childNodes.length) {
      renderMessage("El informe no contiene datos registrados para los campos configurados.");
      return;
    }

    contenido.appendChild(fragment);
  }

  function updateHeader(record) {
    state.selectedRecord = record;
    state.selectedRecordId = record.id;
    state.detailVisible = false;

    idLabel.textContent = getLabel(record.ID_Clase_display) || getLabel(record.ID_Clase) || record.id;
    grupoLabel.textContent = getLabel(record.ID_Grupo_display) || getLabel(record.ID_Grupo) || getLabel(record.Grupo) || "---";

    const estado = getEstadoInfo(record);
    renderBadge(estado.badgeClass, estado.text);
    btnVerInforme.disabled = estado.fields.length === 0;

    if (estado.fields.length === 0) {
      renderMessage("No hay campos configurados para el estado de esta clase.");
      return;
    }

    renderMessage("Clase seleccionada. Presiona Ver informe para cargar el detalle.");
  }

  async function loadSelectedInforme() {
    const record = state.selectedRecord;
    if (!record?.id) return;

    const estado = getEstadoInfo(record);
    state.detailVisible = true;
    btnVerInforme.disabled = true;
    renderMessage("Cargando informe...");

    try {
      await ensureInformesLoaded();
      if (state.selectedRecordId !== record.id) return;

      const informe = state.informeByClase.get(Number(record.id));
      if (!informe) {
        renderMessage("No se encontro informe para esta clase.");
        return;
      }

      renderInforme(informe, estado.fields);
    } catch (error) {
      renderMessage(`Error al cargar informe: ${error.message}`, true);
    } finally {
      if (state.selectedRecordId === record.id) btnVerInforme.disabled = false;
    }
  }

  function renderRecord(rawRecord) {
    const record = normalizeRecord(rawRecord);

    if (!record.id) {
      state.selectedRecord = null;
      state.selectedRecordId = null;
      state.detailVisible = false;
      idLabel.textContent = "---";
      grupoLabel.textContent = "---";
      btnVerInforme.disabled = true;
      clearNode(badgeEstado);
      renderMessage("Seleccione una clase...");
      return;
    }

    updateHeader(record);
  }

  if (typeof grist !== "undefined") {
    btnVerInforme.addEventListener("click", loadSelectedInforme);
    grist.onRecord(renderRecord);
    grist.ready({ requiredAccess: "full" });
  } else {
    renderMessage("No se pudo cargar la API de Grist.", true);
  }
})();
