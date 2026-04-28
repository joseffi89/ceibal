let allRecords = [];

// Variables para los gráficos
const chartInstances = {};
let currentGroupsArray = []; // Para acceder rápidamente a los grupos desde la tabla
let currentModalIdGrupo = null; // Para saber qué grupo está cargado en el modal actualmente

// Plugin para dibujar el texto centrado en la dona
Chart.register({
    id: 'centerText',
    afterDraw: function (chart) {
        if (chart.config.type === 'doughnut' && chart.options.plugins.centerText) {
            const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
            const options = chart.options.plugins.centerText;
            ctx.save();

            const centerX = left + width / 2;
            const centerY = top + height / 2;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Número (Total)
            const fontSize = options.fontSize || 36;
            ctx.font = `bold ${fontSize}px Inter`;
            ctx.fillStyle = '#0f172a';
            ctx.fillText(options.text, centerX, centerY - (fontSize * 0.1));

            // Subtexto (Etiqueta)
            const subFontSize = options.subFontSize || 12;
            ctx.font = `600 ${subFontSize}px Inter`;
            ctx.fillStyle = '#64748b';
            ctx.fillText(options.subtext, centerX, centerY + (fontSize * 0.6));

            ctx.restore();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar widget de Grist
    grist.ready({
        requiredAccess: 'full'
    });

    grist.onRecords(updateData);

    // Listeners de los filtros
    document.getElementById('filter-id-grupo').addEventListener('input', renderTable);
    document.getElementById('filter-estado-grupo').addEventListener('change', renderTable);

    document.getElementById('btn-reset').addEventListener('click', () => {
        document.getElementById('filter-id-grupo').value = '';
        document.getElementById('filter-estado-grupo').value = '';
        renderTable();
    });

    // Lógica de Pestañas
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remover activo de todos
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

            // Activar actual
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Lógica de Pestañas del Modal
    const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
    modalTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-modal-target');
            switchModalTab(targetId);

            // Si hay un grupo seleccionado en el modal, refrescamos la vista a la que se cambió
            if (currentModalIdGrupo) {
                const grupo = currentGroupsArray.find(g => g.idGrupo === currentModalIdGrupo);
                if (grupo) {
                    if (targetId === 'modal-view-charts') renderCharts(grupo.clases, 'modalChart');
                    if (targetId === 'modal-view-history') renderHistory(grupo.clases);
                }
            }
        });
    });

    document.getElementById('btnCloseModal').addEventListener('click', () => {
        document.getElementById('modalGroupDetail').style.display = 'none';
        currentModalIdGrupo = null;
    });

    // Listener para guardar comentario
    document.getElementById('btnSaveComment').addEventListener('click', saveComment);
});

function switchModalTab(targetId) {
    const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
    modalTabBtns.forEach(btn => {
        if (btn.getAttribute('data-modal-target') === targetId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    document.querySelectorAll('.modal-view-section').forEach(s => {
        if (s.id === targetId) {
            s.style.display = 'block';
            s.classList.add('active');
        } else {
            s.style.display = 'none';
            s.classList.remove('active');
        }
    });

    // Si entramos a la pestaña de comentarios, cargamos el contenido
    if (targetId === 'modal-view-comments' && currentModalIdGrupo) {
        const grupo = currentGroupsArray.find(g => g.idGrupo === currentModalIdGrupo);
        if (grupo) renderComments(grupo.idGrupo, grupo.refId);
    }
}

function updateData(records) {
    // Grist puede enviar los registros con la estructura { id, fields: {...} } si no se mapean columnas explícitamente
    allRecords = (records || [])
        .map(r => r.fields ? { id: r.id, ...r.fields } : r)
        .filter(r => {
            const estadoClase = (r.Estado_Clase || '').toString().trim();
            const estadoGrupo = (r.Estado_Grupo || '').toString().toLowerCase().trim();
            return estadoClase !== '' && estadoGrupo !== 'dado de baja';
        });

    renderTable();
    renderCharts(allRecords);
}

function processGroupStatus(clases) {
    // Ordenar clases por fecha si está disponible
    if (clases.some(c => c.Clase)) {
        clases.sort((a, b) => new Date(a.Clase || 0).getTime() - new Date(b.Clase || 0).getTime());
    }

    let originales = 0;
    let dictadas = 0;

    clases.forEach(c => {
        const estado = (c.Estado_Clase || '').toString().toLowerCase().trim();
        const tipoClase = (c.Tipo_de_Clase || '').toString().toLowerCase().trim();
        const isOriginal = tipoClase === 'original';
        const isRecuperacion = tipoClase.includes('recuperaci') || tipoClase.includes('recuperada');

        if (isOriginal) originales++;
        if (estado === 'dictada' && (isOriginal || isRecuperacion)) dictadas++;
    });

    const percent = originales > 0 ? (dictadas / originales) * 100 : 0;

    const lastClass = clases[clases.length - 1];
    const lastClassEstado = lastClass ? (lastClass.Estado_Clase || '').toString().toLowerCase().trim() : '';

    const last3 = clases.slice(-3);
    const last3AllNotDictadas = last3.length > 0 && last3.every(c => (c.Estado_Clase || '').toString().toLowerCase().trim() !== 'dictada');

    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    const hasDictada3Weeks = clases.some(c => {
        if ((c.Estado_Clase || '').toString().toLowerCase().trim() !== 'dictada') return false;
        if (c.Clase) return new Date(c.Clase) >= threeWeeksAgo;
        return last3.includes(c);
    });

    let status = 'Ok';
    let badgeClass = 'badge-success';
    let rowClass = 'row-ok';
    let priority = 4;

    if (percent < 60) {
        if (lastClassEstado !== 'dictada') {
            status = 'Grupo Crítico';
            badgeClass = 'badge-danger';
            rowClass = 'row-critical';
            priority = 1;
        } else {
            status = 'Grupo en Recuperación';
            badgeClass = 'badge-warning';
            rowClass = 'row-recovery';
            priority = 2;
        }
    } else {
        if (last3AllNotDictadas) {
            status = 'Grupo en Alerta';
            badgeClass = 'badge-orange';
            rowClass = 'row-alert';
            priority = 3;
        } else if (hasDictada3Weeks) {
            status = 'Grupo Ok';
            badgeClass = 'badge-success';
            rowClass = 'row-ok';
            priority = 4;
        } else {
            status = 'Grupo Ok';
            badgeClass = 'badge-success';
            rowClass = 'row-ok';
            priority = 4;
        }
    }

    return { percent, dictadas, originales, status, badgeClass, rowClass, priority, clases };
}

function renderTable() {
    const searchFilter = document.getElementById('filter-id-grupo').value.toLowerCase();
    const estadoFilter = document.getElementById('filter-estado-grupo').value;

    // 1. Agrupar por ID_Grupo primero
    const gruposMap = {};
    allRecords.forEach(r => {
        let label = "";
        let refId = null;

        // Intentar extraer ID si es referencia (formato [id, label])
        if (Array.isArray(r.ID_Grupo)) {
            refId = r.ID_Grupo[0];
            label = r.ID_Grupo[1];
        } else if (r.ID_Grupo_Grupo) {
            // A veces Grist envía el ID en una columna oculta o mapeada como _Grupo
            refId = r.ID_Grupo_Grupo;
            label = r.ID_Grupo;
        } else if (typeof r.ID_Grupo === 'number') {
            // Si ID_Grupo es directamente un número, podría ser el ID
            refId = r.ID_Grupo;
            label = r.ID_Grupo.toString();
        } else {
            label = (r.ID_Grupo || `${r.Departamento || ''}-${r.No_Escuela || ''}-${r.Grupo || ''}`).toString();
        }

        if (!gruposMap[label]) {
            gruposMap[label] = {
                idGrupo: label,
                refId: refId,
                docente: r.DR_a_cargo_Apellido_y_Nombre || '-',
                mentor: r.Mentor_a || '-',
                responsable: r.Resp_Gestion || '-',
                clases: []
            };
        }
        gruposMap[label].clases.push(r);
    });

    // 2. Procesar status y prioridades
    let gruposArray = Object.values(gruposMap).map(g => {
        const statusData = processGroupStatus(g.clases);
        return { ...g, ...statusData };
    });

    // 2.5 KPIs Globales de Salud (Fijos, no se filtran)
    const globalStatusCounts = {
        critico: gruposArray.filter(g => g.priority === 1).length,
        recuperacion: gruposArray.filter(g => g.priority === 2).length,
        alerta: gruposArray.filter(g => g.priority === 3).length
    };

    animateValue('kpi-grupos-criticos', globalStatusCounts.critico);
    animateValue('kpi-grupos-recuperacion', globalStatusCounts.recuperacion);
    animateValue('kpi-grupos-alerta', globalStatusCounts.alerta);

    // 3. Filtrar para la tabla y KPIs de rendimiento (estos sí se filtran)
    if (searchFilter) {
        gruposArray = gruposArray.filter(g => g.idGrupo.toLowerCase().includes(searchFilter));
    }
    if (estadoFilter) {
        gruposArray = gruposArray.filter(g => g.priority.toString() === estadoFilter);
    }

    // 4. Ordenar por prioridad de estado (Rojo -> Amarillo -> Naranja -> Verde)
    // Y dentro del mismo estado, por rendimiento (menor a mayor)
    gruposArray.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return a.percent - b.percent;
    });

    // Actualizar KPIs solo con las clases de los grupos filtrados
    const filteredRecords = gruposArray.flatMap(g => g.clases);
    updateKPIs(filteredRecords);

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (gruposArray.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>No se encontraron grupos que coincidan con los filtros.</p>
                </td>
            </tr>`;
        return;
    }

    const displayGroups = gruposArray.slice(0, 500);

    displayGroups.forEach(g => {
        const tr = document.createElement('tr');
        tr.className = g.rowClass;

        tr.innerHTML = `
            <td><strong>${g.idGrupo}</strong></td>
            <td>${g.docente}</td>
            <td>${g.mentor}</td>
            <td>${g.responsable}</td>
            <td><strong>${g.percent.toFixed(0)}%</strong> <span style="font-size: 11px; color: #64748b;">(${g.dictadas}/${g.originales})</span></td>
            <td><span class="badge ${g.badgeClass}">${g.status}</span></td>
            <td>
                <div class="action-cell">
                    <button class="btn-view-charts" onclick="openGroupModal('${g.idGrupo}', 'charts')" title="Ver Analíticas">
                        <i class="fa-solid fa-chart-simple"></i> Analíticas
                    </button>
                    <button class="btn-view-history" onclick="openGroupModal('${g.idGrupo}', 'history')" title="Ver Historial">
                        <i class="fa-solid fa-clock-rotate-left"></i> Historial
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    currentGroupsArray = gruposArray;

    if (gruposArray.length > 500) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="7" style="text-align: center; color: #64748b; font-size: 13px;">Mostrando 500 de ${gruposArray.length} grupos. Utilice los filtros para refinar la búsqueda.</td>`;
        tbody.appendChild(tr);
    }
}

function updateKPIs(records) {
    const totalClases = records.length;
    let totalDictada = 0;
    let totalCanceladas = 0;
    let totalRecuperacion = 0;
    let totalOriginales = 0;
    let originalesDictadas = 0;
    let originalesCanceladas = 0;

    records.forEach(r => {
        const estado = (r.Estado_Clase || '').toString().toLowerCase().trim();
        const tipoClase = (r.Tipo_de_Clase || '').toString().toLowerCase().trim();
        const isOriginal = tipoClase === 'original';
        const isRecuperacion = tipoClase.includes('recuperaci') || tipoClase.includes('recuperada');

        if (isOriginal) {
            totalOriginales++;
            if (estado === 'dictada') originalesDictadas++;
            else originalesCanceladas++;
        }

        if (estado === 'dictada') {
            if (isOriginal || isRecuperacion) totalDictada++;
            if (isRecuperacion) totalRecuperacion++;
        } else {
            totalCanceladas++;
        }
    });

    const tasaRecuperacion = totalCanceladas > 0 ? ((totalRecuperacion / totalCanceladas) * 100).toFixed(1) : 0;
    const tasaDictadas = totalOriginales > 0 ? ((totalDictada / totalOriginales) * 100).toFixed(1) : 0;

    animateValue('kpi-total', totalClases);
    animateValue('kpi-dictadas', totalDictada);
    animateValue('kpi-canceladas', totalCanceladas);
    
    const kpiRend = document.getElementById('kpi-tasa-dictadas');
    kpiRend.textContent = `${tasaDictadas}%`;
    kpiRend.closest('.kpi-card').title = `Originales: ${totalOriginales}, Dictadas: ${originalesDictadas}, Canceladas: ${originalesCanceladas}`;
    
    const kpiRec = document.getElementById('kpi-recuperacion');
    kpiRec.textContent = `${tasaRecuperacion}%`;
    kpiRec.closest('.kpi-card').title = `Total Recuperadas: ${totalRecuperacion}`;
}

// ---------------------- LOGICA DE GRAFICOS Y MODAL ----------------------

window.openGroupModal = function (idGrupo, view = 'charts') {
    currentModalIdGrupo = idGrupo;
    const grupo = currentGroupsArray.find(g => g.idGrupo === idGrupo);
    if (!grupo) return;

    document.getElementById('modalGroupName').textContent = idGrupo;
    document.getElementById('modalGroupDetail').style.display = 'flex';

    // Al abrir el modal, decidimos qué pestaña mostrar y cargamos su contenido
    if (view === 'charts') {
        switchModalTab('modal-view-charts');
        renderCharts(grupo.clases, 'modalChart');
    } else if (view === 'history') {
        switchModalTab('modal-view-history');
        renderHistory(grupo.clases);
    } else {
        switchModalTab('modal-view-comments');
        renderComments(grupo.idGrupo, grupo.refId);
    }
};

async function renderComments(idGrupoLabel, idGrupoId) {
    const list = document.getElementById("commentsList");

    // Si no tenemos el ID de referencia, intentamos buscarlo proactivamente en la tabla Agenda
    if (!idGrupoId) {
        try {
            const agenda = await grist.docApi.fetchTable("Agenda");
            if (agenda && agenda.ID_Grupo) {
                const idx = agenda.ID_Grupo.findIndex((val, i) => {
                    const label = Array.isArray(val) ? val[1] : (val === idGrupoLabel || agenda.id[i] == idGrupoLabel);
                    return label === true || label === idGrupoLabel;
                });

                if (idx !== -1) {
                    const val = agenda.ID_Grupo[idx];
                    idGrupoId = Array.isArray(val) ? val[0] : val;
                    // Actualizamos en memoria para que el botón Guardar también lo tenga
                    const grupo = currentGroupsArray.find(g => g.idGrupo === idGrupoLabel);
                    if (grupo) grupo.refId = idGrupoId;
                }
            }
        } catch (e) {
            console.warn("No se pudo autodetectar el ID del grupo desde Agenda:", e);
        }
    }

    if (!idGrupoId) {
        list.innerHTML = `
            <div class="msg-pendiente">
                <i class="fa-solid fa-triangle-exclamation"></i><br>
                No se pudo identificar el ID de referencia para este grupo.<br>
                <span style="font-size: 10px; font-weight: normal; margin-top: 5px; display: block;">
                    Asegúrate de que la columna 'ID_Grupo' esté correctamente vinculada en la configuración del widget.
                </span>
            </div>`;
        return;
    }

    list.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando comentarios...</div>';

    try {
        const commentsData = await grist.docApi.fetchTable("Comentarios_Asignaciones");

        const comments = [];
        if (commentsData.id) {
            commentsData.id.forEach((id, i) => {
                const groupRef = commentsData.Grupo[i];
                const groupRefId = Array.isArray(groupRef) ? groupRef[0] : groupRef;

                if (groupRefId === idGrupoId) {
                    comments.push({
                        text: commentsData.Comentarios[i],
                        author: commentsData.Creado_por ? (Array.isArray(commentsData.Creado_por[i]) ? commentsData.Creado_por[i][1] : commentsData.Creado_por[i]) : 'Usuario',
                        date: commentsData.Creado_en ? commentsData.Creado_en[i] : null
                    });
                }
            });
        }

        comments.sort((a, b) => (b.date || 0) - (a.date || 0));

        if (comments.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding: 20px; color: #64748b; font-size: 13px;">No hay comentarios registrados para este grupo.</div>';
        } else {
            list.innerHTML = comments.map(c => `
                <div class="comment-card">
                    <div class="comment-header">
                        <span>${c.author}</span>
                        <span>${c.date ? formatearValor(c.date) : ''}</span>
                    </div>
                    <div class="comment-text">${c.text}</div>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = `<div class="msg-pendiente">Error al cargar comentarios: ${e.message}</div>`;
    }
}

async function saveComment() {
    const text = document.getElementById("newCommentText").value.trim();
    if (!text || !currentModalIdGrupo) return;

    const grupo = currentGroupsArray.find(g => g.idGrupo === currentModalIdGrupo);
    if (!grupo || !grupo.refId) {
        alert("No se pudo identificar el ID del grupo para guardar el comentario.");
        return;
    }

    const btn = document.getElementById("btnSaveComment");
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

    try {
        await grist.docApi.applyUserActions([
            ['AddRecord', 'Comentarios_Asignaciones', null, {
                Comentarios: text,
                Grupo: grupo.refId
            }]
        ]);

        document.getElementById("newCommentText").value = "";
        renderComments(currentModalIdGrupo, grupo.refId);
    } catch (e) {
        alert("Error al guardar el comentario: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

async function renderHistory(clases) {
    const contenedor = document.getElementById("historyContent");
    contenedor.innerHTML = `
        <div style="text-align:center; padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
            <p>Cargando informes pedagógicos...</p>
        </div>
    `;

    try {
        // Obtenemos los informes de Grist
        const informesData = await grist.docApi.fetchTable("Informe");

        // Mapeamos informes por ID_Clase para acceso rápido
        const informesMap = {};
        if (informesData.ID_Clase) {
            informesData.id.forEach((id, i) => {
                const idClase = Array.isArray(informesData.ID_Clase[i]) ? informesData.ID_Clase[i][0] : informesData.ID_Clase[i];
                informesMap[idClase] = {};
                for (let key in informesData) {
                    informesMap[idClase][key] = informesData[key][i];
                }
            });
        }

        contenedor.innerHTML = "";

        // Ordenar clases por fecha descendente
        const sortedClases = [...clases].sort((a, b) => {
            const dateA = new Date(a.Clase || 0);
            const dateB = new Date(b.Clase || 0);
            return dateB - dateA;
        });

        if (sortedClases.length === 0) {
            contenedor.innerHTML = '<div class="msg-pendiente">No hay clases registradas para este grupo.</div>';
            return;
        }

        sortedClases.forEach(c => {
            const idClase = c.id;
            const inf = informesMap[idClase];

            const estadoOriginal = c.Estado_Clase || "Pendiente";
            const estadoTexto = estadoOriginal.toLowerCase();

            let badgeClass = "st-default";
            let textoBadge = estadoOriginal;
            let camposVisualizar = [];

            // Determinar campos y estilos (basado en la lógica de historial_clases.html)
            if (estadoTexto.includes("dictada")) {
                badgeClass = "st-dictada";
                camposVisualizar = ["Propuesta", "Etapa"];
                if (inf && inf.Evidencia) camposVisualizar.push("Evidencia");
                camposVisualizar.push("Notas_Pedagogicas", "Notas_Complementarias");

                if (inf && inf.Plataforma) {
                    let plat = Array.isArray(inf.Plataforma) ? inf.Plataforma[1] : inf.Plataforma;
                    if (plat) textoBadge = `Dictada por ${plat}`;
                }
            } else if (estadoTexto.includes("cancelada")) {
                badgeClass = "st-rojo";
                if (inf && inf.Evidencia) camposVisualizar.push("Evidencia");
                camposVisualizar.push("Motivo", "Notas_Complementarias", "Coordinacion_con_DA");
            } else {
                if (inf && inf.Evidencia) camposVisualizar.push("Evidencia");
                camposVisualizar.push("Motivo", "Notas_Complementarias");
            }

            const fechaStr = formatearValor(c.Clase);
            const horaStr = (inf && inf.Hora) ? inf.Hora : "--:--";
            const drStr = c.DR_a_cargo_Apellido_y_Nombre || "Sin DR";

            let fichaHtml = `
                <div class="ficha">
                    <div class="ficha-header">
                        <div>
                            <div class="ficha-titulo">${fechaStr} — ${horaStr} hs</div>
                            <div class="ficha-sub">${c.Tipo_de_Clase || 'Clase'} | ${drStr}</div>
                        </div>
                        <span class="badge-st ${badgeClass}">${textoBadge}</span>
                    </div>
                    <div class="ficha-body">`;

            if (inf) {
                camposVisualizar.forEach(campo => {
                    const valRaw = inf[campo];
                    if (campo === "Notas_Complementarias" && (!valRaw || valRaw === "")) return;

                    const esLargo = !["Propuesta", "Etapa"].includes(campo);
                    fichaHtml += `
                        <div class="campo-ficha ${esLargo ? 'full-width' : ''}">
                            <div class="label-ficha">${campo.replace(/_/g, ' ')}</div>
                            <div class="valor-ficha">${formatearValor(valRaw, campo)}</div>
                        </div>`;
                });
            } else {
                fichaHtml += `<div class="msg-pendiente">⚠️ Informe pedagógico no cargado</div>`;
            }

            fichaHtml += `</div></div>`;
            contenedor.insertAdjacentHTML("beforeend", fichaHtml);
        });

    } catch (e) {
        console.error(e);
        contenedor.innerHTML = `<div class="msg-pendiente">Error al cargar el historial: ${e.message}</div>`;
    }
}

function formatearValor(val, campoNombre) {
    if (val === null || val === undefined || val === "") return '<span class="empty-val">---</span>';
    if (Array.isArray(val)) val = val[1];

    // Si parece ser un timestamp de Grist (segundos)
    if (typeof val === 'number' && val > 1000000000) {
        const d = new Date(val * 1000);
        return d.toLocaleDateString('es-AR');
    }

    // Si ya es un string con formato fecha (ISO o similar)
    if (typeof val === 'string' && val.includes('-') && !isNaN(Date.parse(val))) {
        const d = new Date(val);
        // Ajustar zona horaria si es necesario
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        return d.toLocaleDateString('es-AR');
    }

    const s = String(val).trim();
    if (s.startsWith("http")) {
        const label = (campoNombre === "Evidencia") ? "VER EVIDENCIA 🔗" : "VER LINK 🔗";
        return `<a href="${s}" target="_blank">${label}</a>`;
    }
    return s;
}

function renderCharts(records, prefix = 'chart') {
    // 1. Gráfico de Dona: Por Tipo de Cancelación (Estado_Clase != Dictada)
    const cancelacionesMap = {};
    let totalCancelaciones = 0;

    records.forEach(r => {
        const estado = (r.Estado_Clase || '').toString().trim();
        if (estado.toLowerCase() !== 'dictada') {
            cancelacionesMap[estado] = (cancelacionesMap[estado] || 0) + 1;
            totalCancelaciones++;
        }
    });

    const labelsCanc = Object.keys(cancelacionesMap);
    const dataCanc = Object.values(cancelacionesMap);

    const idCanc = prefix + 'Cancelaciones';
    if (chartInstances[idCanc]) chartInstances[idCanc].destroy();

    const ctxCanc = document.getElementById(idCanc).getContext('2d');
    chartInstances[idCanc] = new Chart(ctxCanc, {
        type: 'doughnut',
        data: {
            labels: labelsCanc.length ? labelsCanc : ['Sin Cancelaciones'],
            datasets: [{
                data: dataCanc.length ? dataCanc : [1],
                backgroundColor: dataCanc.length ? ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'] : ['#e2e8f0'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12 } } },
                tooltip: { enabled: dataCanc.length > 0 },
                centerText: {
                    text: totalCancelaciones,
                    subtext: 'CANCELADAS',
                    fontSize: prefix === 'chart' ? 36 : 28,
                    subFontSize: prefix === 'chart' ? 12 : 10
                }
            }
        }
    });

    // 2. Gráfico Barras Vertical: % Dictadas / Originales por período (YYYY-MM)
    const periodosMap = {};
    records.forEach(r => {
        if (!r.Clase) return; // Si no hay fecha, ignoramos para el gráfico
        let d;
        try { d = new Date(r.Clase); } catch (e) { return; }
        if (isNaN(d.getTime())) return;

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const periodo = `${year}-${month}`; // Ej: 2024-03

        if (!periodosMap[periodo]) periodosMap[periodo] = { originales: 0, dictadas: 0 };

        const estado = (r.Estado_Clase || '').toString().toLowerCase().trim();
        const tipoClase = (r.Tipo_de_Clase || '').toString().toLowerCase().trim();
        const isOriginal = tipoClase === 'original';
        const isRecuperacion = tipoClase.includes('recuperaci') || tipoClase.includes('recuperada');

        if (isOriginal) periodosMap[periodo].originales++;
        if (estado === 'dictada' && (isOriginal || isRecuperacion)) periodosMap[periodo].dictadas++;
    });

    const periodosSort = Object.keys(periodosMap).sort();
    const dataRendimiento = periodosSort.map(p => {
        const val = periodosMap[p];
        return val.originales > 0 ? ((val.dictadas / val.originales) * 100).toFixed(1) : 0;
    });

    const idRend = prefix + 'Rendimiento';
    if (chartInstances[idRend]) chartInstances[idRend].destroy();

    const ctxRend = document.getElementById(idRend).getContext('2d');
    chartInstances[idRend] = new Chart(ctxRend, {
        type: 'bar',
        data: {
            labels: periodosSort.length ? periodosSort : ['Sin Períodos'],
            datasets: [{
                label: '% Dictadas/Originales',
                data: dataRendimiento.length ? dataRendimiento : [0],
                backgroundColor: '#16B378',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { callback: function (value) { return value + '%' } } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // 3. Gráfico Barras Horizontal: Cantidad de clases por Motivos de Cancelación
    const motivosMap = {};
    records.forEach(r => {
        const motivo = (r.Motivo || '').toString().trim();
        // Solo contar los que tienen motivo (y que asumo no son dictadas)
        if (motivo !== '') {
            motivosMap[motivo] = (motivosMap[motivo] || 0) + 1;
        }
    });

    // Ordenar motivos por frecuencia de mayor a menor
    const motivosOrdenados = Object.entries(motivosMap).sort((a, b) => b[1] - a[1]);
    const labelsMotivos = motivosOrdenados.map(m => m[0]);
    const dataMotivos = motivosOrdenados.map(m => m[1]);

    const idMot = prefix + 'Motivos';
    if (chartInstances[idMot]) chartInstances[idMot].destroy();

    const ctxMot = document.getElementById(idMot).getContext('2d');
    chartInstances[idMot] = new Chart(ctxMot, {
        type: 'bar',
        data: {
            labels: labelsMotivos.length ? labelsMotivos : ['Sin Motivos Registrados'],
            datasets: [{
                label: 'Cantidad',
                data: dataMotivos.length ? dataMotivos : [0],
                backgroundColor: '#f59e0b',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Hace que las barras sean horizontales
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

// Función auxiliar para animar los números de los KPIs
function animateValue(id, end, duration = 500) {
    const obj = document.getElementById(id);
    const start = parseInt(obj.textContent) || 0;
    if (start === end) return;

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
}
