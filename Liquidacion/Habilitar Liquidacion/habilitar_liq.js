let periodsData = [];

function normalizeRefValue(value) {
  return Array.isArray(value) ? value[1] : value;
}

function normalizeRefId(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeKey(value) {
  const normalized = normalizeRefValue(value);
  return normalized === null || normalized === undefined ? "" : String(normalized).trim().toLowerCase();
}

function getColumnValue(table, columnName, index) {
  return table && table[columnName] ? table[columnName][index] : undefined;
}

function getFirstColumnValue(table, columnNames, index) {
  for (const columnName of columnNames) {
    const value = getColumnValue(table, columnName, index);
    if (value !== undefined) return value;
  }
  return undefined;
}

function isValue(value, expectedValues) {
  const normalized = normalizeRefValue(value);
  if (typeof normalized === "boolean") return expectedValues.includes(normalized);
  return expectedValues.includes(String(normalized || "").trim().toLowerCase());
}

function getDRNameFromRow(table, index) {
  return getFirstColumnValue(table, [
    "DR_Apellido_y_Nombre",
    "DR_a_cargo_Apellido_y_Nombre",
    "DR_a_cargo",
    "Docente_Remoto",
    "DR"
  ], index);
}

function buildInfrastructureCountMap(assignmentsData, availabilityData) {
  const countMap = {};

  (assignmentsData.id || []).forEach((_, i) => {
    const estadoGrupo = getColumnValue(assignmentsData, "Estado_Grupo", i);
    if (!isValue(estadoGrupo, ["asignado"])) return;

    const drKey = normalizeKey(getDRNameFromRow(assignmentsData, i));
    if (drKey) countMap[drKey] = (countMap[drKey] || 0) + 1;
  });

  (availabilityData.id || []).forEach((_, i) => {
    const drKey = normalizeKey(getDRNameFromRow(availabilityData, i));
    if (!drKey) return;

    const habilitado = getFirstColumnValue(availabilityData, [
      "Habilitado",
      "Estado_Habilitacion",
      "Estado_de_Habilitacion"
    ], i);
    const libre = getFirstColumnValue(availabilityData, [
      "Libre",
      "Estado",
      "Estado_Disponibilidad",
      "Estado_Horario",
      "Estado_del_Horario",
      "Situacion",
      "Situacion_Horario"
    ], i);

    const isHabilitado = habilitado === undefined ? true : isValue(habilitado, ["habilitado", true]);
    const isLibre = isValue(libre, ["libre", true]);

    if (isHabilitado && isLibre) countMap[drKey] = (countMap[drKey] || 0) + 1;
  });

  return countMap;
}

// Inicialización de Grist
grist.ready({ requiredAccess: 'full' });

// Cargar los períodos al inicio
async function fetchPeriods() {
  try {
    const tableData = await grist.docApi.fetchTable('Periodos_LIQ');
    const select = document.getElementById('period-select');
    select.innerHTML = '<option value="">Elija un período...</option>';

    periodsData = [];
    for (let i = 0; i < tableData.id.length; i++) {
      const pId = tableData.id[i];
      const pName = tableData.Periodo[i];
      const periodoNum = tableData.Periodo_Num ? Number(tableData.Periodo_Num[i]) : null;
      periodsData.push({ id: pId, name: pName, periodoNum });
    }

    periodsData.sort((a, b) => {
      const hasANum = Number.isFinite(a.periodoNum);
      const hasBNum = Number.isFinite(b.periodoNum);

      if (hasANum && hasBNum) return a.periodoNum - b.periodoNum;
      if (hasANum) return -1;
      if (hasBNum) return 1;
      return a.name.localeCompare(b.name);
    });

    periodsData.forEach(period => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.name;
      select.appendChild(option);
    });
  } catch (err) {
    showStatus("Error al cargar períodos", "error");
  }
}

fetchPeriods();

async function processLiquidation() {
  const periodId = document.getElementById('period-select').value;
  const periodName = periodsData.find(p => p.id == periodId)?.name;
  const btn = document.getElementById('enable-btn');

  if (!periodId) {
    showStatus("Seleccione un período válido", "error");
    return;
  }

  btn.disabled = true;
  showStatus("Procesando...", "");

  try {
    // 1. Traer datos necesarios
    const agendaData = await grist.docApi.fetchTable('Agenda');
    const asignacionesData = await grist.docApi.fetchTable('Asignaciones').catch(() => ({ id: [] }));
    const dispData = await grist.docApi.fetchTable('Disponibilidad').catch(() => ({ id: [] }));
    
    // 1.1 Mapear ID de DR a su nombre desde la propia tabla Agenda
    const drIdToName = {};
    if (agendaData.DR_a_cargo && agendaData.DR_a_cargo_Apellido_y_Nombre) {
      agendaData.id.forEach((id, i) => {
        const drId = normalizeRefId(agendaData.DR_a_cargo[i]);
        const drName = normalizeRefValue(agendaData.DR_a_cargo_Apellido_y_Nombre[i]);
        if (drId && drName) drIdToName[drId] = drName;
      });
    }

    // 1.2 Contar asignaciones Asignadas + horarios Libres y Habilitados por DR
    const infrastructureCountByName = buildInfrastructureCountMap(asignacionesData, dispData);

    // 2. Agrupar totales por DR
    const totalsByDR = {};
    const isMentorByDR = {};

    for (let i = 0; i < agendaData.id.length; i++) {
      const recPeriod = agendaData.Periodo[i];
      const isValidated = agendaData.Validacion_LIQ[i] === "Validada";
      
      if (recPeriod === periodName && isValidated) {
        const drRef = Array.isArray(agendaData.DR_a_cargo[i]) ? agendaData.DR_a_cargo[i][0] : agendaData.DR_a_cargo[i];
        const importe = agendaData.Importe_USD[i] || 0;

        if (!totalsByDR[drRef]) {
          totalsByDR[drRef] = 0;
        }
        totalsByDR[drRef] += importe;

        // Detectar si es mentor
        if (agendaData.Es_Mentor_ && agendaData.Es_Mentor_[i]) {
          isMentorByDR[drRef] = true;
        }
      }
    }

    // 3. Preparar las acciones para Grist
    const actions = [];

    // Acción A: Habilitar período
    actions.push(["UpdateRecord", "Periodos_LIQ", parseInt(periodId), {
      Habilitar_a_DR: true
    }]);

    // Lógica de mes para el adicional
    const periodLower = (periodName || "").toLowerCase();

    // Acción B: Generar liquidaciones
    for (const drId in totalsByDR) {
      const drName = drIdToName[drId];
      const infrastructureCount = infrastructureCountByName[normalizeKey(drName)] || 0;
      let adicional = 0;

      if (periodLower.includes("marzo")) {
        // Marzo: Mínimo 5 horas
        if (infrastructureCount >= 5) adicional = 28;
      } else if (periodLower.includes("abril") || periodLower.includes("mayo") || periodLower.includes("junio") || 
                 periodLower.includes("julio") || periodLower.includes("agosto") || periodLower.includes("septiembre") || 
                 periodLower.includes("setiembre") || periodLower.includes("octubre")) {
        // Abril a Octubre: Mínimo 8 horas
        if (infrastructureCount >= 8) adicional = 28;
      } else {
        // Noviembre en adelante o no especificado: No se cobra
        adicional = 0;
      }

      const mentorAdicional = isMentorByDR[drId] ? 280 : 0;

      actions.push(["AddRecord", "Liquidaciones", null, {
        Periodo: parseInt(periodId),
        DR: parseInt(drId),
        Importe_Total_USD: totalsByDR[drId] + adicional + mentorAdicional
      }]);
    }

    // 4. Ejecutar todas las acciones juntas
    if (actions.length > 1) {
      await grist.docApi.applyUserActions(actions);
      showStatus(`¡Éxito! Período habilitado y ${Object.keys(totalsByDR).length} liquidaciones generadas.`, "success");
    } else {
      showStatus("No se encontraron registros validados para este período.", "error");
    }

  } catch (err) {
    console.error(err);
    showStatus("Error al procesar: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = type;
}
