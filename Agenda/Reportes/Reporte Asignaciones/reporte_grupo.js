let allRecords = [];

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar widget de Grist
    grist.ready({
        requiredAccess: 'read table'
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
});

function updateData(records) {
    // Grist puede enviar los registros con la estructura { id, fields: {...} } si no se mapean columnas explícitamente
    allRecords = (records || [])
        .map(r => r.fields ? { id: r.id, ...r.fields } : r)
        .filter(r => (r.Estado_Clase || '').toString().trim() !== '');
    
    renderTable();
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
        const isRecuperacion = tipoClase.includes('recuperaci') || tipoClase.includes('recuperada');
        const isOriginal = tipoClase.includes('original') || (!isRecuperacion);

        if (isOriginal) originales++;
        if (estado === 'dictada') dictadas++;
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
        const idGrupo = r.ID_Grupo || `${r.Departamento || ''}-${r.No_Escuela || ''}-${r.Grupo || ''}`;
        
        if (!gruposMap[idGrupo]) {
            gruposMap[idGrupo] = {
                idGrupo: idGrupo,
                docente: r.DR_a_cargo_Apellido_y_Nombre || '-',
                mentor: r.Mentor_a || '-',
                responsable: r.Resp_Gestion || '-',
                clases: []
            };
        }
        gruposMap[idGrupo].clases.push(r);
    });

    // 2. Procesar status y prioridades
    let gruposArray = Object.values(gruposMap).map(g => {
        const statusData = processGroupStatus(g.clases);
        return { ...g, ...statusData };
    });

    // 3. Filtrar
    if (searchFilter) {
        gruposArray = gruposArray.filter(g => g.idGrupo.toLowerCase().includes(searchFilter));
    }
    if (estadoFilter) {
        gruposArray = gruposArray.filter(g => g.priority.toString() === estadoFilter);
    }
    
    // 4. Ordenar por prioridad de estado (Rojo -> Amarillo -> Naranja -> Verde)
    gruposArray.sort((a, b) => a.priority - b.priority);

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
        `;
        tbody.appendChild(tr);
    });
    
    if (gruposArray.length > 500) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" style="text-align: center; color: #64748b; font-size: 13px;">Mostrando 500 de ${gruposArray.length} grupos. Utilice los filtros para refinar la búsqueda.</td>`;
        tbody.appendChild(tr);
    }
}

function updateKPIs(records) {
    const totalClases = records.length;
    let totalDictada = 0;
    let totalCanceladas = 0;
    let totalRecuperacion = 0;
    let totalOriginales = 0;

    records.forEach(r => {
        const estado = (r.Estado_Clase || '').toString().toLowerCase().trim();
        const tipoClase = (r.Tipo_de_Clase || '').toString().toLowerCase().trim();
        
        const isRecuperacion = tipoClase.includes('recuperaci') || tipoClase.includes('recuperada');
        const isOriginal = tipoClase.includes('original') || (!isRecuperacion);

        if (estado === 'dictada') {
            totalDictada++;
        } else {
            totalCanceladas++;
        }
        
        if (isRecuperacion) {
            totalRecuperacion++;
        }
        
        if (isOriginal) {
            totalOriginales++;
        }
    });

    const tasaRecuperacion = totalCanceladas > 0 ? ((totalRecuperacion / totalCanceladas) * 100).toFixed(1) : 0;
    const tasaDictadas = totalOriginales > 0 ? ((totalDictada / totalOriginales) * 100).toFixed(1) : 0;

    animateValue('kpi-total', totalClases);
    animateValue('kpi-dictadas', totalDictada);
    animateValue('kpi-canceladas', totalCanceladas);
    document.getElementById('kpi-recuperacion').textContent = `${tasaRecuperacion}%`;
    document.getElementById('kpi-tasa-dictadas').textContent = `${tasaDictadas}%`;
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
