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

const opcionesManuales = { 
    'Plataforma': ['Jabber', 'Webex', 'Meet/Zoom', 'Conferences'], 
    'Propuesta': [], 
    'Via_de_Comunicacion': [], 
    'Etapa': [] 
};
let motivosPorEstado = { "4": [], "5": [], "6": [], "7": [] };

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
  await cargarDesplegables();
  await cargarEstados();
  await cargarCalendarioFeriados();
  
  // ⚠️ CORRECCIÓN: Vincular eventos después de que el DOM esté listo
  const btnInforme = document.getElementById('btnAbrirInforme');
  if (btnInforme) {
    btnInforme.onclick = async () => { 
      await prepararModalInforme(); 
      document.getElementById('modalInforme').style.display = 'flex'; 
    };
  }
  
  const btnRecup = document.getElementById('btnAbrirRecuperacion');
  if (btnRecup) {
    btnRecup.onclick = () => { 
      document.getElementById('modalRecuperacion').style.display = 'flex'; 
    };
  }
  
  const btnEnviar = document.getElementById('btnEnviar');
  if (btnEnviar) {
    btnEnviar.onclick = enviarInforme;
  }
  
  // ⚠️ CORRECCIÓN CRÍTICA: Vincular el onchange del estadoSelect aquí, no en prepararModalInforme
  const estadoSelect = document.getElementById('estadoSelect');
  if (estadoSelect) {
    estadoSelect.onchange = function() {
      generarCamposDinamicos(this.value);
    };
  }
  
  // Listener para el input de recuperación
  const inputNuevaFecha = document.getElementById('nuevaFecha');
  if (inputNuevaFecha) {
    inputNuevaFecha.addEventListener('input', validarRecuperacion);
  }
  
  const btnGenerar = document.getElementById('btnGenerar');
  if (btnGenerar) {
    btnGenerar.onclick = generarClaseRecuperada;
  }
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
 */
async function abrirHistorial() {
    console.log('👁️ abrirHistorial() - INICIO');
    console.log('📦 recordClase:', recordClase);
    
    if (!recordClase) {
        console.error('❌ recordClase es null');
        return;
    }
    
    const grupoId = recordClase.ID_Grupo_Grupo || recordClase.ID_Grupo || recordClase.id;
    console.log('🔍 grupoId a buscar:', grupoId);
    
    document.getElementById("grupoHistorialLabel").textContent = recordClase.ID_Grupo_display || recordClase.ID_Grupo || "Grupo " + grupoId;
    document.getElementById('modalHistorial').style.display = 'flex';
    
    try {
        console.log('📡 Intentando fetchTable("Informe")...');
        const informes = await grist.docApi.fetchTable("Informe");
        
        console.log('✅ Tabla Informe cargada');
        console.log('📊 Columnas disponibles:', Object.keys(informes));
        console.log('📊 Cantidad de registros:', informes.id ? informes.id.length : 0);
        
        if (informes.ID_Grupo) {
            console.log('📊 Primeros 3 ID_Grupo:', informes.ID_Grupo.slice(0, 3));
        }
        
        const contenedor = document.getElementById("historialContenido");
        contenedor.innerHTML = "";
        
        let indicesInformes = [];
        if (informes.ID_Grupo) {
            informes.ID_Grupo.forEach((g, i) => {
                const currentG = Array.isArray(g) ? g[0] : g;
                if (currentG === grupoId) indicesInformes.push(i);
            });
        }
        
        console.log(`🔍 Encontrados ${indicesInformes.length} informes para este grupo`);
        console.log('📋 Indices:', indicesInformes);
        
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
        
        indicesInformes.forEach(infIdx => {
            // ... (mantené todo el código de renderizado existente)
            const fechaClase = informes.Clase[infIdx];
            const tipoClase = informes.Tipo_de_Clase[infIdx] || 'Clase';
            const drNombre = Array.isArray(informes.DR_a_cargo_Apellido_y_Nombre[infIdx])
                ? informes.DR_a_cargo_Apellido_y_Nombre[infIdx][1]
                : informes.DR_a_cargo_Apellido_y_Nombre[infIdx];
            const estadoId = informes.Estado_Clase_ID
                ? Number(Array.isArray(informes.Estado_Clase_ID[infIdx]) ? informes.Estado_Clase_ID[infIdx][0] : informes.Estado_Clase_ID[infIdx])
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
        
    } catch (e) {
        console.error('💥 ERROR en abrirHistorial:', e);
        console.error('Stack:', e.stack);
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
    if (calendar) {
      calendar.removeAllEvents(); 
      calendar.addEventSource(eventosClases); 
      calendar.addEventSource(eventosFeriados); 
    }
}

/**
 * CARGA DE DATOS DESDE GRIST
 */
async function cargarEstados() {
  const estados = await grist.docApi.fetchTable('Estados_Clase');
  const sel = document.getElementById('estadoSelect');
  if (!sel) return;
  
  sel.innerHTML = '<option value="">Seleccione estado...</option>';
  [1, 6, 4, 5, 7].forEach(id => {
    const idx = estados.id?.indexOf(id);
    if(idx !== -1 && estados.Estado?.[idx]) {
      sel.innerHTML += `<option value="${id}">${estados.Estado[idx]}</option>`;
    }
  });
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
  
  try {
    const informes = await grist.docApi.fetchTable('Informe');
    const idx = informes.ID_Clase ? informes.ID_Clase.indexOf(record.id) : -1;
    
    const btnInforme = document.getElementById('btnAbrirInforme');
    const txtBtn = document.getElementById('txtBtnInforme');
    
    if (idx !== -1 && informes.Estado) {
      informeExistente = {};
      Object.keys(informes).forEach(key => { 
        informeExistente[key] = informes[key]?.[idx]; 
      });
      if (txtBtn) txtBtn.textContent = "Ver/Editar Informe";
      if (btnInforme) btnInforme.classList.add('btn-edit');
    } else {
      informeExistente = null;
      if (txtBtn) txtBtn.textContent = "Informar Clase";
      if (btnInforme) btnInforme.classList.remove('btn-edit');
    }
  } catch(e) { console.warn("Error verificando informe existente:", e); }

  idGrupoRec = Array.isArray(record.ID_Grupo_Grupo) ? record.ID_Grupo_Grupo[0] : record.ID_Grupo_Grupo;

  let leyendaRecuperacion = "";
  const esCancelada = [4, 5, 6, 7].includes(Number(record.Estado_Clase_ID));
  if (record.Tipo_de_Clase === "Recuperación") {
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
  }

  // Actualizar stats de recuperación
  const lblGrupo = document.getElementById('lblGrupo');
  if (lblGrupo) lblGrupo.textContent = record.ID_Grupo_display || record.ID_Grupo;
  
  const txtCanceladas = document.getElementById('txtCanceladas');
  if (txtCanceladas) txtCanceladas.textContent = record.Clases_Canceladas || 0;
  
  const txtRecuperadas = document.getElementById('txtRecuperadas');
  if (txtRecuperadas) txtRecuperadas.textContent = record.Clases_Recuperadas || 0;

  // Calcular si es fecha futura
  let tempD = new Date(typeof record.Clase === 'number' ? record.Clase * 1000 : record.Clase);
  let dClase = new Date(tempD.getUTCFullYear(), tempD.getUTCMonth(), tempD.getUTCDate());
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  esFechaFutura = dClase.getTime() > hoy.getTime();
  validarRecuperacion();
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
  const esCancelada = [4, 5, 6, 7].includes(Number(recordClase.Estado_Clase_ID));
  const tieneCupo = can > 0 && rec < can;
  const yaRecuperada = esCancelada && recordClase.Recuperacion && recordClase.Recuperacion.includes("a recuperar");
  
  let msg = "", err = false;
  if (Number(recordClase.Estado_Clase_ID) === 1) { msg = 'No se pueden recuperar clases dictadas.'; err = true; }
  else if (!esCancelada) { msg = 'Solo se pueden recuperar clases canceladas.'; err = true; }
  else if (yaRecuperada) { msg = 'Esta clase ya fue recuperada.'; err = true; }
  else if (!tieneCupo) { msg = 'No hay clases a recuperar.'; err = true; }
  
  // Restricción de mismo día
  if (!err && inputFecha.value) {
    const fechaSeleccionada = new Date(inputFecha.value);
    const fechaOriginal = new Date(typeof recordClase.Clase === 'number' ? recordClase.Clase * 1000 : recordClase.Clase);
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
    const fOrig = new Date(typeof recordClase.Clase === 'number' ? recordClase.Clase * 1000 : recordClase.Clase).toLocaleDateString('es-ES');
    const fNueva = new Date(ts * 1000).toLocaleDateString('es-ES');

    await grist.docApi.applyUserActions([
      [ "AddRecord", "Agenda", null, { 
          ID_Grupo: idGrupoRec, 
          Clase: ts, 
          Hora_Desde: raw[1], 
          Tipo_de_Clase: "Recuperación", 
          Recuperacion: `Clase original ${fOrig}`,
          Estado_Clase_Original_ID: Number(recordClase.Estado_Clase_ID)
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

  // Verificar restricciones semanales
  let yaExisteCancelacionSemanal = false;
  try {
    const agenda = await grist.docApi.fetchTable('Agenda');
    const grupoIdActual = recordClase.ID_Grupo_Grupo || recordClase.ID_Grupo;
    const semanaActual = recordClase.Clase_Semana;
    
    yaExisteCancelacionSemanal = agenda.id?.some((id, i) => {
        const mismoGrupo = (Array.isArray(agenda.ID_Grupo?.[i]) ? agenda.ID_Grupo[i][0] : agenda.ID_Grupo?.[i]) === (Array.isArray(grupoIdActual) ? grupoIdActual[0] : grupoIdActual);
        const mismaSemana = agenda.Clase_Semana?.[i] === semanaActual;
        const esEstadoRestringido = [6, 7].includes(Number(agenda.Estado_Clase_ID?.[i]));
        return id !== recordClase.id && mismoGrupo && mismaSemana && esEstadoRestringido;
    });
  } catch(e) { console.warn("Error verificando restricciones:", e); }

  // Si hay informe existente, cargar valores
  if (informeExistente && informeExistente.Estado) {
    sel.value = informeExistente.Estado;
    
    // ⚠️ CORRECCIÓN: Generar campos PRIMERO, luego poblar valores
    generarCamposDinamicos(sel.value);
    
    setTimeout(() => {
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
          el.value = new Date(v * 1000).toISOString().split('T')[0];
        } else { 
          el.value = v || ''; 
        }
        if (estaBloqueado) el.disabled = true;
      });
      actualizarVisibilidad();
      validarBoton();
    }, 100);
  } else { 
    sel.value = ""; 
    const dynamicForm = document.getElementById('dynamicForm');
    if (dynamicForm) dynamicForm.innerHTML = ''; 
  }
  
  sel.disabled = estaBloqueado;

  // Aplicar restricciones en las opciones del select
  const esRecuperada = recordClase?.Tipo_de_Clase === "Recuperación";
  const estadoOriginal = recordClase?.Estado_Clase_Original_ID || recordClase?.Estado_Clase_ID; 
  const aplicaRestriccionRecup = esRecuperada && [6, 7].includes(Number(estadoOriginal));

  for (let i = 0; i < sel.options.length; i++) {
      const opt = sel.options[i];
      const val = Number(opt.value);
      
      // Limpiar etiquetas previas
      opt.text = opt.text.replace(' (No permitido)', '').replace(' (Límite semanal)', '').replace(' (No disponible en feriado)', '');

      const esFeriado = recordClase?.Tipo_Dia === 'Feriado';
      const esEstadoRestringido = [6, 7].includes(val);
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
  const esRec = recordClase?.Tipo_de_Clase === "Recuperación";
  const estOrig = recordClase?.Estado_Clase_Original_ID || recordClase?.Estado_Clase_ID;
  const estadoSeleccionado = Number(st);

  if (esRec && [6, 7].includes(Number(estOrig)) && [6, 7].includes(estadoSeleccionado)) {
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
  const prefixDrive = "https://drive.google.com/file";

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
        if (!el.value.startsWith(prefixDrive)) {
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
    const data = { ID_Clase: recordClase.id, Estado: parseInt(st) };
    
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
    
    if (informeExistente?.id) {
      await grist.docApi.applyUserActions([["UpdateRecord", "Informe", informeExistente.id, data]]);
    } else {
      await grist.docApi.applyUserActions([["AddRecord", "Informe", null, data]]);
    }
    
    cerrarModal('modalInforme');
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Enviar Informe';
    if(recordClase) renderDetail(recordClase);
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
  return id == 1 ? '#16B378' : ([2,4,5,6,7].includes(Number(id)) ? '#ef4444' : '#94a3b8'); 
}

function formatDate(v) { 
  if (!v) return '---';
  const d = new Date(typeof v === 'number' ? v * 1000 : v);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'}); 
}

/**
 * INTEGRACIÓN CON GRIST
 */
if (typeof grist !== 'undefined') {
  grist.onRecords((records) => {
    eventosClases = records.filter(r => r.Tipo_Dia === "Hábil" || r.Tipo_Dia === "Feriado").map(r => {
      const d = new Date(typeof r.Clase === 'number' ? r.Clase * 1000 : r.Clase);
      let s = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      
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
} else {
  // Fallback para desarrollo sin Grist
  document.addEventListener('DOMContentLoaded', () => {
    console.warn("Grist no detectado - modo desarrollo");
    inicializar();
  });
}
