/**
 * VARIABLES GLOBALES Y ESTADO
 */
let calendar;
let recordClase = null;
let informeExistente = null;
let idGrupoRec = null;
let esFechaFutura = false;
let eventosFeriados = [];
let eventosClases = [];
let cacheInformes = null;
let cacheInformesPromise = null;
let cacheInformesCompleta = false;
let datosFormularioPromise = null;
let informeByClaseId = new Map();
let informesByGrupo = new Map();
let accessTokenInfo = null;
let accessTokenPromise = null;
let informesPorClasePromise = new Map();
let informesPorGrupoPromise = new Map();
let clasesInformesConsultadas = new Set();
let gruposInformesConsultados = new Set();
let canceladasByGrupo = new Map();
let recuperadasByGrupo = new Map();
let cancelacionesRestringidasPorGrupoSemana = new Map();
let recordsById = new Map();
let agendaVersion = 0;
let feriadosVersion = 0;
let lastRenderedAgendaVersion = -1;
let lastRenderedFeriadosVersion = -1;

const ESTADOS_CANCELADOS = new Set([4, 5, 6, 7]);
const ESTADOS_RESTRINGIDOS = new Set([6, 7]);
const ESTADOS_ROJOS = new Set([2, 4, 5, 6, 7]);
const ESTADOS_INFORME_VISIBLES = [1, 6, 4, 5, 7];
const DRIVE_FILE_PREFIX = "https://drive.google.com/file";
const DURACION_CLASE_MS = 45 * 60000;
const TIPO_CLASE_RECUPERACION = "Recuperación";
const TIPOS_DIA_AGENDA = new Set(["Hábil", "HÃ¡bil", "Feriado"]);

const opcionesManuales = { 
    'Plataforma': ['Jabber', 'Webex', 'Meet/Zoom', 'Conferences'], 
    'Propuesta': [], 
    'Via_de_Comunicacion': [], 
    'Etapa': [] 
};
let motivosPorEstado = { "4": [], "5": [], "6": [], "7": [] };

function normalizeRefId(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRefLabel(value) {
  return Array.isArray(value) ? value[1] : value;
}

function mapKey(value) {
  const normalized = normalizeRefId(value);
  return normalized === null || normalized === undefined ? '' : String(normalized);
}

function getGrupoId(record) {
  return normalizeRefId(record?.ID_Grupo_Grupo) ?? normalizeRefId(record?.ID_Grupo) ?? record?.id;
}

function getSemanaKey(grupoId, semana) {
  return `${mapKey(grupoId)}|${semana ?? ''}`;
}

function gristTimestampToDate(v) {
  return new Date(typeof v === 'number' ? v * 1000 : v);
}

function gristTimestampToLocalDate(v) {
  const d = gristTimestampToDate(v);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function formatDateInputValue(value) {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'string') {
    const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoDate) return isoDate[0];
  }

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(Math.abs(numericValue) < 1e12 ? numericValue * 1000 : numericValue)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
}

function tableRowToObject(table, idx) {
  const row = {};
  Object.keys(table || {}).forEach(key => {
    row[key] = table[key]?.[idx];
  });
  return row;
}

function getEstadoId(value) {
  return Number(normalizeRefId(value));
}

function fetchInformes(force = false) {
  if (!force && cacheInformesCompleta && cacheInformes) return Promise.resolve(cacheInformes);
  if (!force && cacheInformesPromise) return cacheInformesPromise;

  cacheInformesPromise = grist.docApi.fetchTable("Informe")
    .then(table => {
      setCacheInformes(table);
      cacheInformesCompleta = true;
      return table;
    })
    .finally(() => {
      cacheInformesPromise = null;
    });

  return cacheInformesPromise;
}

function upsertInformeEnCache(record) {
  return upsertInformesEnCache(record ? [record] : []);
}

function upsertInformesEnCache(records) {
  if (!records?.length) return false;

  if (!cacheInformes) cacheInformes = { id: [] };
  if (!Array.isArray(cacheInformes.id)) cacheInformes.id = [];

  let changed = false;
  records.forEach(record => {
    const id = record?.id;
    if (id === null || id === undefined) return;

    let idx = cacheInformes.id.findIndex(existingId => existingId === id);
    if (idx === -1) {
      idx = cacheInformes.id.length;
      cacheInformes.id.push(id);
    }

    const allKeys = new Set([...Object.keys(cacheInformes), ...Object.keys(record)]);
    allKeys.forEach(key => {
      if (!cacheInformes[key]) cacheInformes[key] = Array(cacheInformes.id.length).fill(null);
      while (cacheInformes[key].length < cacheInformes.id.length) cacheInformes[key].push(null);
      if (key in record) cacheInformes[key][idx] = record[key];
    });
    changed = true;
  });

  if (!changed) return false;
  setCacheInformes(cacheInformes);
  return true;
}

function getAddedRecordId(result) {
  let value = result?.retValues?.[0];

  // Compatibilidad con versiones de Grist que devuelven directamente
  // el arreglo de resultados en lugar del objeto con retValues.
  if (value === undefined && Array.isArray(result)) value = result[0];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    value = value.id ?? value.rowId;
  }
  if (Array.isArray(value)) value = value[0];

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function construirInformeCacheLocal(data, id, existente = null, clase = recordClase) {
  return {
    ID_Grupo: getGrupoId(clase),
    Clase: clase?.Clase,
    Hora_Desde: clase?.Hora_Desde,
    Tipo_de_Clase: clase?.Tipo_de_Clase,
    DR_a_cargo_Apellido_y_Nombre:
      clase?.DR_a_cargo_Apellido_y_Nombre ?? clase?.DR_a_cargo,
    ...(existente || {}),
    ...data,
    id,
    ID_Clase: clase?.id ?? data.ID_Clase,
    Estado_Clase_ID: data.Estado
  };
}

async function getReadOnlyAccessToken() {
  const ahora = Date.now();
  if (accessTokenInfo?.expiresAt > ahora + 5000) return accessTokenInfo;
  if (accessTokenPromise) return accessTokenPromise;

  accessTokenPromise = grist.docApi.getAccessToken({ readOnly: true })
    .then(info => {
      accessTokenInfo = {
        ...info,
        expiresAt: Date.now() + Math.max(Number(info.ttlMsecs) || 60000, 10000)
      };
      return accessTokenInfo;
    })
    .finally(() => {
      accessTokenPromise = null;
    });

  return accessTokenPromise;
}

async function fetchInformesFiltrados(filter) {
  const tokenInfo = await getReadOnlyAccessToken();
  const baseUrl = String(tokenInfo.baseUrl || '').replace(/\/$/, '');
  const url = new URL(`${baseUrl}/tables/Informe/records`);
  url.searchParams.set('filter', JSON.stringify(filter));
  url.searchParams.set('auth', tokenInfo.token);

  // El token en query string evita el preflight CORS que Grist no admite
  // para el encabezado Authorization desde un custom widget externo.
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Consulta filtrada de Informe: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return records.map(record => ({ id: record.id, ...(record.fields || {}) }));
}

function filtrarCacheInformes(filter) {
  const ids = cacheInformes?.id || [];
  return ids
    .map((_, idx) => tableRowToObject(cacheInformes, idx))
    .filter(row => Object.entries(filter).every(([column, allowedValues]) => {
      const rowKey = mapKey(row[column]);
      return (allowedValues || []).some(value => mapKey(value) === rowKey);
    }));
}

async function consultarInformes(filter) {
  try {
    const records = await fetchInformesFiltrados(filter);
    upsertInformesEnCache(records);
    return records;
  } catch (e) {
    console.warn("No se pudo usar la consulta filtrada; se usa fetchTable como respaldo:", e);
    await fetchInformes();
    return filtrarCacheInformes(filter);
  }
}

async function cargarInformeDeClase(record, { force = false } = {}) {
  if (!record?.id) return null;

  const key = String(record.id);
  const local = informeByClaseId.get(key) || null;
  if (!force && (local || clasesInformesConsultadas.has(key))) return local;
  if (informesPorClasePromise.has(key)) return informesPorClasePromise.get(key);

  const request = consultarInformes({ ID_Clase: [record.id] })
    .then(() => {
      clasesInformesConsultadas.add(key);
      return informeByClaseId.get(key) || null;
    })
    .finally(() => {
      informesPorClasePromise.delete(key);
    });

  informesPorClasePromise.set(key, request);
  return request;
}

async function cargarInformesDeGrupo(grupoId, { force = false } = {}) {
  const key = mapKey(grupoId);
  if (!key) return [];
  if (!force && gruposInformesConsultados.has(key)) {
    return informesByGrupo.get(key) || [];
  }
  if (informesPorGrupoPromise.has(key)) return informesPorGrupoPromise.get(key);

  const request = consultarInformes({ ID_Grupo: [normalizeRefId(grupoId)] })
    .then(() => {
      gruposInformesConsultados.add(key);
      return informesByGrupo.get(key) || [];
    })
    .finally(() => {
      informesPorGrupoPromise.delete(key);
    });

  informesPorGrupoPromise.set(key, request);
  return request;
}

function setInformeButtonState(informe, { loading = false, error = false } = {}) {
  const btnInforme = document.getElementById('btnAbrirInforme');
  const txtBtn = document.getElementById('txtBtnInforme');

  if (loading) {
    if (txtBtn) txtBtn.textContent = "Cargando informe...";
    if (btnInforme) {
      btnInforme.classList.remove('btn-edit');
      btnInforme.disabled = true;
    }
    return;
  }

  if (error) {
    if (txtBtn) txtBtn.textContent = "Reintentar informe";
    if (btnInforme) {
      btnInforme.classList.remove('btn-edit');
      btnInforme.disabled = false;
    }
    return;
  }

  if (btnInforme) btnInforme.disabled = false;

  if (informe && informe.Estado) {
    if (txtBtn) txtBtn.textContent = "Ver/Editar Informe";
    if (btnInforme) btnInforme.classList.add('btn-edit');
  } else {
    if (txtBtn) txtBtn.textContent = "Informar Clase";
    if (btnInforme) btnInforme.classList.remove('btn-edit');
  }
}

function actualizarInformeActualDesdeCache() {
  if (!recordClase) return null;
  if (!cacheInformes) {
    informeExistente = null;
    setInformeButtonState(null);
    return null;
  }

  informeExistente = informeByClaseId.get(String(recordClase.id)) || null;
  setInformeButtonState(informeExistente);
  return informeExistente;
}

function setCacheInformes(table) {
  cacheInformes = table;
  informeByClaseId = new Map();
  informesByGrupo = new Map();

  const ids = table?.id || [];
  ids.forEach((_, idx) => {
    const claseId = normalizeRefId(table.ID_Clase?.[idx]);
    if (claseId !== null && claseId !== undefined) {
      informeByClaseId.set(String(claseId), tableRowToObject(table, idx));
    }

    const grupoId = normalizeRefId(table.ID_Grupo?.[idx]);
    const grupo = mapKey(grupoId);
    if (grupo) {
      if (!informesByGrupo.has(grupo)) informesByGrupo.set(grupo, []);
      informesByGrupo.get(grupo).push(idx);
    }
  });
}

function rebuildAgendaCaches(records) {
  canceladasByGrupo = new Map();
  recuperadasByGrupo = new Map();
  cancelacionesRestringidasPorGrupoSemana = new Map();

  (records || []).forEach(r => {
    const grupoId = getGrupoId(r);
    const grupo = mapKey(grupoId);
    if (!grupo) return;

    if (r.Tipo_de_Clase === TIPO_CLASE_RECUPERACION) {
      recuperadasByGrupo.set(grupo, (recuperadasByGrupo.get(grupo) || 0) + 1);
    }

    const estadoId = getEstadoId(r.Estado_Clase_ID);
    if (ESTADOS_CANCELADOS.has(estadoId)) {
      canceladasByGrupo.set(grupo, (canceladasByGrupo.get(grupo) || 0) + 1);
    }

    if (ESTADOS_RESTRINGIDOS.has(estadoId)) {
      const key = getSemanaKey(grupoId, r.Clase_Semana);
      cancelacionesRestringidasPorGrupoSemana.set(key, (cancelacionesRestringidasPorGrupoSemana.get(key) || 0) + 1);
    }
  });
}

/**
 * CONFIGURACIÓN DINÁMICA DE FORMULARIOS
 */
const configCanceladaBase = [
  { id: 'Motivo', label: 'Motivo', type: 'select', required: true },
  { id: 'Problemas_Tecnicos', label: 'Notas Técnicas', type: 'textarea', required: true, dependsOn: 'Motivo', dependsList: ['Problemas técnicos del Docente Remoto', 'Problemas técnicos - videoconferencia', 'Problemas técnicos - conectividad', 'Problemas técnicos - causas desconocidas'] },
  { id: 'Evidencia', label: 'Evidencia', type: 'url', required: true, soloEnEstados: ["6", "7"] },
  { id: 'Notas_Complementarias', label: 'Notas Complementarias', type: 'textarea', required: false }
];

const configForm = {
  "1": [
    { id: 'Plataforma', label: 'Plataforma', type: 'select', required: true },
    { id: 'Evidencia', label: 'Evidencia (Link)', type: 'url', required: true, dependsOn: 'Plataforma', dependsVal: 'Meet/Zoom' },
    { id: 'Hora', label: 'Hora exacta inicio', type: 'time', required: true },
    { id: 'Problemas_Tecnicos', label: 'Notas técnicas', type: 'textarea', required: false },
    { id: 'Propuesta', label: 'Propuesta', type: 'select', required: true },
    { id: 'Etapa', label: 'Etapa', type: 'select', required: true },
    { id: 'Notas_Pedagogicas', label: 'Notas Pedagógicas', type: 'textarea', required: true },
    { id: 'Notas_Complementarias', label: 'Notas complementarias', type: 'textarea', required: false },    
    { id: 'Fecha_Coord', label: 'Fecha Coordinación', type: 'date', required: true },
    { id: 'Hora_Coord', label: 'Hora Coordinación', type: 'time', required: true },
    { id: 'Via_de_Comunicacion', label: 'Vía de Comunicación', type: 'select', required: true },
    { id: 'Tema_Tratado', label: 'Tema Tratado', type: 'textarea', required: true },
    { id: 'Coordinacion_con_DA', label: 'Observaciones y Acuerdos', type: 'textarea', required: true },
    { id: 'Evidencia_Coordinacion', label: 'Evidencia Coordinación', type: 'url', required: true }    
  ],
  "4": configCanceladaBase, 
  "5": configCanceladaBase, 
  "6": configCanceladaBase, 
  "7": configCanceladaBase
};

/**
 * INICIALIZACIÓN
 */
async function inicializar() {
  initCalendar();
  if (typeof grist !== 'undefined') {
    datosFormularioPromise = Promise.all([
      cargarDesplegables(),
      cargarEstados(),
      cargarCalendarioFeriados()
    ]).catch(e => console.warn("Error cargando datos iniciales:", e));

  }
  
  // ⚠️ CORRECCIÓN: Vincular eventos después de que el DOM esté listo
  const btnInforme = document.getElementById('btnAbrirInforme');
  if (btnInforme) {
    btnInforme.addEventListener('click', async () => {
      try {
        if (datosFormularioPromise) await datosFormularioPromise;
        const claseSeleccionada = recordClase;
        let informe = actualizarInformeActualDesdeCache();
        const estadoTieneInforme = ESTADOS_INFORME_VISIBLES.includes(
          getEstadoId(claseSeleccionada?.Estado_Clase_ID)
        );

        if (!informe && estadoTieneInforme) {
          setInformeButtonState(null, { loading: true });
          informe = await cargarInformeDeClase(claseSeleccionada);
          if (recordClase?.id !== claseSeleccionada?.id) return;
          informeExistente = informe;
          setInformeButtonState(informeExistente);
        }

        await prepararModalInforme();
        document.getElementById('modalInforme').style.display = 'flex';
      } catch (e) {
        setInformeButtonState(null, { error: true });
        console.error("Error abriendo el informe:", e);
        alert("No se pudo abrir el informe: " + e.message);
      }
    });
  }
  
  const btnRecup = document.getElementById('btnAbrirRecuperacion');
  if (btnRecup) {
    btnRecup.addEventListener('click', () => {
      document.getElementById('modalRecuperacion').style.display = 'flex'; 
    });
  }
  
  const btnEnviar = document.getElementById('btnEnviar');
  if (btnEnviar) {
    btnEnviar.addEventListener('click', enviarInforme);
  }
  
  // ⚠️ CORRECCIÓN CRÍTICA: Vincular el onchange del estadoSelect aquí, no en prepararModalInforme
  const estadoSelect = document.getElementById('estadoSelect');
  if (estadoSelect) {
    estadoSelect.addEventListener('change', function() {
      generarCamposDinamicos(this.value);
    });
  }
  
  // Listener para el input de recuperación
  const inputNuevaFecha = document.getElementById('nuevaFecha');
  if (inputNuevaFecha) {
    inputNuevaFecha.addEventListener('input', validarRecuperacion);
  }
  
  const btnGenerar = document.getElementById('btnGenerar');
  if (btnGenerar) {
    btnGenerar.addEventListener('click', generarClaseRecuperada);
  }

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.closeModal));
  });
}

/**
 * GENERADOR DE CAMPOS DINÁMICOS (Separado para mejor mantenimiento)
 */
function generarCamposDinamicos(estadoId) {
  const container = document.getElementById('dynamicForm');
  if (!container) return;
  
  container.innerHTML = '';
  const config = configForm[estadoId] || [];
  
  config.forEach(c => {
    const group = document.createElement('div');
    group.className = 'form-group';
    group.dataset.fieldId = c.id; // Para referencia futura
    
    // Label con requerido
    const label = document.createElement('label');
    label.innerHTML = `${c.label}${c.required ? ' <span class="req">*</span>' : ''}`;
    group.appendChild(label);
    
    // Helper text para campos de evidencia
    if (c.id === 'Evidencia' || c.id === 'Evidencia_Coordinacion') {
      const h = document.createElement('div'); 
      h.className = 'helper-text';
      h.innerHTML = `Subir <b>el archivo</b> a <a href="${recordClase?.Carpeta_Drive || '#'}" target="_blank"><i class="fa-solid fa-folder-open"></i> Drive</a> y pegar el link del <b>archivo</b> (no de la carpeta):`;
      group.appendChild(h);
    }
    
    let input;
    
    // Crear input según tipo
    if (c.type === 'select') {
      input = document.createElement('select');
      input.id = c.id;
      let opts = (c.id === 'Motivo') ? motivosPorEstado[estadoId] : opcionesManuales[c.id];
      input.innerHTML = `<option value="">Seleccione...</option>` + opts.map(o => `<option value="${o}">${o}</option>`).join('');
    } 
    else if (c.type === 'time') {
      // Contenedor para horas/minutos
      const timeContainer = document.createElement('div'); 
      timeContainer.style.display = 'flex'; 
      timeContainer.style.gap = '5px';
      timeContainer.innerHTML = `
        <input type="number" id="${c.id}_h" style="width:60px" placeholder="HH" min="0" max="23">:
        <input type="number" id="${c.id}_m" style="width:60px" placeholder="MM" min="0" max="59">
      `;
      input = document.createElement('input'); 
      input.type = 'hidden'; 
      input.id = c.id;
      group.appendChild(timeContainer);
      timeContainer.querySelectorAll('input').forEach(timeInput => {
        timeInput.addEventListener('input', () => {
          actualizarVisibilidad();
          validarBoton();
        });
      });
    } 
    else { 
      input = document.createElement(c.type === 'textarea' ? 'textarea' : 'input'); 
      if(c.type !== 'textarea') input.type = c.type;
      input.id = c.id;
    }
    
    // Event listener para validación en tiempo real
    if (input.id) {
      input.addEventListener('input', () => {
        actualizarVisibilidad();
        validarBoton();
      });
    }
    
    group.appendChild(input);
    container.appendChild(group);
  });
  
  actualizarVisibilidad();
  validarBoton();
}

/**
 * FUNCIONES DE UI Y UTILIDAD
 */
function cerrarModal(id) { 
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none'; 
}

function formatearValorHistorial(val, campoNombre) {
    if (val === null || val === undefined || val === "") return '<span class="empty-val">---</span>';
    if (Array.isArray(val)) val = val[1];
    if (typeof val === 'number' && val > 1000000000) {
      return gristTimestampToLocalDate(val).toLocaleDateString('es-AR');
    }
    const s = String(val).trim();
    if (s.startsWith("http")) {
      const label = (campoNombre === "Evidencia") ? "VER EVIDENCIA 🔗" : "VER LINK 🔗";
      return `<a href="${s}" target="_blank">${label}</a>`;
    }
    return s;
}

/**
 * HISTORIAL DE CLASES
 */
async function abrirHistorial() {
    if (!recordClase) {
        return;
    }
    
    const grupoId = getGrupoId(recordClase);
    document.getElementById("grupoHistorialLabel").textContent = recordClase.ID_Grupo_display || recordClase.ID_Grupo || "Grupo " + grupoId;
    document.getElementById('modalHistorial').style.display = 'flex';
    const contenedor = document.getElementById("historialContenido");
    contenedor.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="margin-bottom:10px; display:block;"></i>Cargando historial...</div>';
    
    try {
        await cargarInformesDeGrupo(grupoId);
        const informes = cacheInformes || { id: [] };
        contenedor.innerHTML = "";
        
        let indicesInformes = [...(informesByGrupo.get(mapKey(grupoId)) || [])];
        
        if (indicesInformes.length === 0) {
            contenedor.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;"><i class="fa-solid fa-inbox fa-2x" style="margin-bottom:10px; display:block;"></i>No hay informes cargados para este grupo</div>';
            return;
        }
        
        // ... resto de la función (ordenar y renderizar)
        indicesInformes.sort((a, b) => {
            const fechaA = informes.Clase[a] || 0;
            const fechaB = informes.Clase[b] || 0;
            return fechaB - fechaA;
        });
        
        const htmlHistorial = indicesInformes.map(infIdx => {
            // ... (mantené todo el código de renderizado existente)
            const fechaClase = informes.Clase[infIdx];
            const tipoClase = informes.Tipo_de_Clase[infIdx] || 'Clase';
            const drNombre = normalizeRefLabel(informes.DR_a_cargo_Apellido_y_Nombre[infIdx]);
            const estadoId = informes.Estado_Clase_ID
                ? Number(normalizeRefId(informes.Estado_Clase_ID[infIdx]))
                : 0;
            
            let horaMostrar = '--:--';
            if (estadoId === 1) {
                horaMostrar = informes.Hora[infIdx] || '--:--';
            } else {
                horaMostrar = informes.Hora_Desde[infIdx] || '--:--';
            }
            
            let camposVisualizar = [];
            let badgeClass = "st-default";
            let textoBadge = "Informe Cargado";
            
            if (estadoId === 1) {
                camposVisualizar = ["Propuesta", "Etapa", "Evidencia", "Tema_Tratado", "Notas_Pedagogicas", "Notas_Complementarias", "Coordinacion_con_DA"];
                badgeClass = "st-dictada";
                if (informes.Plataforma && informes.Plataforma[infIdx]) {
                    textoBadge = `Dictada - ${normalizeRefLabel(informes.Plataforma[infIdx])}`;
                }
            } else if (ESTADOS_CANCELADOS.has(estadoId)) {
                camposVisualizar = ["Motivo", "Evidencia", "Notas_Complementarias", "Coordinacion_con_DA"];
                badgeClass = "st-rojo";
                textoBadge = "Cancelada";
            }
            
            let html = `
            <div class="ficha">
                <div class="ficha-header">
                    <div>
                        <div class="ficha-titulo">${formatearValorHistorial(fechaClase)} — ${horaMostrar} hs</div>
                        <div class="ficha-sub">${tipoClase} | ${drNombre || 'Sin DR'}</div>
                    </div>
                    <span class="badge-hist ${badgeClass}">${textoBadge}</span>
                </div>
                <div class="ficha-body">`;
            
            camposVisualizar.forEach(c => {
                const valRaw = informes[c] ? informes[c][infIdx] : null;
                if (!valRaw || valRaw === "") return;
                const esLargo = !["Propuesta", "Etapa"].includes(c);
                html += `
                <div class="campo-ficha ${esLargo ? 'full-width' : ''}">
                    <div class="label-ficha">${c.replace(/_/g, ' ')}</div>
                    <div class="valor-ficha">${formatearValorHistorial(valRaw, c)}</div>
                </div>`;
            });
            
            html += `</div></div>`;
            return html;
        }).join('');

        contenedor.innerHTML = htmlHistorial;
        
    } catch (e) {
        alert('Error al cargar historial: ' + e.message);
    }
}

/**
 * GESTIÓN DEL CALENDARIO
 */
function initCalendar() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  
  calendar = new FullCalendar.Calendar(calendarEl, {
    locale: 'es', 
    initialView: 'timeGridWeek',
    handleWindowResize: true,
    aspectRatio: 1.35,
    firstDay: 1, 
    weekends: false,
    slotMinTime: '08:00:00', 
    slotMaxTime: '18:00:00', 
    allDaySlot: false,
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,dayGridMonth' },
    eventClick: (info) => { const rec = recordsById.get(Number(info.event.id)); if (rec) renderDetail(rec); },
    eventContent: (arg) => {
      if (arg.event.display === 'background') return { html: `<div style="font-size:0.7rem; color:#000000; font-weight:bold; padding:2px;">${arg.event.title}</div>` };
      let timeStr = arg.event.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const recLabel = arg.event.extendedProps.isRecuperada ? '<span class="badge-recuperada">Recuperada</span>' : '';
      return { html: `<div class="event-title-wrap"><span class="event-time-tag">${timeStr}</span><span>${arg.event.title}</span>${recLabel}</div>` };
    },
    eventDidMount: (info) => {
      const color = info.event.extendedProps.dotColor;
      if (color) { info.el.style.setProperty('--event-color', color); info.el.style.setProperty('--event-bg', color + '20'); }
    }
  });
  calendar.render();
}

async function cargarCalendarioFeriados() {
  try {
    const data = await grist.docApi.fetchTable('Calendario');
    if (data && data.Fecha) {
      eventosFeriados = data.id.map((id, i) => ({
        title: data.Tipo ? data.Tipo[i] : 'Feriado',
        start: gristTimestampToDate(data.Fecha[i]).toISOString().split('T')[0],
        display: 'background', color: '#c0ebda'
      }));
      feriadosVersion++;
      refrescarCalendario({ feriadosChanged: true });
    }
  } catch (e) { console.warn("Tabla Calendario no encontrada."); }
}

let agendaEventSource = null;
let feriadosEventSource = null;

function refrescarCalendario({ agendaChanged = true, feriadosChanged = true } = {}) {
    if (!calendar) return;

    const debeActualizarAgenda = agendaChanged && agendaVersion !== lastRenderedAgendaVersion;
    const debeActualizarFeriados = feriadosChanged && feriadosVersion !== lastRenderedFeriadosVersion;

    if (!debeActualizarAgenda && !debeActualizarFeriados) return;

    calendar.batchRendering(() => {
      if (debeActualizarAgenda) {
        if (agendaEventSource) agendaEventSource.remove();
        agendaEventSource = calendar.addEventSource(eventosClases);
        lastRenderedAgendaVersion = agendaVersion;
      }
      if (debeActualizarFeriados) {
        if (feriadosEventSource) feriadosEventSource.remove();
        feriadosEventSource = calendar.addEventSource(eventosFeriados);
        lastRenderedFeriadosVersion = feriadosVersion;
      }
    });
}

/**
 * CARGA DE DATOS DESDE GRIST
 */
async function cargarEstados() {
  const estados = await grist.docApi.fetchTable('Estados_Clase');
  const sel = document.getElementById('estadoSelect');
  if (!sel) return;
  
  const options = ['<option value="">Seleccione estado...</option>'];
  const estadosById = new Map((estados.id || []).map((id, idx) => [id, estados.Estado?.[idx]]));
  ESTADOS_INFORME_VISIBLES.forEach(id => {
    const estado = estadosById.get(id);
    if(estado) {
      options.push(`<option value="${id}">${estado}</option>`);
    }
  });
  sel.innerHTML = options.join('');
}

async function cargarDesplegables() {
  try {
    const tabla = await grist.docApi.fetchTable('Desplegables');
    if (tabla.Etapa) opcionesManuales.Etapa = tabla.Etapa.filter(e => e);
    if (tabla.Propuesta) opcionesManuales.Propuesta = tabla.Propuesta.filter(p => p);
    if (tabla.Vias_de_comunicacion) opcionesManuales.Via_de_Comunicacion = tabla.Vias_de_comunicacion.filter(v => v);
    if (tabla.Cancelada_por_el_DR) motivosPorEstado["4"] = tabla.Cancelada_por_el_DR.filter(m => m);
    if (tabla.Cancelada_CON_anticipacion) motivosPorEstado["5"] = tabla.Cancelada_CON_anticipacion.filter(m => m);
    if (tabla.Cancelada_SIN_anticipacion) motivosPorEstado["6"] = tabla.Cancelada_SIN_anticipacion.filter(m => m);
    if (tabla.Cancelada_por_Factores_Externos) motivosPorEstado["7"] = tabla.Cancelada_por_Factores_Externos.filter(m => m);
  } catch(e) { console.warn("Error cargando desplegables:", e); }
}

/**
 * RENDERIZADO DE DETALLES
 */
async function renderDetail(record) {
  if (!record) return;
  recordClase = record;
  
  const actionsArea = document.getElementById('actionsArea');
  if (actionsArea) actionsArea.style.display = 'flex';

  idGrupoRec = getGrupoId(record);

  const grupo = mapKey(idGrupoRec);
  const canLocal = canceladasByGrupo.get(grupo) || 0;
  const recLocal = recuperadasByGrupo.get(grupo) || 0;

  record.Clases_Canceladas = canLocal;
  record.Clases_Recuperadas = recLocal;

  let leyendaRecuperacion = "";
  const esCancelada = ESTADOS_CANCELADOS.has(getEstadoId(record.Estado_Clase_ID));
  if (record.Tipo_de_Clase === TIPO_CLASE_RECUPERACION) {
    leyendaRecuperacion = `<span class="val-rec-info"><i class="fa-solid fa-link"></i> ${record.Recuperacion || ''}</span>`;
  } else if (esCancelada) {
    leyendaRecuperacion = `<span class="val-rec-info"><i class="fa-solid fa-clock-rotate-left"></i> ${record.Recuperacion || 'Aun no recuperada'}</span>`;
  }

  const detailContent = document.getElementById('detailContent');
  if (detailContent) {
    detailContent.innerHTML = `
      <div class="class-detail-card" style="--state-color: ${getColorEstado(record.Estado_Clase_ID)}">
        <div class="data-group">
          <span class="label">Grupo</span>
          <div class="val">
            <i class="fa fa-graduation-cap"></i> ${record.ID_Grupo_display || record.ID_Grupo}
            <i class="fa-solid fa-eye btn-ojo" title="Ver Historial"></i>
          </div>
        </div>
        <div class="data-group"><span class="label">Fecha</span><div class="val"><i class="fa-regular fa-calendar"></i> ${formatDate(record.Clase)}</div></div>
        <div class="data-group"><span class="label">Horario</span><div class="val"><i class="fa-regular fa-clock"></i> ${record.Hora_Desde || '--:--'} hs</div></div>
        <div class="data-group"><span class="label">Dr a cargo</span><div class="val"><i class="fa-regular fa-user"></i> ${record.DR_a_cargo}</div></div>
        <div class="data-group">
          <span class="label">Estado</span>
          <div class="val val-estado">${record.Estado_Clase || 'Sin informar'}</div>
          ${leyendaRecuperacion}
        </div>
      </div>`;
    detailContent.querySelector('.btn-ojo')?.addEventListener('click', abrirHistorial);
  }

  // Actualizar stats de recuperación
  const lblGrupo = document.getElementById('lblGrupo');
  if (lblGrupo) lblGrupo.textContent = record.ID_Grupo_display || record.ID_Grupo;
  
  const txtCanceladas = document.getElementById('txtCanceladas');
  if (txtCanceladas) txtCanceladas.textContent = record.Clases_Canceladas || 0;
  
  const txtRecuperadas = document.getElementById('txtRecuperadas');
  if (txtRecuperadas) txtRecuperadas.textContent = record.Clases_Recuperadas || 0;

  // Calcular si es fecha futura
  const dClase = gristTimestampToLocalDate(record.Clase);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  esFechaFutura = dClase.getTime() > hoy.getTime();
  validarRecuperacion();
  const informeLocal = actualizarInformeActualDesdeCache();
  const estadoTieneInforme = ESTADOS_INFORME_VISIBLES.includes(getEstadoId(record.Estado_Clase_ID));

  if (!informeLocal && estadoTieneInforme) {
    setInformeButtonState(null, { loading: true });
    try {
      const informe = await cargarInformeDeClase(record);
      if (recordClase?.id !== record.id) return;
      informeExistente = informe;
      setInformeButtonState(informeExistente);
    } catch (e) {
      if (recordClase?.id !== record.id) return;
      setInformeButtonState(null, { error: true });
      console.warn("Error cargando el informe de la clase:", e);
    }
  }
}

/**
 * LÓGICA DE RECUPERACIÓN
 */
function validarRecuperacion() {
  if (!recordClase) return;
  
  const inputFecha = document.getElementById('nuevaFecha');
  const errorDiv = document.getElementById('errorCupo');
  const btnGenerar = document.getElementById('btnGenerar');
  
  if (!inputFecha || !errorDiv || !btnGenerar) return;
  
  const can = recordClase.Clases_Canceladas || 0, rec = recordClase.Clases_Recuperadas || 0;
  const estadoClaseId = getEstadoId(recordClase.Estado_Clase_ID);
  const esCancelada = ESTADOS_CANCELADOS.has(estadoClaseId);
  const tieneCupo = can > 0 && rec < can;
  const yaRecuperada = esCancelada && recordClase.Recuperacion && recordClase.Recuperacion.includes("a recuperar");
  
  let msg = "", err = false;
  if (estadoClaseId === 1) { msg = 'No se pueden recuperar clases dictadas.'; err = true; }
  else if (!esCancelada) { msg = 'Solo se pueden recuperar clases canceladas.'; err = true; }
  else if (yaRecuperada) { msg = 'Esta clase ya fue recuperada.'; err = true; }
  else if (!tieneCupo) { msg = 'No hay clases a recuperar.'; err = true; }
  
  // Restricción de mismo día
  if (!err && inputFecha.value) {
    const fechaSeleccionada = new Date(inputFecha.value);
    const fechaOriginal = gristTimestampToDate(recordClase.Clase);
    const esMismoDia = fechaSeleccionada.getUTCFullYear() === fechaOriginal.getUTCFullYear() &&
                       fechaSeleccionada.getUTCMonth() === fechaOriginal.getUTCMonth() &&
                       fechaSeleccionada.getUTCDate() === fechaOriginal.getUTCDate();
    if (esMismoDia) {
      msg = 'No podés reprogramar la clase para el mismo día que la original.';
      err = true;
    }
  }

  errorDiv.style.display = err ? 'block' : 'none'; 
  errorDiv.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
  inputFecha.disabled = err;
  btnGenerar.disabled = err || !inputFecha.value;
}

async function generarClaseRecuperada() {
  try {
    const btn = document.getElementById('btnGenerar');
    if (!btn) return;
    
    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
    
    const inputFecha = document.getElementById('nuevaFecha');
    if (!inputFecha?.value) throw new Error("Debe seleccionar una fecha");
    
    const raw = inputFecha.value.split('T');
    const ts = Math.floor(new Date(raw[0] + "T12:00:00").getTime() / 1000);
    const fOrig = gristTimestampToDate(recordClase.Clase).toLocaleDateString('es-ES');
    const fNueva = new Date(ts * 1000).toLocaleDateString('es-ES');

    await grist.docApi.applyUserActions([
      [ "AddRecord", "Agenda", null, { 
          ID_Grupo: idGrupoRec, 
          Clase: ts, 
          Hora_Desde: raw[1], 
          Tipo_de_Clase: TIPO_CLASE_RECUPERACION,
          Recuperacion: `Clase original ${fOrig}`,
          Estado_Clase_Original_ID: Number(normalizeRefId(recordClase.Estado_Clase_ID))
      }],
      [ "UpdateRecord", "Agenda", recordClase.id, { Recuperacion: `Clase a recuperar el ${fNueva}` }]
    ]);

    cerrarModal('modalRecuperacion');
    if (inputFecha) inputFecha.value = "";
    btn.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> Generar Clase';
    if(recordClase) renderDetail(recordClase);
  } catch (e) { 
    alert("Error: " + e.message); 
    const btn = document.getElementById('btnGenerar');
    if (btn) {
      btn.disabled = false; 
      btn.innerHTML = 'Generar Clase'; 
    }
  }
}

/**
 * PREPARAR MODAL DE INFORME
 */
async function prepararModalInforme() {
  const sel = document.getElementById('estadoSelect');
  const btn = document.getElementById('btnEnviar');
  const lockedWarning = document.getElementById('lockedWarning');
  const futureWarning = document.getElementById('futureWarning');
  
  if (!sel || !btn) return;
  
  const estaBloqueado = informeExistente && informeExistente.Estado_Edicion === "BLOQUEADO";
  
  if (lockedWarning) lockedWarning.style.display = estaBloqueado ? 'block' : 'none';
  btn.style.display = estaBloqueado ? 'none' : 'flex';

  // Mostrar panel informativo
  const infoPanel = document.getElementById('claseInfoPanel');
  if (infoPanel) {
    infoPanel.style.display = 'grid';
    document.getElementById('infoGrupo').innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${recordClase?.ID_Grupo_display || recordClase?.ID_Grupo || '---'}`;
    document.getElementById('infoFecha').innerHTML = `<i class="fa-regular fa-calendar"></i> ${formatDate(recordClase?.Clase)}`;
    document.getElementById('infoHora').innerHTML = `<i class="fa-regular fa-clock"></i> ${recordClase?.Hora_Desde || '--:--'} hs`;
  }

  // Verificar restricciones semanales usando caché local en lugar de fetchTable
  const grupoIdActual = getGrupoId(recordClase);
  const semanaActual = recordClase.Clase_Semana;
  const estadoActual = getEstadoId(recordClase.Estado_Clase_ID);
  const cancelacionesMismaSemana = cancelacionesRestringidasPorGrupoSemana.get(getSemanaKey(grupoIdActual, semanaActual)) || 0;
  const yaExisteCancelacionSemanal = cancelacionesMismaSemana > (ESTADOS_RESTRINGIDOS.has(estadoActual) ? 1 : 0);

  // Si hay informe existente, cargar valores
  if (informeExistente && informeExistente.Estado) {
    sel.value = informeExistente.Estado;
    
    // ⚠️ CORRECCIÓN: Generar campos PRIMERO, luego poblar valores
    generarCamposDinamicos(sel.value);
    
    const config = configForm[sel.value] || [];
    config.forEach(c => {
        const el = document.getElementById(c.id); 
        if(!el) return;
        
        let v = informeExistente[c.id]; 
        if(Array.isArray(v)) v = v[1];

        if(c.type === 'time' && v) {
          const hEl = document.getElementById(c.id+'_h');
          const mEl = document.getElementById(c.id+'_m');
          if (hEl && mEl) {
            const parts = v.split(':');
            hEl.value = parts[0] || '';
            mEl.value = parts[1] || '';
          }
        } else if (c.type === 'date' && v) {
          el.value = formatDateInputValue(v);
        } else { 
          el.value = v || ''; 
        }
        if (estaBloqueado) el.disabled = true;
      });
    actualizarVisibilidad();
    validarBoton();
  } else { 
    sel.value = ""; 
    const dynamicForm = document.getElementById('dynamicForm');
    if (dynamicForm) dynamicForm.innerHTML = ''; 
  }
  
  sel.disabled = estaBloqueado;

  // Aplicar restricciones en las opciones del select
  const esRecuperada = recordClase?.Tipo_de_Clase === TIPO_CLASE_RECUPERACION;
  const estadoOriginal = normalizeRefId(recordClase?.Estado_Clase_Original_ID) || normalizeRefId(recordClase?.Estado_Clase_ID); 
  const aplicaRestriccionRecup = esRecuperada && ESTADOS_RESTRINGIDOS.has(Number(estadoOriginal));

  for (let i = 0; i < sel.options.length; i++) {
      const opt = sel.options[i];
      const val = Number(opt.value);
      
      // Limpiar etiquetas previas
      opt.text = opt.text.replace(' (No permitido)', '').replace(' (Límite semanal)', '').replace(' (No disponible en feriado)', '');

      const esFeriado = recordClase?.Tipo_Dia === 'Feriado';
      const esEstadoRestringido = ESTADOS_RESTRINGIDOS.has(val);
      const bloqueadoPorRecup = esEstadoRestringido && aplicaRestriccionRecup;
      const bloqueadoPorSemana = esEstadoRestringido && yaExisteCancelacionSemanal;
      const bloqueadoPorFeriado = esFeriado && val !== 5 && val !== 0;

      if (bloqueadoPorRecup || bloqueadoPorSemana || bloqueadoPorFeriado) {
          opt.disabled = true;
          if (bloqueadoPorRecup) opt.text += ' (No permitido)';
          if (bloqueadoPorSemana) opt.text += ' (Límite semanal)';
          if (bloqueadoPorFeriado) opt.text += ' (No disponible en feriado)';
      } else {
          opt.disabled = false;
      }
  }
  
  // Disparar validación inicial
  validarBoton();
}

/**
 * ACTUALIZAR VISIBILIDAD DE CAMPOS CONDICIONALES
 */
function actualizarVisibilidad() {
  const st = document.getElementById('estadoSelect')?.value;
  if (!st) return;
  
  const config = configForm[st] || [];
  config.forEach(c => {
    const el = document.getElementById(c.id); 
    if (!el) return;
    
    const row = el.closest('.form-group');
    if (!row) return;
    
    let vis = true;
    
    if (c.dependsList) {
      const depEl = document.getElementById(c.dependsOn);
      vis = depEl && c.dependsList.includes(depEl.value);
    }
    else if (c.soloEnEstados) {
      vis = c.soloEnEstados.includes(st);
    }
    else if (c.dependsOn) {
      const depEl = document.getElementById(c.dependsOn);
      vis = depEl && depEl.value === c.dependsVal;
    }
    
    row.classList.toggle('hidden', !vis);
  });
}

/**
 * VALIDACIÓN DEL BOTÓN DE ENVÍO
 */
function validarBoton() {
  const st = document.getElementById('estadoSelect')?.value;
  const btnEnviar = document.getElementById('btnEnviar');
  const futureWarning = document.getElementById('futureWarning');
  
  if (!btnEnviar) return;
  
  const esProhibido = (st === "1" && esFechaFutura && !informeExistente);
  if (futureWarning) futureWarning.style.display = esProhibido ? 'block' : 'none';

  // Validación de seguridad para clases recuperadas
  const esRec = recordClase?.Tipo_de_Clase === TIPO_CLASE_RECUPERACION;
  const estOrig = normalizeRefId(recordClase?.Estado_Clase_Original_ID) || normalizeRefId(recordClase?.Estado_Clase_ID);
  const estadoSeleccionado = Number(st);

  if (esRec && ESTADOS_RESTRINGIDOS.has(Number(estOrig)) && ESTADOS_RESTRINGIDOS.has(estadoSeleccionado)) {
      if (futureWarning) {
        futureWarning.style.display = 'block';
        futureWarning.innerHTML = '⚠️ <b>Restricción:</b> No se puede cancelar con este motivo una clase recuperada de una cancelación sin anticipación o por factores externos.';
      }
      btnEnviar.disabled = true;
      return;
  }
  
  const estaBloqueado = informeExistente && informeExistente.Estado_Edicion === "BLOQUEADO";

  if (!st || esProhibido || estaBloqueado) { 
    btnEnviar.disabled = true; 
    return;
  }

  let ok = true;
  const config = configForm[st] || [];
  config.forEach(c => {
    const el = document.getElementById(c.id); 
    const row = el?.closest('.form-group');
    
    if (row && !row.classList.contains('hidden')) {
      // Validar requeridos
      if (c.required) {
        if (c.type === 'time') { 
          const h = document.getElementById(c.id+'_h')?.value;
          const m = document.getElementById(c.id+'_m')?.value;
          if (!h || !m) ok = false; 
        }
        else if (!el.value || !el.value.trim()) ok = false;
      }
      // Validar formato de links Drive
      if ((c.id === 'Evidencia' || c.id === 'Evidencia_Coordinacion') && el.value?.trim() !== "") {
        if (!el.value.startsWith(DRIVE_FILE_PREFIX)) {
          ok = false;
          el.style.border = "2px solid #ef4444";
        } else { 
          el.style.border = "1px solid #e2e8f0"; 
        }
      }
    }
  });
  
  btnEnviar.disabled = !ok;
}

/**
 * ENVÍO DE DATOS A GRIST
 */
async function enviarInforme() {
  try {
    const btn = document.getElementById('btnEnviar');
    if (!btn) return;
    
    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    
    const st = document.getElementById('estadoSelect').value;
    const claseInforme = recordClase;
    const data = { ID_Clase: claseInforme.id, Estado: parseInt(st) };
    
    const config = configForm[st] || [];
    config.forEach(c => {
      const el = document.getElementById(c.id);
      const row = el?.closest('.form-group');
      
      if (el && row && !row.classList.contains('hidden')) {
        if (c.type === 'time') {
          const h = document.getElementById(c.id+'_h')?.value || '00';
          const m = document.getElementById(c.id+'_m')?.value || '00';
          data[c.id] = `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
        }
        else {
          data[c.id] = el.value;
        }
      }
    });
    
    const informePrevio = informeExistente;
    const esEdicionInforme = Boolean(informePrevio?.id);
    if (esEdicionInforme) {
      await grist.docApi.applyUserActions([["UpdateRecord", "Informe", informePrevio.id, data]]);
      informeExistente = construirInformeCacheLocal(
        data,
        informePrevio.id,
        informePrevio,
        claseInforme
      );
      upsertInformeEnCache(informeExistente);
    } else {
      const result = await grist.docApi.applyUserActions([["AddRecord", "Informe", null, data]]);
      const nuevoId = getAddedRecordId(result);
      if (nuevoId) {
        informeExistente = construirInformeCacheLocal(data, nuevoId, null, claseInforme);
        upsertInformeEnCache(informeExistente);
      } else {
        console.warn("El informe se guardó, pero Grist no devolvió el ID del nuevo registro.");
      }
    }

    if (informeExistente?.id) {
      clasesInformesConsultadas.add(String(claseInforme.id));
    }
    setInformeButtonState(informeExistente);

    cerrarModal('modalInforme');
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Enviar Informe';
    if (recordClase) renderDetail(recordClase);
  } catch (e) { 
    alert("Error: " + e.message); 
    const btn = document.getElementById('btnEnviar');
    if (btn) {
      btn.disabled = false; 
      btn.innerHTML = 'Enviar Informe'; 
    }
  }
}

/**
 * UTILITARIOS
 */
function getColorEstado(id) { 
  const estadoId = normalizeRefId(id);
  return estadoId == 1 ? '#16B378' : (ESTADOS_ROJOS.has(Number(estadoId)) ? '#ef4444' : '#94a3b8');
}

function formatDate(v) { 
  if (!v) return '---';
  return gristTimestampToLocalDate(v).toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'});
}

/**
 * INTEGRACIÓN CON GRIST
 */
if (typeof grist !== 'undefined') {
  grist.onRecords((records) => {
    const agendaRecords = records || [];
    rebuildAgendaCaches(agendaRecords);

    recordsById.clear();
    agendaRecords.forEach(r => recordsById.set(r.id, r));

    eventosClases = agendaRecords.filter(r => TIPOS_DIA_AGENDA.has(r.Tipo_Dia)).map(r => {
      const s = gristTimestampToLocalDate(r.Clase);
      
      if (r.Hora_Desde) { 
        const p = r.Hora_Desde.split(':'); 
        s.setHours(parseInt(p[0]), parseInt(p[1]), 0); 
      } else { 
        s.setHours(12, 0, 0); 
      }

      return { 
        id: r.id, 
        title: r.ID_Grupo_display || r.ID_Grupo, 
        start: s, 
        end: new Date(s.getTime() + DURACION_CLASE_MS),
        extendedProps: { 
          dotColor: getColorEstado(r.Estado_Clase_ID), 
          isRecuperada: r.Recuperacion && r.Recuperacion.includes("a recuperar") 
        } 
      };
    });
    agendaVersion++;
    refrescarCalendario({ agendaChanged: true, feriadosChanged: false });
  });

  grist.onRecord(r => { if(r?.id) renderDetail(r); });
  
  document.addEventListener('DOMContentLoaded', inicializar);
  grist.ready({ requiredAccess: 'full' });
} else {
  // Fallback para desarrollo sin Grist
  document.addEventListener('DOMContentLoaded', () => {
    console.warn("Grist no detectado - modo desarrollo");
    inicializar();
  });
}
