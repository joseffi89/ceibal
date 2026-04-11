/**
 * VARIABLES GLOBALES Y ESTADO
 */
let calendar;               // Instancia del FullCalendar
let recordClase = null;     // Registro de la clase seleccionada actualmente
let informeExistente = null; // Datos del informe si ya fue cargado previamente
let idGrupoRec = null;      // ID del grupo para procesos de recuperación
let esFechaFutura = false;  // Flag para validar si la clase seleccionada es futura
let eventosFeriados = [];   // Eventos de fondo para días no laborables
let eventosClases = [];     // Eventos de las clases programadas

// Opciones para los campos desplegables (se completan desde la tabla 'Desplegables')
const opcionesManuales = { 
    'Plataforma': ['Jabber', 'Webex', 'Meet/Zoom', 'Conferences'], 
    'Propuesta': [], 
    'Via_de_Comunicacion': [], 
    'Etapa': [] 
};
let motivosPorEstado = { "4": [], "5": [], "6": [], "7": [] };

/**
 * CONFIGURACIÓN DINÁMICA DE FORMULARIOS
 * Define qué campos se muestran según el estado de la clase (Dictada vs Cancelada)
 */
const configCanceladaBase = [
  { id: 'Motivo', label: 'Motivo', type: 'select', required: true },
  { id: 'Problemas_Tecnicos', label: 'Notas Técnicas', type: 'textarea', required: true, dependsOn: 'Motivo', dependsList: ['Problemas técnicos del Docente Remoto', 'Problemas técnicos - videoconferencia', 'Problemas técnicos - conectividad', 'Problemas técnicos - causas desconocidas'] },
  { id: 'Evidencia', label: 'Evidencia', type: 'url', required: true, soloEnEstados: ["6", "7"] },
  { id: 'Notas_Complementarias', label: 'Notas Complementarias', type: 'textarea', required: false }
];

const configForm = {
  "1": [ // Configuración para clase "Dictada"
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
  "4": configCanceladaBase, "5": configCanceladaBase, "6": configCanceladaBase, "7": configCanceladaBase
};

/**
 * INICIALIZACIÓN
 */
async function inicializar() {
  initCalendar();
  await cargarDesplegables();
  await cargarEstados();
  await cargarCalendarioFeriados();
  
  // Asignación de eventos a botones
  document.getElementById('btnAbrirInforme').onclick = () => { 
      prepararModalInforme(); 
      document.getElementById('modalInforme').style.display = 'flex'; 
  };
  document.getElementById('btnAbrirRecuperacion').onclick = () => { 
      document.getElementById('modalRecuperacion').style.display = 'flex'; 
  };
  document.getElementById('btnEnviar').onclick = enviarInforme;
}

/**
 * FUNCIONES DE UI Y UTILIDAD
 */
function cerrarModal(id) { document.getElementById(id).style.display = 'none'; }

function formatearValorHistorial(val, campoNombre) {
    if (val === null || val === undefined || val === "") return '<span class="empty-val">---</span>';
    if (Array.isArray(val)) val = val[1];
    if (typeof val === 'number' && val > 1000000000) {
      const d = new Date(val * 1000);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toLocaleDateString('es-AR');
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
 * Recupera y muestra todos los informes previos del grupo seleccionado
 */
async function abrirHistorial() {
    if (!recordClase) return;
    
    const grupoId = recordClase.ID_Grupo_Grupo || recordClase.ID_Grupo || recordClase.id;
    document.getElementById("grupoHistorialLabel").textContent = recordClase.ID_Grupo_display || recordClase.ID_Grupo || "Grupo " + grupoId;
    document.getElementById('modalHistorial').style.display = 'flex';
    
    try {
        const informes = await grist.docApi.fetchTable("Informe");
        const contenedor = document.getElementById("historialContenido");
        contenedor.innerHTML = "";

        let indicesInformes = [];
        informes.ID_Grupo.forEach((g, i) => {
            const currentG = Array.isArray(g) ? g[0] : g;
            if (currentG === grupoId) indicesInformes.push(i);
        });

        // Ordenar por fecha descendente
        indicesInformes.sort((a, b) => (informes.Clase[b] || 0) - (informes.Clase[a] || 0));

        indicesInformes.forEach(infIdx => {
            const fechaClase = informes.Clase[infIdx];
            const tipoClase = informes.Tipo_de_Clase[infIdx] || 'Clase';
            const drNombre = Array.isArray(informes.DR_a_cargo_Apellido_y_Nombre[infIdx]) 
                ? informes.DR_a_cargo_Apellido_y_Nombre[infIdx][1] 
                : informes.DR_a_cargo_Apellido_y_Nombre[infIdx];
            
            const estadoId = informes.Estado_Clase_ID 
                ? Number(Array.isArray(informes.Estado_Clase_ID[infIdx]) ? informes.Estado_Clase_ID[infIdx][0] : informes.Estado_Clase_ID[infIdx]) 
                : 0;

            let horaMostrar = (estadoId === 1) ? (informes.Hora[infIdx] || '--:--') : (informes.Hora_Desde[infIdx] || '--:--');
            
            let camposVisualizar = [];
            let badgeClass = "st-default";
            let textoBadge = "Informe Cargado";

            if (estadoId === 1) { 
                camposVisualizar = ["Propuesta", "Etapa", "Evidencia", "Tema_Tratado", "Notas_Pedagogicas", "Notas_Complementarias", "Coordinacion_con_DA"];
                badgeClass = "st-dictada";
                if (informes.Plataforma && informes.Plataforma[infIdx]) {
                    let plat = informes.Plataforma[infIdx];
                    textoBadge = `Dictada - ${Array.isArray(plat) ? plat[1] : plat}`;
                }
            } else if ([4, 5, 6, 7].includes(estadoId)) { 
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
            contenedor.insertAdjacentHTML("beforeend", html);
        });
    } catch (e) { console.error("Error al cargar historial:", e); }
}

/**
 * GESTIÓN DEL CALENDARIO (FullCalendar)
 */
function initCalendar() {
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
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
    eventClick: (info) => { if (info.event.extendedProps.fullRecord) renderDetail(info.event.extendedProps.fullRecord); },
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
        start: new Date(typeof data.Fecha[i] === 'number' ? data.Fecha[i] * 1000 : data.Fecha[i]).toISOString().split('T')[0],
        display: 'background', color: '#c0ebda'
      }));
      refrescarCalendario();
    }
  } catch (e) { console.warn("Tabla Calendario no encontrada."); }
}

function refrescarCalendario() { 
    calendar.removeAllEvents(); 
    calendar.addEventSource(eventosClases); 
    calendar.addEventSource(eventosFeriados); 
}

/**
 * CARGA DE DATOS DESDE GRIST (Tablas de soporte)
 */
async function cargarEstados() {
  const estados = await grist.docApi.fetchTable('Estados_Clase');
  const sel = document.getElementById('estadoSelect');
  sel.innerHTML = '<option value="">Seleccione estado...</option>';
  [1, 6, 4, 5, 7].forEach(id => {
    const idx = estados.id.indexOf(id);
    if(idx !== -1) sel.innerHTML += `<option value="${id}">${estados.Estado[idx]}</option>`;
  });
}

async function cargarDesplegables() {
  const tabla = await grist.docApi.fetchTable('Desplegables');
  if (tabla.Etapa) opcionesManuales.Etapa = tabla.Etapa.filter(e => e);
  if (tabla.Propuesta) opcionesManuales.Propuesta = tabla.Propuesta.filter(p => p);
  if (tabla.Vias_de_comunicacion) opcionesManuales.Via_de_Comunicacion = tabla.Vias_de_comunicacion.filter(v => v);
  motivosPorEstado["4"] = tabla.Cancelada_por_el_DR.filter(m => m);
  motivosPorEstado["5"] = tabla.Cancelada_CON_anticipacion.filter(m => m);
  motivosPorEstado["6"] = tabla.Cancelada_SIN_anticipacion.filter(m => m);
  motivosPorEstado["7"] = tabla.Cancelada_por_Factores_Externos.filter(m => m);
}

/**
 * RENDERIZADO DE DETALLES Y VALIDACIONES
 */
async function renderDetail(record) {
  if (!record) return;
  recordClase = record;
  document.getElementById('actionsArea').style.display = 'flex';
  
  const informes = await grist.docApi.fetchTable('Informe');
  const idx = informes.ID_Clase ? informes.ID_Clase.indexOf(record.id) : -1;
  if (idx !== -1) {
    informeExistente = {};
    Object.keys(informes).forEach(key => { informeExistente[key] = informes[key][idx]; });
    document.getElementById('txtBtnInforme').textContent = "Ver/Editar Informe";
    document.getElementById('btnAbrirInforme').classList.add('btn-edit');
  } else {
    informeExistente = null;
    document.getElementById('txtBtnInforme').textContent = "Informar Clase";
    document.getElementById('btnAbrirInforme').classList.remove('btn-edit');
  }

  idGrupoRec = Array.isArray(record.ID_Grupo_Grupo) ? record.ID_Grupo_Grupo[0] : record.ID_Grupo_Grupo;

  let leyendaRecuperacion = "";
  const esCancelada = [4, 5, 6, 7].includes(Number(record.Estado_Clase_ID));
  if (record.Tipo_de_Clase === "Recuperación") {
    leyendaRecuperacion = `<span class="val-rec-info"><i class="fa-solid fa-link"></i> ${record.Recuperacion || ''}</span>`;
  } else if (esCancelada) {
    leyendaRecuperacion = `<span class="val-rec-info"><i class="fa-solid fa-clock-rotate-left"></i> ${record.Recuperacion || 'Aun no recuperada'}</span>`;
  }

  document.getElementById('detailContent').innerHTML = `
    <div class="class-detail-card" style="--state-color: ${getColorEstado(record.Estado_Clase_ID)}">
      <div class="data-group">
        <span class="label">Grupo</span>
        <div class="val">
          <i class="fa fa-graduation-cap"></i> ${record.ID_Grupo_display || record.ID_Grupo}
          <i class="fa-solid fa-eye btn-ojo" title="Ver Historial" onclick="abrirHistorial()"></i>
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

  document.getElementById('lblGrupo').textContent = record.ID_Grupo_display || record.ID_Grupo;
  document.getElementById('txtCanceladas').textContent = record.Clases_Canceladas || 0;
  document.getElementById('txtRecuperadas').textContent = record.Clases_Recuperadas || 0;

  let tempD = new Date(typeof record.Clase === 'number' ? record.Clase * 1000 : record.Clase);
  let dClase = new Date(tempD.getUTCFullYear(), tempD.getUTCMonth(), tempD.getUTCDate());
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  esFechaFutura = dClase.getTime() > hoy.getTime();
  validarRecuperacion();
}

/**
 * LÓGICA DE RECUPERACIÓN DE CLASES
 */
function validarRecuperacion() {
  if (!recordClase) return;
  const can = recordClase.Clases_Canceladas || 0, rec = recordClase.Clases_Recuperadas || 0;
  const esCancelada = [4, 5, 6, 7].includes(Number(recordClase.Estado_Clase_ID));
  const tieneCupo = can > 0 && rec < can;
  const yaRecuperada = esCancelada && recordClase.Recuperacion && recordClase.Recuperacion.includes("a recuperar");
  
  let msg = "", err = false;
  if (Number(recordClase.Estado_Clase_ID) === 1) { msg = 'No se pueden recuperar clases dictadas.'; err = true; }
  else if (!esCancelada) { msg = 'Solo se pueden recuperar clases canceladas.'; err = true; }
  else if (yaRecuperada) { msg = 'Esta clase ya fue recuperada.'; err = true; }
  else if (!tieneCupo) { msg = 'No hay clases a recuperar.'; err = true; }

  const div = document.getElementById('errorCupo');
  div.style.display = err ? 'block' : 'none'; div.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
  document.getElementById('nuevaFecha').disabled = err;
  document.getElementById('btnGenerar').disabled = err || !document.getElementById('nuevaFecha').value;
}

document.getElementById('nuevaFecha').addEventListener('input', validarRecuperacion);

document.getElementById('btnGenerar').onclick = async () => {
  try {
    const btn = document.getElementById('btnGenerar');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
    const raw = document.getElementById('nuevaFecha').value.split('T');
    const ts = Math.floor(new Date(raw[0] + "T12:00:00").getTime() / 1000);
    const fOrig = new Date(typeof recordClase.Clase === 'number' ? recordClase.Clase * 1000 : recordClase.Clase).toLocaleDateString('es-ES');
    const fNueva = new Date(ts * 1000).toLocaleDateString('es-ES');

    await grist.docApi.applyUserActions([
      ["AddRecord", "Agenda", null, { ID_Grupo: idGrupoRec, Clase: ts, Hora_Desde: raw[1], Tipo_de_Clase: "Recuperación", Recuperacion: `Clase original ${fOrig}` }],
      ["UpdateRecord", "Agenda", recordClase.id, { Recuperacion: `Clase a recuperar el ${fNueva}` }]
    ]);
    cerrarModal('modalRecuperacion');
    document.getElementById('nuevaFecha').value = "";
    btn.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> Generar Clase';
    if(recordClase) renderDetail(recordClase);
  } catch (e) { alert("Error: " + e.message); btn.disabled = false; btn.innerHTML = 'Generar Clase'; }
};

/**
 * FORMULARIO DE INFORME (DINÁMICO)
 */
function prepararModalInforme() {
  const sel = document.getElementById('estadoSelect');
  const btn = document.getElementById('btnEnviar');
  const estaBloqueado = informeExistente && informeExistente.Estado_Edicion === "BLOQUEADO";
  document.getElementById('lockedWarning').style.display = estaBloqueado ? 'block' : 'none';
  btn.style.display = estaBloqueado ? 'none' : 'flex';

  document.getElementById('claseInfoPanel').style.display = 'grid';
  document.getElementById('infoGrupo').innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${recordClase?.ID_Grupo_display || recordClase?.ID_Grupo || '---'}`;
  document.getElementById('infoFecha').innerHTML = `<i class="fa-regular fa-calendar"></i> ${formatDate(recordClase?.Clase)}`;
  document.getElementById('infoHora').innerHTML = `<i class="fa-regular fa-clock"></i> ${recordClase?.Hora_Desde || '--:--'} hs`;

  if (informeExistente) {
    sel.value = informeExistente.Estado;
    sel.dispatchEvent(new Event('change'));

    setTimeout(() => {
      (configForm[sel.value] || []).forEach(c => {
        const el = document.getElementById(c.id); if(!el) return;
        let v = informeExistente[c.id]; if(Array.isArray(v)) v = v[1];

        if(c.type === 'time' && v) {
          document.getElementById(c.id+'_h').value = v.split(':')[0];
          document.getElementById(c.id+'_m').value = v.split(':')[1];
        } else if (c.type === 'date' && v) {
          el.value = new Date(v * 1000).toISOString().split('T')[0];
        } else { el.value = v || ''; }
        el.disabled = estaBloqueado;
      });
      actualizarVisibilidad();
    }, 50);
  } else { sel.value = ""; document.getElementById('dynamicForm').innerHTML = ''; }
  sel.disabled = estaBloqueado;
}

document.getElementById('estadoSelect').onchange = function() {
  const container = document.getElementById('dynamicForm');
  container.innerHTML = '';
  const val = this.value;
  (configForm[val] || []).forEach(c => {
    const group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = `<label>${c.label}${c.required?' <span class="req">*</span>':''}</label>`;
    
    if (c.id === 'Evidencia' || c.id === 'Evidencia_Coordinacion') {
      const h = document.createElement('div'); h.className = 'helper-text';
      h.innerHTML = `Subir <b>el archivo</b> a <a href="${recordClase?.Carpeta_Drive || '#'}" target="_blank"><i class="fa-solid fa-folder-open"></i> Drive</a> y pegar el link del <b>archivo</b> (no de la carpeta):`;
      group.appendChild(h);
    }
    
    let input;
    if (c.type === 'select') {
      input = document.createElement('select');
      let opts = (c.id === 'Motivo') ? motivosPorEstado[val] : opcionesManuales[c.id];
      input.innerHTML = `<option value="">Seleccione...</option>` + opts.map(o => `<option value="${o}">${o}</option>`).join('');
    } else if (c.type === 'time') {
      const cont = document.createElement('div'); cont.style.display = 'flex'; cont.style.gap = '5px';
      cont.innerHTML = `<input type="number" id="${c.id}_h" style="width:60px" placeholder="HH" min="0" max="23">:<input type="number" id="${c.id}_m" style="width:60px" placeholder="MM" min="0" max="59">`;
      input = document.createElement('input'); input.type = 'hidden'; group.appendChild(cont);
    } else { 
        input = document.createElement(c.type === 'textarea' ? 'textarea' : 'input'); 
        if(c.type !== 'textarea') input.type = c.type; 
    }
    input.id = c.id; input.addEventListener('input', actualizarVisibilidad);
    group.appendChild(input); container.appendChild(group);
  });
  actualizarVisibilidad();
};

function actualizarVisibilidad() {
  const st = document.getElementById('estadoSelect').value;
  (configForm[st] || []).forEach(c => {
    const el = document.getElementById(c.id); if (!el) return;
    const row = el.closest('.form-group');
    let vis = true;
    if (c.dependsList) vis = document.getElementById(c.dependsOn) && c.dependsList.includes(document.getElementById(c.dependsOn).value);
    else if (c.soloEnEstados) vis = c.soloEnEstados.includes(st);
    else if (c.dependsOn) vis = document.getElementById(c.dependsOn) && document.getElementById(c.dependsOn).value === c.dependsVal;
    row.classList.toggle('hidden', !vis);
  });
  validarBoton();
}

/**
 * VALIDACIÓN DE REQUISITOS (Incluye validación de links de Drive)
 */
function validarBoton() {
  const st = document.getElementById('estadoSelect').value;
  const esProhibido = (st === "1" && esFechaFutura && !informeExistente);
  document.getElementById('futureWarning').style.display = esProhibido ? 'block' : 'none';
  const estaBloqueado = informeExistente && informeExistente.Estado_Edicion === "BLOQUEADO";

  if (!st || esProhibido || estaBloqueado) { 
    document.getElementById('btnEnviar').disabled = true; 
    return;
  }

  let ok = true;
  const prefixDrive = "https://drive.google.com/file";

  (configForm[st] || []).forEach(c => {
    const el = document.getElementById(c.id), row = el?.closest('.form-group');
    if (row && !row.classList.contains('hidden')) {
      if (c.required) {
        if (c.type === 'time') { 
          if (!document.getElementById(c.id+'_h').value || !document.getElementById(c.id+'_m').value) ok = false; 
        }
        else if (!el.value || !el.value.trim()) ok = false;
      }
      if ((c.id === 'Evidencia' || c.id === 'Evidencia_Coordinacion') && el.value.trim() !== "") {
        if (!el.value.startsWith(prefixDrive)) {
          ok = false;
          el.style.border = "2px solid #ef4444";
        } else { el.style.border = "1px solid #e2e8f0"; }
      }
    }
  });
  document.getElementById('btnEnviar').disabled = !ok;
}

/**
 * ENVÍO DE DATOS A GRIST
 */
async function enviarInforme() {
  try {
    const btn = document.getElementById('btnEnviar');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    const st = document.getElementById('estadoSelect').value, data = { ID_Clase: recordClase.id, Estado: parseInt(st) };
    configForm[st].forEach(c => {
      const el = document.getElementById(c.id);
      if (el && !el.closest('.form-group').classList.contains('hidden')) {
        if (c.type === 'time') data[c.id] = `${document.getElementById(c.id+'_h').value.padStart(2,'0')}:${document.getElementById(c.id+'_m').value.padStart(2,'0')}`;
        else data[c.id] = el.value;
      }
    });
    if (informeExistente?.id) await grist.docApi.applyUserActions([["UpdateRecord", "Informe", informeExistente.id, data]]);
    else await grist.docApi.applyUserActions([["AddRecord", "Informe", null, data]]);
    cerrarModal('modalInforme');
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Enviar Informe';
    if(recordClase) renderDetail(recordClase);
  } catch (e) { alert("Error: " + e.message); btn.disabled = false; btn.innerHTML = 'Enviar Informe'; }
}

/**
 * FORMATEADORES
 */
function getColorEstado(id) { return id == 1 ? '#16B378' : ([2,4,5,6,7].includes(Number(id)) ? '#ef4444' : '#94a3b8'); }
function formatDate(v) { 
  const d = new Date(typeof v === 'number' ? v * 1000 : v);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'}); 
}

/**
 * INTEGRACIÓN CON GRIST
 */
grist.onRecords((records) => {
  eventosClases = records.filter(r => r.Tipo_Dia === "Hábil").map(r => {
    const d = new Date(typeof r.Clase === 'number' ? r.Clase * 1000 : r.Clase);
    let s = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (r.Hora_Desde) { 
      const p = r.Hora_Desde.split(':'); 
      s.setHours(parseInt(p[0]), parseInt(p[1]), 0); 
    } else { s.setHours(12, 0, 0); }

    return { 
      id: r.id, 
      title: r.ID_Grupo_display || r.ID_Grupo, 
      start: s, 
      end: new Date(s.getTime() + (45 * 60000)),
      extendedProps: { 
        dotColor: getColorEstado(r.Estado_Clase_ID), 
        fullRecord: r, 
        isRecuperada: r.Recuperacion && r.Recuperacion.includes("a recuperar") 
      } 
    };
  });
  refrescarCalendario();
});

grist.onRecord(r => { if(r?.id) renderDetail(r); });
document.addEventListener('DOMContentLoaded', inicializar);
grist.ready({ requiredAccess: 'full' });