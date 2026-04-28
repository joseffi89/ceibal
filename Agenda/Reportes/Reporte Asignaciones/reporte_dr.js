let allRecords = [];
const chartInstances = {};
let currentDRsArray = [];
let currentModalDRName = null;

// Plugin for center text in doughnut charts
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

            const fontSize = options.fontSize || 36;
            ctx.font = `bold ${fontSize}px Inter`;
            ctx.fillStyle = '#0f172a';
            ctx.fillText(options.text, centerX, centerY - (fontSize * 0.1));

            const subFontSize = options.subFontSize || 12;
            ctx.font = `600 ${subFontSize}px Inter`;
            ctx.fillStyle = '#64748b';
            ctx.fillText(options.subtext, centerX, centerY + (fontSize * 0.6));

            ctx.restore();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    grist.ready({ requiredAccess: 'full' });
    grist.onRecords(updateData);

    document.getElementById('filter-dr').addEventListener('input', renderTable);
    document.getElementById('filter-estado-dr').addEventListener('change', renderTable);
    document.getElementById('filter-alerta-cancelaciones').addEventListener('change', renderTable);

    document.getElementById('btn-reset').addEventListener('click', () => {
        document.getElementById('filter-dr').value = '';
        document.getElementById('filter-estado-dr').value = '';
        document.getElementById('filter-alerta-cancelaciones').checked = false;
        renderTable();
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        });
    });

    const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
    modalTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-modal-target');
            switchModalTab(targetId);

            if (currentModalDRName) {
                const drData = currentDRsArray.find(d => d.drName === currentModalDRName);
                if (drData) {
                    if (targetId === 'modal-view-groups') renderDRGroups(drData);
                    if (targetId === 'modal-view-charts') renderCharts(drData.clases, 'modalChart');
                    if (targetId === 'modal-view-history') renderHistory(drData.clases);
                    if (targetId === 'modal-view-comments') renderComments(drData.drName);
                }
            }
        });
    });

    document.getElementById('btnCloseModal').addEventListener('click', () => {
        document.getElementById('modalDRDetail').style.display = 'none';
        currentModalDRName = null;
    });

    document.getElementById('btnSaveComment').addEventListener('click', saveComment);
});

function switchModalTab(targetId) {
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-modal-target') === targetId);
    });

    document.querySelectorAll('.modal-view-section').forEach(s => {
        s.style.display = (s.id === targetId) ? 'block' : 'none';
        s.classList.toggle('active', s.id === targetId);
    });
}

function updateData(records) {
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

function processDRStatus(clases) {
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

    // Alerta Cancelaciones: si canceló más del 10% del total de clases
    const totalClasesCount = clases.length;
    let canceladasCount = 0;
    clases.forEach(c => {
        if ((c.Estado_Clase || '').toString().toLowerCase().trim() !== 'dictada') canceladasCount++;
    });
    const tasaCancelacion = totalClasesCount > 0 ? (canceladasCount / totalClasesCount) : 0;
    const hasAlertaCancelaciones = tasaCancelacion >= 0.10;

    let status = 'Efectividad Ok';
    let badgeClass = 'badge-success';
    let rowClass = 'row-ok';
    let priority = 4;

    if (percent < 60) {
        status = 'Alerta';
        badgeClass = 'badge-danger';
        rowClass = 'row-critical';
        priority = 1;
    } else if (percent < 70) {
        status = 'Baja Efectividad';
        badgeClass = 'badge-orange';
        rowClass = 'row-alert';
        priority = 2;
    } else if (percent < 80) {
        status = 'Efectividad Media';
        badgeClass = 'badge-warning';
        rowClass = 'row-recovery';
        priority = 3;
    }

    return { percent, dictadas, originales, status, badgeClass, rowClass, priority, hasAlertaCancelaciones, tasaCancelacion };
}

function renderTable() {
    const searchFilter = document.getElementById('filter-dr').value.toLowerCase();
    const estadoFilter = document.getElementById('filter-estado-dr').value;
    const alertaCancFilter = document.getElementById('filter-alerta-cancelaciones').checked;

    const drMap = {};
    allRecords.forEach(r => {
        const label = r.DR_a_cargo_Apellido_y_Nombre || 'Sin Docente';
        if (!drMap[label]) {
            drMap[label] = {
                drName: label,
                mentor: r.Mentor_a || '-',
                responsable: r.Resp_Gestion || '-',
                clases: []
            };
        }
        drMap[label].clases.push(r);
    });

    let drArray = Object.values(drMap).map(d => {
        const statusData = processDRStatus(d.clases);
        return { ...d, ...statusData };
    });

    // Global DR Status KPIs (Fixed)
    const globalStatusCounts = {
        alerta: drArray.filter(d => d.priority === 1).length,
        baja: drArray.filter(d => d.priority === 2).length,
        media: drArray.filter(d => d.priority === 3).length
    };

    animateValue('kpi-dr-alerta', globalStatusCounts.alerta);
    animateValue('kpi-dr-baja', globalStatusCounts.baja);
    animateValue('kpi-dr-media', globalStatusCounts.media);

    if (searchFilter) {
        drArray = drArray.filter(d => d.drName.toLowerCase().includes(searchFilter));
    }
    if (estadoFilter) {
        drArray = drArray.filter(d => d.priority.toString() === estadoFilter);
    }
    if (alertaCancFilter) {
        drArray = drArray.filter(d => d.hasAlertaCancelaciones);
    }

    drArray.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.percent - b.percent;
    });

    const filteredRecords = drArray.flatMap(d => d.clases);
    updateKPIs(filteredRecords);

    const tbody = document.getElementById('table-body');
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
            <td><strong>${d.percent.toFixed(0)}%</strong> <span style="font-size: 11px; color: #64748b;">(${d.dictadas}/${d.originales})</span></td>
            <td><span class="badge ${d.badgeClass}">${d.status}</span></td>
            <td>
                <button class="btn-view-detail" onclick="openDRModal('${d.drName}')">
                    <i class="fa-solid fa-eye"></i> Ver Detalle
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    currentDRsArray = drArray;
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

window.openDRModal = function (drName, initialView = 'groups') {
    currentModalDRName = drName;
    const drData = currentDRsArray.find(d => d.drName === drName);
    if (!drData) return;

    document.getElementById('modalDRName').textContent = drName;
    document.getElementById('modalDRDetail').style.display = 'flex';

    const targetTabId = initialView === 'history' ? 'modal-view-history' : 'modal-view-groups';
    switchModalTab(targetTabId);

    if (initialView === 'history') {
        renderHistory(drData.clases);
    } else {
        renderDRGroups(drData);
    }
};

function renderDRGroups(drData) {
    const groupsMap = {};
    drData.clases.forEach(c => {
        const label = (c.ID_Grupo || 'S/N').toString();
        if (!groupsMap[label]) {
            groupsMap[label] = { idGrupo: label, clases: [] };
        }
        groupsMap[label].clases.push(c);
    });

    const groupsArray = Object.values(groupsMap).map(g => {
        const status = processGroupStatus(g.clases);
        return { ...g, ...status };
    });

    // Ordenar de menos efectividad a más
    groupsArray.sort((a, b) => a.percent - b.percent);

    const tbody = document.getElementById('modal-groups-body');
    tbody.innerHTML = groupsArray.map(g => `
        <tr>
            <td><strong>${g.idGrupo}</strong></td>
            <td>${g.dictadas} / ${g.originales}</td>
            <td><strong>${g.percent.toFixed(0)}%</strong></td>
            <td><span class="badge ${g.badgeClass}">${g.status}</span></td>
            <td>
                <button class="btn-view-history" style="padding: 4px 8px; font-size: 11px;" onclick="openGroupHistory('${g.idGrupo}')">
                    <i class="fa-solid fa-clock-rotate-left"></i> Historial
                </button>
            </td>
        </tr>
    `).join('');
}

window.openGroupHistory = function(idGrupo) {
    if (!currentModalDRName) return;
    const drData = currentDRsArray.find(d => d.drName === currentModalDRName);
    if (!drData) return;
    
    // Filtrar clases por grupo
    const groupClases = drData.clases.filter(c => (c.ID_Grupo || 'S/N').toString() === idGrupo);
    
    switchModalTab('modal-view-history');
    renderHistory(groupClases, idGrupo);
};

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
    let priority = 4;

    if (percent < 60) {
        if (lastClassEstado !== 'dictada') {
            status = 'Grupo Crítico';
            badgeClass = 'badge-danger';
            priority = 1;
        } else {
            status = 'Grupo en Recuperación';
            badgeClass = 'badge-warning';
            priority = 2;
        }
    } else {
        if (last3AllNotDictadas) {
            status = 'Grupo en Alerta';
            badgeClass = 'badge-orange';
            priority = 3;
        } else {
            status = 'Grupo Ok';
            badgeClass = 'badge-success';
            priority = 4;
        }
    }

    return { percent, dictadas, originales, status, badgeClass, priority };
}

async function renderComments(drName) {
    const list = document.getElementById("commentsList");
    list.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando comentarios...</div>';

    try {
        const commentsData = await grist.docApi.fetchTable("Comentarios_DR");
        const comments = [];
        if (commentsData.id) {
            commentsData.id.forEach((id, i) => {
                const drRef = commentsData.Docente_Remoto[i];
                if (drRef === drName) {
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
            list.innerHTML = '<div style="text-align:center; padding: 20px; color: #64748b;">No hay comentarios.</div>';
        } else {
            list.innerHTML = comments.map(c => `
                <div class="comment-card">
                    <div class="comment-header"><span>${c.author}</span><span>${formatearValor(c.date)}</span></div>
                    <div class="comment-text">${c.text}</div>
                </div>
            `).join('');
        }
    } catch (e) {
        list.innerHTML = `<div class="msg-pendiente">Error: ${e.message}</div>`;
    }
}

async function saveComment() {
    const text = document.getElementById("newCommentText").value.trim();
    if (!text || !currentModalDRName) return;

    const btn = document.getElementById("btnSaveComment");
    btn.disabled = true;
    try {
        await grist.docApi.applyUserActions([
            ['AddRecord', 'Comentarios_DR', null, {
                Comentarios: text,
                Docente_Remoto: currentModalDRName
            }]
        ]);
        document.getElementById("newCommentText").value = "";
        renderComments(currentModalDRName);
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false;
    }
}

async function renderHistory(clases, idGrupoFilter = null) {
    const contenedor = document.getElementById("historyContent");
    contenedor.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando historial...</div>';

    try {
        const informesData = await grist.docApi.fetchTable("Informe");
        const informesMap = {};
        if (informesData.ID_Clase) {
            informesData.id.forEach((id, i) => {
                const idClase = Array.isArray(informesData.ID_Clase[i]) ? informesData.ID_Clase[i][0] : informesData.ID_Clase[i];
                informesMap[idClase] = {};
                for (let key in informesData) informesMap[idClase][key] = informesData[key][i];
            });
        }

        contenedor.innerHTML = idGrupoFilter ? 
            `<div style="margin-bottom: 16px; padding: 10px; background: #f0fdf4; border-radius: 8px; border: 1px solid #dcfce7; font-size: 13px; color: #166534; display: flex; justify-content: space-between; align-items: center;">
                <span>Mostrando historial del grupo: <strong>${idGrupoFilter}</strong></span>
                <button onclick="openDRModal('${currentModalDRName}', 'history')" style="background: none; border: none; color: #16a34a; font-weight: 700; cursor: pointer; text-decoration: underline;">Ver todos</button>
            </div>` : "";
        const sortedClases = [...clases].sort((a, b) => new Date(b.Clase || 0) - new Date(a.Clase || 0));

        sortedClases.forEach(c => {
            const inf = informesMap[c.id];
            const estado = (c.Estado_Clase || "Pendiente").toLowerCase();
            let badgeClass = "st-default";
            let campos = [];

            if (estado.includes("dictada")) {
                badgeClass = "st-dictada";
                campos = ["Propuesta", "Etapa", "Evidencia", "Notas_Pedagogicas", "Notas_Complementarias"];
            } else if (estado.includes("cancelada")) {
                badgeClass = "st-rojo";
                campos = ["Motivo", "Notas_Complementarias", "Coordinacion_con_DA"];
            }

            let html = `
                <div class="ficha">
                    <div class="ficha-header">
                        <div>
                            <div class="ficha-titulo">${formatearValor(c.Clase)} — ${inf?.Hora || '--:--'} hs</div>
                            <div class="ficha-sub">${c.ID_Grupo || 'S/N'} | ${c.Tipo_de_Clase || 'Clase'}</div>
                        </div>
                        <span class="badge-st ${badgeClass}">${c.Estado_Clase}</span>
                    </div>
                    <div class="ficha-body">`;

            if (inf) {
                campos.forEach(f => {
                    const val = inf[f];
                    if (f === "Notas_Complementarias" && !val) return;
                    html += `<div class="campo-ficha ${!["Propuesta", "Etapa"].includes(f) ? 'full-width' : ''}">
                                <div class="label-ficha">${f.replace(/_/g, ' ')}</div>
                                <div class="valor-ficha">${formatearValor(val, f)}</div>
                            </div>`;
                });
            } else {
                html += `<div class="msg-pendiente">Sin informe pedagógico</div>`;
            }
            html += `</div></div>`;
            contenedor.insertAdjacentHTML("beforeend", html);
        });
    } catch (e) {
        contenedor.innerHTML = `<div class="msg-pendiente">Error: ${e.message}</div>`;
    }
}

function formatearValor(val, campo) {
    if (!val) return '---';
    if (Array.isArray(val)) val = val[1];
    if (typeof val === 'number' && val > 1000000000) return new Date(val * 1000).toLocaleDateString('es-AR');
    if (typeof val === 'string' && val.includes('-') && !isNaN(Date.parse(val))) {
        const d = new Date(val); d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        return d.toLocaleDateString('es-AR');
    }
    if (String(val).startsWith("http")) return `<a href="${val}" target="_blank">VER ${campo === "Evidencia" ? "EVIDENCIA" : "LINK"} 🔗</a>`;
    return val;
}

function renderCharts(records, prefix = 'chart') {
    const cancelMap = {};
    let totalCanc = 0;
    records.forEach(r => {
        const est = (r.Estado_Clase || '').trim();
        if (est.toLowerCase() !== 'dictada') {
            cancelMap[est] = (cancelMap[est] || 0) + 1;
            totalCanc++;
        }
    });

    const idCanc = prefix + 'Cancelaciones';
    if (chartInstances[idCanc]) chartInstances[idCanc].destroy();
    chartInstances[idCanc] = new Chart(document.getElementById(idCanc).getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(cancelMap).length ? Object.keys(cancelMap) : ['Sin Cancelaciones'],
            datasets: [{
                data: Object.values(cancelMap).length ? Object.values(cancelMap) : [1],
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '75%',
            plugins: { legend: { position: 'bottom' }, centerText: { text: totalCanc, subtext: 'CANCELADAS' } }
        }
    });

    const periodosMap = {};
    records.forEach(r => {
        if (!r.Clase) return;
        const d = new Date(r.Clase);
        const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!periodosMap[p]) periodosMap[p] = { originals: 0, dictadas: 0 };
        
        const tipo = (r.Tipo_de_Clase || '').toLowerCase().trim();
        const estado = (r.Estado_Clase || '').toLowerCase().trim();
        const isOriginal = tipo === 'original';
        const isRecuperacion = tipo.includes('recuperaci') || tipo.includes('recuperada');

        if (isOriginal) periodosMap[p].originals++;
        if (estado === 'dictada' && (isOriginal || isRecuperacion)) periodosMap[p].dictadas++;
    });

    const sortedP = Object.keys(periodosMap).sort();
    const dataRend = sortedP.map(p => periodosMap[p].originals > 0 ? (periodosMap[p].dictadas / periodosMap[p].originals * 100).toFixed(1) : 0);

    const idRend = prefix + 'Rendimiento';
    if (chartInstances[idRend]) chartInstances[idRend].destroy();
    chartInstances[idRend] = new Chart(document.getElementById(idRend).getContext('2d'), {
        type: 'bar',
        data: { labels: sortedP, datasets: [{ label: '% Rendimiento', data: dataRend, backgroundColor: '#16B378', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
    });

    const motivosMap = {};
    records.forEach(r => { if (r.Motivo) motivosMap[r.Motivo] = (motivosMap[r.Motivo] || 0) + 1; });
    const sortedMotivos = Object.entries(motivosMap).sort((a, b) => b[1] - a[1]);

    const idMot = prefix + 'Motivos';
    if (chartInstances[idMot]) chartInstances[idMot].destroy();
    chartInstances[idMot] = new Chart(document.getElementById(idMot).getContext('2d'), {
        type: 'bar',
        data: { labels: sortedMotivos.map(m => m[0]), datasets: [{ label: 'Cantidad', data: sortedMotivos.map(m => m[1]), backgroundColor: '#f59e0b', borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function animateValue(id, end, duration = 500) {
    const obj = document.getElementById(id);
    const start = parseInt(obj.textContent) || 0;
    if (start === end) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.textContent = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}
