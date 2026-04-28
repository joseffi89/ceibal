/**
 * Dashboard Unificado de Asignaciones
 * Combina las vistas de Grupos, Docentes (DR) y Analíticas en una sola interfaz.
 */

let allRecords = [];
let informesMap = {};
let drComments = [];
let chartInstances = {};
let currentTab = 'view-groups';

// Variables de estado para modales
let currentModalType = ''; // 'group' or 'dr'
let currentModalId = '';
let currentHistoryFilter = null;

document.addEventListener('DOMContentLoaded', () => {
    grist.ready({
        requiredAccess: 'full'
    });

    grist.onRecords(updateData);

    // Main Tab Switching
    const tabBtns = document.querySelectorAll('.main-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            switchTab(target);
        });
    });

    // Filter Listeners
    document.getElementById('filter-group-id').addEventListener('input', renderTableGroups);
    document.getElementById('filter-group-status').addEventListener('change', renderTableGroups);
    document.getElementById('filter-dr-name').addEventListener('input', renderTableDR);
    document.getElementById('filter-dr-status').addEventListener('change', renderTableDR);
    document.getElementById('filter-dr-cancel').addEventListener('change', renderTableDR);

    // Reset Buttons
    document.getElementById('btn-reset-groups').addEventListener('click', () => {
        document.getElementById('filter-group-id').value = '';
        document.getElementById('filter-group-status').value = '';
        renderTableGroups();
    });
    document.getElementById('btn-reset-dr').addEventListener('click', () => {
        document.getElementById('filter-dr-name').value = '';
        document.getElementById('filter-dr-status').value = '';
        document.getElementById('filter-dr-cancel').checked = false;
        renderTableDR();
    });

    // Close Modal
    document.getElementById('btnCloseModal').addEventListener('click', () => {
        document.getElementById('modalDetail').style.display = 'none';
    });
});

async function updateData(records) {
    try {
        // Mapear registros robustamente
        allRecords = (records || []).map(r => {
            const fields = r.fields || r;
            return { id: r.id, ...fields };
        });

        console.log("Registros recibidos:", allRecords.length);

        // Cargar tablas auxiliares (Tomando como referencia reporte_dr.js)
        const informesData = await grist.docApi.fetchTable('Informe').catch(() => ({ id: [] }));
        informesMap = {};
        if (informesData && informesData.ID_Clase) {
            informesData.id.forEach((id, i) => {
                const idClase = Array.isArray(informesData.ID_Clase[i]) ? informesData.ID_Clase[i][0] : informesData.ID_Clase[i];
                informesMap[idClase] = {};
                for (let key in informesData) {
                    informesMap[idClase][key] = informesData[key][i];
                }
            });
        }

        const comments = await grist.docApi.fetchTable('Comentarios_DR').catch(() => ({ id: [] }));
        drComments = [];
        if (comments && comments.id) {
            comments.id.forEach((id, i) => {
                drComments.push({
                    id: id,
                    Docente_Remoto: comments.Docente_Remoto[i],
                    Comentarios: comments.Comentarios[i],
                    Creado_por: comments.Creado_por[i],
                    Creado_en: comments.Creado_en[i]
                });
            });
        }

        updateKPIs(allRecords, true);
        renderTableGroups();
        renderTableDR();
        renderChartsGlobal(allRecords);
    } catch (err) {
        console.error("Error en updateData:", err);
    }
}

function switchTab(targetId) {
    currentTab = targetId;

    // Update UI buttons
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
    });

    // Update View sections
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === targetId);
    });

    // Switch Salud KPIs Row
    const saludGroups = document.getElementById('salud-groups');
    const saludDR = document.getElementById('salud-dr');
    if (saludGroups) saludGroups.classList.toggle('active', targetId === 'view-groups');
    if (saludDR) saludDR.classList.toggle('active', targetId === 'view-dr');

    // Refresh the corresponding view to update KPIs
    if (targetId === 'view-groups') renderTableGroups();
    else if (targetId === 'view-dr') renderTableDR();
    else if (targetId === 'view-charts') renderChartsGlobal(allRecords);
}

// ---------------------- LOGICA DE KPIs ----------------------

function updateKPIs(records, isGlobal = false) {
    const validRecords = (records || []).filter(r => (r.Estado_Clase || '').toString().trim() !== '');

    const totalClases = validRecords.length;
    let totalDictada = 0;
    let totalCanceladas = 0;
    let totalRecuperacion = 0;
    let totalOriginales = 0;
    let originalesDictadas = 0;
    let originalesCanceladas = 0;

    validRecords.forEach(r => {
        const estado = (r.Estado_Clase || '').toString().toLowerCase().trim();
        const tipoClase = (r.Tipo_de_Clase || '').toString().toLowerCase().trim();
        const isOriginal = tipoClase === 'original';
        const isRecuperacion = tipoClase.includes('recuperaci') || tipoClase.includes('recuperada');

        if (isOriginal && estado !== 'pendiente' && estado !== '') {
            totalOriginales++;
            if (estado === 'dictada') originalesDictadas++;
            else originalesCanceladas++;
        }

        if (estado === 'dictada') {
            if (isOriginal || isRecuperacion) totalDictada++;
            if (isRecuperacion) totalRecuperacion++;
        } else if (estado !== 'pendiente' && estado !== '') {
            totalCanceladas++;
        }
    });

    if (isGlobal) {
        // Métricas para Salud Grupos
        let gruposCriticos = 0;
        let gruposRecuperacion = 0;
        let gruposAlerta = 0;

        // Métricas para Salud DR
        let drAlerta = 0;
        let drBaja = 0;
        let drMedia = 0;

        const gruposMap = agruparPorGrupo(records);
        Object.values(gruposMap).forEach(g => {
            const statusObj = processGroupStatus(g.clases);
            if (statusObj.status === 'Grupo Crítico') gruposCriticos++;
            else if (statusObj.status === 'Grupo en Recuperación') gruposRecuperacion++;
            else if (statusObj.status === 'Grupo en Alerta') gruposAlerta++;
        });

        const drMap = agruparPorDR(records);
        Object.values(drMap).forEach(d => {
            const statusObj = processDRStatus(d.clases);
            if (statusObj.status === 'Alerta') drAlerta++;
            else if (statusObj.status === 'Baja Efectividad') drBaja++;
            else if (statusObj.status === 'Efectividad Media') drMedia++;
        });

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setVal('kpi-grupos-criticos', gruposCriticos);
        setVal('kpi-grupos-recuperacion', gruposRecuperacion);
        setVal('kpi-grupos-alerta', gruposAlerta);
        setVal('kpi-dr-alerta', drAlerta);
        setVal('kpi-dr-baja', drBaja);
        setVal('kpi-dr-media', drMedia);
    }

    const tasaRecuperacion = totalCanceladas > 0 ? ((totalRecuperacion / totalCanceladas) * 100).toFixed(1) : 0;
    const tasaDictadas = totalOriginales > 0 ? ((totalDictada / totalOriginales) * 100).toFixed(1) : 0;

    animateValue('kpi-total', totalClases);
    animateValue('kpi-dictadas', totalDictada);
    animateValue('kpi-canceladas', totalCanceladas);

    const kpiRend = document.getElementById('kpi-tasa-dictadas');
    if (kpiRend) {
        kpiRend.textContent = `${tasaDictadas}%`;
        kpiRend.closest('.kpi-card').title = `Originales: ${totalOriginales}, Dictadas: ${originalesDictadas}, Canceladas: ${originalesCanceladas}`;
    }

    const kpiRec = document.getElementById('kpi-recuperacion');
    if (kpiRec) {
        kpiRec.textContent = `${tasaRecuperacion}%`;
        kpiRec.closest('.kpi-card').title = `Total Recuperadas: ${totalRecuperacion}`;
    }
}

// ---------------------- RENDERING TABLES ----------------------

function renderTableGroups() {
    const searchFilter = document.getElementById('filter-group-id').value.toLowerCase();
    const estadoFilter = document.getElementById('filter-group-status').value;

    const gruposMap = agruparPorGrupo(allRecords);
    let gruposArray = Object.values(gruposMap).map(g => {
        const statusObj = processGroupStatus(g.clases);
        return { ...g, ...statusObj };
    });

    if (searchFilter) gruposArray = gruposArray.filter(g => g.idGrupo.toLowerCase().includes(searchFilter));
    if (estadoFilter) gruposArray = gruposArray.filter(g => g.priority.toString() === estadoFilter);

    gruposArray.sort((a, b) => a.priority - b.priority || a.percent - b.percent);

    const filteredRecords = gruposArray.flatMap(g => g.clases);
    updateKPIs(filteredRecords, false);
    renderChartsGlobal(filteredRecords);

    const tbody = document.getElementById('table-groups-body');
    tbody.innerHTML = '';

    if (gruposArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-folder-open"></i><p>No se encontraron grupos.</p></td></tr>`;
        return;
    }

    gruposArray.slice(0, 500).forEach(g => {
        const tr = document.createElement('tr');
        tr.className = g.rowClass;
        tr.innerHTML = `
            <td><strong>${g.idGrupo}</strong></td>
            <td>${g.docente}</td>
            <td>${g.mentor}</td>
            <td>${g.responsable}</td>
            <td><strong>${(g.percent || 0).toFixed(0)}%</strong> <span style="font-size: 11px; color: #64748b;">(${g.dictadas || 0}/${g.originales || 0})</span></td>
            <td><span class="badge ${g.badgeClass}">${g.status}</span></td>
            <td class="action-cell">
                <button class="btn-action" onclick="openDetailModal('group', '${g.idGrupo}')"><i class="fa-solid fa-eye"></i> Detalle</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTableDR() {
    const searchFilter = document.getElementById('filter-dr-name').value.toLowerCase();
    const estadoFilter = document.getElementById('filter-dr-status').value;
    const alertCancFilter = document.getElementById('filter-dr-cancel').checked;

    const drMap = agruparPorDR(allRecords);
    let drArray = Object.values(drMap).map(d => {
        const statusObj = processDRStatus(d.clases);
        return { ...d, ...statusObj };
    });

    if (searchFilter) drArray = drArray.filter(d => d.drName.toLowerCase().includes(searchFilter));
    if (estadoFilter) drArray = drArray.filter(d => d.priority.toString() === estadoFilter);
    if (alertCancFilter) drArray = drArray.filter(d => d.hasAlertaCancelaciones);

    drArray.sort((a, b) => a.priority - b.priority || a.percent - b.percent);

    const filteredRecords = drArray.flatMap(d => d.clases);
    updateKPIs(filteredRecords, false);
    renderChartsGlobal(filteredRecords);

    const tbody = document.getElementById('table-dr-body');
    tbody.innerHTML = '';

    if (drArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-folder-open"></i><p>No se encontraron docentes.</p></td></tr>`;
        return;
    }

    drArray.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = d.rowClass;
        const alertIcon = d.hasAlertaCancelaciones ?
            `<i class="fa-solid fa-triangle-exclamation alert-icon" title="Alerta: >10% de clases canceladas (${(d.tasaCancelacion * 100).toFixed(1)}%)"></i>` : '';

        tr.innerHTML = `
            <td><strong>${d.drName}</strong>${alertIcon}</td>
            <td>${d.mentor}</td>
            <td>${d.responsable}</td>
            <td><strong>${(d.percent || 0).toFixed(0)}%</strong> <span style="font-size: 11px; color: #64748b;">(${d.dictadas || 0}/${d.originales || 0})</span></td>
            <td><span class="badge ${d.badgeClass}">${d.status}</span></td>
            <td class="action-cell">
                <button class="btn-action" onclick="openDetailModal('dr', '${d.drName}')"><i class="fa-solid fa-eye"></i> Detalle</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------- ANALYTICS LOGIC ----------------------

function renderChartsGlobal(records) {
    const estadosMap = {};
    const periodosMap = {};
    const motivosMap = {};

    records.forEach(r => {
        const estadoRaw = r.Estado_Clase;
        if (!estadoRaw || estadoRaw.toString().trim() === '') return;

        const estadoStr = estadoRaw.toString().trim();
        const estado = estadoStr.toLowerCase();
        const tipoClase = (r.Tipo_de_Clase || '').toString().toLowerCase().trim();
        const isOriginal = tipoClase === 'original';
        const isRecuperacion = tipoClase.includes('recuperaci') || tipoClase.includes('recuperada');

        if (estado !== 'dictada' && estado !== 'pendiente') {
            estadosMap[estadoStr] = (estadosMap[estadoStr] || 0) + 1;
            const motRaw = r.Motivo;
            const mot = Array.isArray(motRaw) ? motRaw[1] : motRaw;
            if (mot) motivosMap[mot] = (motivosMap[mot] || 0) + 1;
        }

        const d = new Date(r.Clase);
        if (!isNaN(d.getTime())) {
            const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!periodosMap[periodo]) periodosMap[periodo] = { originales: 0, dictadas: 0 };
            if (isOriginal) periodosMap[periodo].originales++;
            if (estado === 'dictada' && (isOriginal || isRecuperacion)) periodosMap[periodo].dictadas++;
        }
    });

    const estadosLabels = Object.keys(estadosMap);
    const estadosData = Object.values(estadosMap);
    const colorPalette = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

    renderDoughnut('chartCancelaciones', estadosData, estadosLabels, colorPalette, 'CANCELADAS');

    const sortedPeriodos = Object.keys(periodosMap).sort();
    const rendData = sortedPeriodos.map(p => {
        const v = periodosMap[p];
        return v.originales > 0 ? (v.dictadas / v.originales * 100).toFixed(1) : 0;
    });
    renderBar('chartRendimiento', sortedPeriodos, rendData, '% Rendimiento', '#10b981');

    const sortedMotivos = Object.entries(motivosMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    renderHorizontalBar('chartMotivos', sortedMotivos.map(m => m[0]), sortedMotivos.map(m => m[1]), 'Cantidad', '#f97316');
}

// ---------------------- MODAL LOGIC ----------------------

window.openDetailModal = function (type, id, initialSubView = null) {
    currentModalType = type;
    currentModalId = id;

    const modal = document.getElementById('modalDetail');
    modal.style.display = 'flex';

    document.getElementById('modalType').textContent = type === 'group' ? 'Grupo' : 'Docente';
    document.getElementById('modalName').textContent = id;
    const icon = document.getElementById('modalIcon');
    if (icon) icon.className = type === 'group' ? 'fa-solid fa-users' : 'fa-solid fa-user-tie';

    const tabContainer = document.getElementById('modalTabContainer');
    tabContainer.innerHTML = '';

    const tabs = [];
    if (type === 'dr') tabs.push({ id: 'groups', label: 'Grupos Asignados', icon: 'fa-users' });
    tabs.push({ id: 'charts', label: 'Analíticas', icon: 'fa-chart-line' });
    tabs.push({ id: 'history', label: 'Historial', icon: 'fa-clock-rotate-left' });
    tabs.push({ id: 'comments', label: 'Comentarios', icon: 'fa-comments' });

    tabs.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'modal-tab-btn';
        btn.innerHTML = `<i class="fa-solid ${t.icon}"></i> ${t.label}`;
        btn.onclick = () => switchModalTab(t.id);
        btn.setAttribute('data-modal-tab', t.id);
        tabContainer.appendChild(btn);
    });

    const defaultTab = initialSubView || (type === 'dr' ? 'groups' : 'charts');
    switchModalTab(defaultTab);
};

function switchModalTab(tabId, filter = null) {
    currentHistoryFilter = filter;
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-modal-tab') === tabId));

    const content = document.getElementById('modal-view-content');
    content.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';

    setTimeout(() => {
        if (tabId === 'groups') renderModalGroups(content);
        else if (tabId === 'charts') renderModalCharts(content);
        else if (tabId === 'history') renderModalHistory(content, currentHistoryFilter);
        else if (tabId === 'comments') renderModalComments(content);
    }, 50);
}

function renderModalGroups(container) {
    const drRecords = allRecords.filter(r => (r.DR_a_cargo_Apellido_y_Nombre || '').toString() === currentModalId);
    const gMap = agruparPorGrupo(drRecords);
    let gArray = Object.values(gMap).map(g => {
        const st = processGroupStatus(g.clases);
        return { ...g, ...st };
    });
    gArray.sort((a, b) => a.percent - b.percent);

    container.innerHTML = `
        <div class="table-container" style="box-shadow:none;">
            <table>
                <thead><tr><th>ID Grupo</th><th>Dictadas/Orig</th><th>Rendimiento</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                    ${gArray.map(g => `
                        <tr class="${g.rowClass}">
                            <td><strong>${g.idGrupo}</strong></td>
                            <td>${g.dictadas} / ${g.originales}</td>
                            <td><strong>${g.percent.toFixed(0)}%</strong></td>
                            <td><span class="badge ${g.badgeClass}">${g.status}</span></td>
                            <td><button class="btn-action" onclick="switchModalTab('history', '${g.idGrupo}')"><i class="fa-solid fa-clock-rotate-left"></i> Historial</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderModalCharts(container) {
    container.innerHTML = `
        <div class="charts-grid" style="margin-bottom:0">
            <div class="chart-card"><h3 class="chart-title">Cancelaciones</h3><div class="chart-container-inner" style="height:250px"><canvas id="mChartCancel"></canvas></div></div>
            <div class="chart-card"><h3 class="chart-title">Rendimiento</h3><div class="chart-container-inner" style="height:250px"><canvas id="mChartRend"></canvas></div></div>
            <div class="chart-card full-width"><h3 class="chart-title">Motivos</h3><div class="chart-container-inner" style="height:180px"><canvas id="mChartMot"></canvas></div></div>
        </div>
    `;

    const records = currentModalType === 'group'
        ? allRecords.filter(r => (Array.isArray(r.ID_Grupo) ? r.ID_Grupo[1] : r.ID_Grupo) === currentModalId)
        : allRecords.filter(r => (r.DR_a_cargo_Apellido_y_Nombre || '').toString() === currentModalId);

    setTimeout(() => {
        const estadosMap = {};
        const motivi = {};
        const rendi = {};
        let totalCanceladas = 0;

        records.forEach(r => {
            const estadoRaw = (r.Estado_Clase || '').toString().trim();
            const estado = estadoRaw.toLowerCase();
            const tipo = (r.Tipo_de_Clase || '').toString().toLowerCase().trim();
            const isO = tipo === 'original';
            const isR = tipo.includes('recuperaci') || tipo.includes('recuperada');

            if (estado !== 'dictada' && estado !== 'pendiente' && estado !== '') {
                estadosMap[estadoRaw] = (estadosMap[estadoRaw] || 0) + 1;
                totalCanceladas++;
                
                const motRaw = r.Motivo;
                const mot = Array.isArray(motRaw) ? motRaw[1] : (motRaw || null);
                if (mot) motivi[mot] = (motivi[mot] || 0) + 1;
            }
            const d = new Date(r.Clase);
            if (!isNaN(d.getTime())) {
                const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                if (!rendi[p]) rendi[p] = { o: 0, d: 0 };
                if (isO) rendi[p].o++;
                if (estado === 'dictada' && (isO || isR)) rendi[p].d++;
            }
        });

        renderDoughnut('mChartCancel', Object.values(estadosMap), Object.keys(estadosMap), ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'], 'CANCELADAS');
        const sortedP = Object.keys(rendi).sort();
        renderBar('mChartRend', sortedP, sortedP.map(p => rendi[p].o > 0 ? (rendi[p].d / rendi[p].o * 100).toFixed(1) : 0), '% Rendimiento', '#10b981');
        const sortedM = Object.entries(motivi).sort((a, b) => b[1] - a[1]).slice(0, 5);
        renderHorizontalBar('mChartMot', sortedM.map(m => m[0]), sortedM.map(m => m[1]), 'Cant', '#f97316');
    }, 100);
}

function renderModalHistory(container, idGrupoFilter = null) {
    const records = currentModalType === 'group'
        ? allRecords.filter(r => (Array.isArray(r.ID_Grupo) ? r.ID_Grupo[1] : r.ID_Grupo) === currentModalId)
        : allRecords.filter(r => (r.DR_a_cargo_Apellido_y_Nombre || '').toString() === currentModalId);

    let filtered = [...records];
    if (idGrupoFilter) filtered = filtered.filter(r => (Array.isArray(r.ID_Grupo) ? r.ID_Grupo[1] : r.ID_Grupo) === idGrupoFilter);
    filtered.sort((a, b) => {
        const estA = (a.Estado_Clase || '').toLowerCase().trim();
        const estB = (b.Estado_Clase || '').toLowerCase().trim();
        const isPendingA = estA === 'pendiente' || estA === '';
        const isPendingB = estB === 'pendiente' || estB === '';

        if (isPendingA && !isPendingB) return 1;
        if (!isPendingA && isPendingB) return -1;
        return new Date(b.Clase) - new Date(a.Clase);
    });

    if (filtered.length === 0) { container.innerHTML = '<div class="msg-pendiente">Sin historial disponible.</div>'; return; }

    let headerHtml = idGrupoFilter ? `
        <div style="margin-bottom: 16px; padding: 12px; background: #f0fdf4; border-radius: 12px; border: 1px solid #dcfce7; font-size: 13px; color: #166534; display: flex; justify-content: space-between; align-items: center;">
            <span><i class="fa-solid fa-filter"></i> Historial del Grupo: <strong>${idGrupoFilter}</strong></span>
            <button onclick="switchModalTab('history')" style="background: var(--primary-color); color: white; border: none; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">Ver todos</button>
        </div>
    ` : '';

    container.innerHTML = headerHtml + `<div class="history-container">${filtered.map(r => {
        const inf = informesMap[r.id];
        const estOriginal = r.Estado_Clase || 'Pendiente';
        const est = estOriginal.toLowerCase();
        
        let badgeClass = 'badge-success';
        let textoBadge = estOriginal;
        let campos = [];

        if (est.includes('dictada')) {
            badgeClass = 'badge-success';
            campos = ["Propuesta", "Etapa", "Evidencia", "Notas_Pedagogicas", "Notas_Complementarias"];
            if (inf && inf.Plataforma) {
                let plat = Array.isArray(inf.Plataforma) ? inf.Plataforma[1] : inf.Plataforma;
                if (plat) textoBadge = `Dictada por ${plat}`;
            }
        } else if (est.includes('cancelada')) {
            badgeClass = 'badge-danger';
            campos = ["Motivo", "Notas_Complementarias", "Coordinacion_con_DA"];
        } else if (est.includes('reprogramada')) {
            badgeClass = 'badge-warning';
            campos = ["Motivo", "Notas_Complementarias"];
        } else {
            badgeClass = 'badge-orange';
            campos = ["Motivo", "Notas_Complementarias"];
        }

        return `
            <div class="ficha">
                <div class="ficha-header">
                    <div>
                        <div class="valor-ficha" style="font-weight: 700; font-size: 14px;">${formatearFecha(r.Clase)} — ${inf?.Hora || '--:--'} hs</div>
                        <div class="label-ficha" style="margin-top: 2px;">${getLabel(r.ID_Grupo)} | ${r.Tipo_de_Clase || 'Clase'}</div>
                    </div>
                    <span class="badge ${badgeClass}">${textoBadge}</span>
                </div>
                <div class="ficha-body">
                    ${inf ? campos.map(f => {
            const val = inf[f];
            if (f === "Notas_Complementarias" && !val) return '';
            const isFull = !["Propuesta", "Etapa", "Hora"].includes(f);
            return `<div style="grid-column: ${isFull ? '1 / span 2' : 'auto'}"><div class="label-ficha">${f.replace(/_/g, ' ')}</div><div class="valor-ficha">${formatFichaValue(val, f)}</div></div>`;
        }).join('') : '<div class="msg-pendiente" style="grid-column: 1 / span 2">Sin informe pedagógico cargado.</div>'}
                </div>
            </div>
        `;
    }).join('')}</div>`;
}

function formatFichaValue(val, field) {
    if (!val) return '-';
    if (Array.isArray(val)) val = val[1];
    if (String(val).startsWith('http')) return `<a href="${val}" target="_blank" style="color: var(--info); font-weight: 600;">VER ${field.toUpperCase()} 🔗</a>`;
    return val;
}

async function renderModalComments(container) {
    let drName = currentModalId;
    if (currentModalType === 'group') {
        const gRec = allRecords.find(r => (Array.isArray(r.ID_Grupo) ? r.ID_Grupo[1] : r.ID_Grupo) === currentModalId);
        drName = gRec ? (gRec.DR_a_cargo_Apellido_y_Nombre || '').toString() : '';
    }
    if (!drName) { container.innerHTML = '<div class="msg-pendiente">No se encontró un DR asociado para ver comentarios.</div>'; return; }

    const filteredComments = drComments.filter(c => c.Docente_Remoto === drName);
    filteredComments.sort((a, b) => new Date(b.Creado_en) - new Date(a.Creado_en));

    container.innerHTML = `
        <div class="comments-container" id="commentsList">
            ${filteredComments.length > 0 ? filteredComments.map(c => `
                <div class="comment-card">
                    <div class="comment-header"><span>${c.Creado_por}</span><span>${formatearFecha(c.Creado_en)}</span></div>
                    <div class="comment-text">${c.Comentarios}</div>
                </div>
            `).join('') : '<div class="msg-pendiente">No hay comentarios.</div>'}
        </div>
        <div class="comment-form">
            <textarea id="newCommentText" placeholder="Escribe un comentario para ${drName}..."></textarea>
            <button onclick="saveComment('${drName}')" id="btnSaveComment"><i class="fa-solid fa-paper-plane"></i> Enviar</button>
        </div>
    `;
}

window.saveComment = async function (drName) {
    const text = document.getElementById('newCommentText').value.trim();
    if (!text) return;
    const btn = document.getElementById('btnSaveComment');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    try {
        await grist.docApi.applyUserActions([['AddRecord', 'Comentarios_DR', null, { Docente_Remoto: drName, Comentarios: text }]]);
        document.getElementById('newCommentText').value = '';
        const comments = await grist.docApi.fetchTable('Comentarios_DR');
        drComments = [];
        comments.id.forEach((id, i) => { drComments.push({ Docente_Remoto: comments.Docente_Remoto[i], Comentarios: comments.Comentarios[i], Creado_por: comments.Creado_por[i], Creado_en: comments.Creado_en[i] }); });
        renderModalComments(document.getElementById('modal-view-content'));
    } catch (e) { alert("Error al guardar comentario: " + e.message); } finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar'; }
};

function agruparPorGrupo(records) {
    const map = {};
    records.forEach(r => {
        let label = (Array.isArray(r.ID_Grupo) ? r.ID_Grupo[1] : r.ID_Grupo) || 'Sin ID';
        if (!map[label]) { map[label] = { idGrupo: label, docente: r.DR_a_cargo_Apellido_y_Nombre || '-', mentor: r.Mentor_a || '-', responsable: r.Resp_Gestion || '-', clases: [] }; }
        map[label].clases.push(r);
    });
    Object.values(map).forEach(g => { g.clases.sort((a, b) => new Date(a.Clase || 0) - new Date(b.Clase || 0)); });
    return map;
}

function agruparPorDR(records) {
    const map = {};
    records.forEach(r => {
        let name = (r.DR_a_cargo_Apellido_y_Nombre || '').toString() || 'Sin Docente';
        if (!map[name]) { map[name] = { drName: name, mentor: r.Mentor_a || '-', responsable: r.Resp_Gestion || '-', clases: [] }; }
        map[name].clases.push(r);
    });
    Object.values(map).forEach(d => { d.clases.sort((a, b) => new Date(a.Clase || 0) - new Date(b.Clase || 0)); });
    return map;
}

function processGroupStatus(clases) {
    let originales = 0, dictadas = 0;
    clases.forEach(c => {
        const est = (c.Estado_Clase || '').toLowerCase().trim();
        const tip = (c.Tipo_de_Clase || '').toLowerCase().trim();
        if (tip === 'original' && est !== 'pendiente' && est !== '') originales++;
        if (est === 'dictada' && (tip === 'original' || tip.includes('recuperaci') || tip.includes('recuperada'))) dictadas++;
    });
    const percent = originales > 0 ? (dictadas / originales) * 100 : 0;
    const passedClases = clases.filter(c => { const est = (c.Estado_Clase || '').toLowerCase().trim(); return est !== 'pendiente' && est !== ''; });
    const last3 = passedClases.slice(-3);
    const last3NotDictadas = last3.length > 0 && last3.every(c => (c.Estado_Clase || '').toLowerCase().trim() !== 'dictada');
    let status = 'Ok', badgeClass = 'badge-success', rowClass = 'row-ok', priority = 4;
    if (percent < 60) {
        const lastEst = passedClases.length > 0 ? (passedClases[passedClases.length - 1].Estado_Clase || '').toLowerCase().trim() : '';
        if (lastEst !== 'dictada' && lastEst !== '') { status = 'Grupo Crítico'; badgeClass = 'badge-danger'; rowClass = 'row-critical'; priority = 1; }
        else { status = 'Grupo en Recuperación'; badgeClass = 'badge-warning'; rowClass = 'row-recovery'; priority = 2; }
    } else if (last3NotDictadas) { status = 'Grupo en Alerta'; badgeClass = 'badge-orange'; rowClass = 'row-alert'; priority = 3; }
    return { percent, dictadas, originales, status, badgeClass, rowClass, priority };
}

function processDRStatus(clases) {
    let originales = 0, dictadas = 0, canceladas = 0;
    clases.forEach(c => {
        const est = (c.Estado_Clase || '').toLowerCase().trim();
        const tip = (c.Tipo_de_Clase || '').toLowerCase().trim();
        if (tip === 'original' && est !== 'pendiente' && est !== '') originales++;
        if (est === 'dictada' && (tip === 'original' || tip.includes('recuperaci') || tip.includes('recuperada'))) dictadas++;
        else if (est !== 'pendiente' && est !== '') canceladas++;
    });
    const percent = originales > 0 ? (dictadas / originales) * 100 : 0;
    const totalPasadas = clases.filter(c => { const est = (c.Estado_Clase || '').toLowerCase().trim(); return est !== 'pendiente' && est !== ''; }).length;
    const tasaCancelacion = totalPasadas > 0 ? (canceladas / totalPasadas) : 0;
    const hasAlertaCancelaciones = tasaCancelacion >= 0.10;
    let status = 'Ok', badgeClass = 'badge-success', rowClass = 'row-ok', priority = 4;
    if (percent < 60) { status = 'Alerta'; badgeClass = 'badge-danger'; rowClass = 'row-critical'; priority = 1; }
    else if (percent < 70) { status = 'Baja Efectividad'; badgeClass = 'badge-orange'; rowClass = 'row-alert'; priority = 2; }
    else if (percent < 80) { status = 'Efectividad Media'; badgeClass = 'badge-warning'; rowClass = 'row-recovery'; priority = 3; }
    return { percent, dictadas, originales, status, badgeClass, rowClass, priority, hasAlertaCancelaciones, tasaCancelacion };
}

function renderDoughnut(id, data, labels, colors, subtext = 'TOTAL') {
    const el = document.getElementById(id); if (!el) return;
    if (chartInstances[id]) chartInstances[id].destroy();
    const ctx = el.getContext('2d');
    const total = data.reduce((a, b) => a + b, 0);
    chartInstances[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' },
        plugins: [{
            id: 'centerText',
            afterDraw: (chart) => {
                const { ctx, chartArea: { left, top, width, height } } = chart;
                ctx.save(); ctx.font = '800 24px Inter'; ctx.fillStyle = '#0f172a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(total, left + width / 2, top + height / 2 - 5);
                ctx.font = '600 12px Inter'; ctx.fillStyle = '#64748b'; ctx.fillText(subtext, left + width / 2, top + height / 2 + 20); ctx.restore();
            }
        }]
    });
}

function renderBar(id, labels, data, label, color) {
    const el = document.getElementById(id); if (!el) return;
    if (chartInstances[id]) chartInstances[id].destroy();
    const ctx = el.getContext('2d');
    chartInstances[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label, data, backgroundColor: color, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
    });
}

function renderHorizontalBar(id, labels, data, label, color) {
    const el = document.getElementById(id); if (!el) return;
    if (chartInstances[id]) chartInstances[id].destroy();
    const ctx = el.getContext('2d');
    chartInstances[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label, data, backgroundColor: color, borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function animateValue(id, end, duration = 500) {
    const obj = document.getElementById(id); if (!obj) return;
    const start = parseInt(obj.textContent) || 0; if (start === end) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.textContent = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

function formatearFecha(fecha) {
    if (!fecha) return '-';
    let d = (typeof fecha === 'number') ? new Date(fecha > 10000000000 ? fecha : fecha * 1000) : new Date(fecha);
    if (isNaN(d.getTime())) return fecha;
    if (typeof fecha === 'string' && fecha.includes('-')) d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getLabel(val) { if (Array.isArray(val)) return val[1]; return val || '-'; }