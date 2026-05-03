let periodsData = [];

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
      periodsData.push({ id: pId, name: pName });

      const option = document.createElement('option');
      option.value = pId;
      option.textContent = pName;
      select.appendChild(option);
    }
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
    const dispData = await grist.docApi.fetchTable('Disponibilidad');
    
    // 1.1 Mapear ID de DR a su nombre desde la propia tabla Agenda
    const drIdToName = {};
    if (agendaData.DR_a_cargo && agendaData.DR_a_cargo_Apellido_y_Nombre) {
      agendaData.id.forEach((id, i) => {
        const drId = Array.isArray(agendaData.DR_a_cargo[i]) ? agendaData.DR_a_cargo[i][0] : agendaData.DR_a_cargo[i];
        let drName = agendaData.DR_a_cargo_Apellido_y_Nombre[i];
        if (Array.isArray(drName)) drName = drName[1];
        if (drId && drName) drIdToName[drId] = drName;
      });
    }

    // 1.2 Contar disponibilidad por nombre de DR
    const dispCountByName = {};
    if (dispData.DR_Apellido_y_Nombre) {
      dispData.DR_Apellido_y_Nombre.forEach((name, i) => {
        let n = name;
        if (Array.isArray(n)) n = n[1];
        // Solo contar si está Habilitado
        const isHabilitado = dispData.Habilitado ? dispData.Habilitado[i] === "Habilitado" : true;
        if (n && isHabilitado) {
          dispCountByName[n] = (dispCountByName[n] || 0) + 1;
        }
      });
    }

    // 2. Agrupar totales por DR
    const totalsByDR = {};

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
      const dispCount = dispCountByName[drName] || 0;
      let adicional = 0;

      if (periodLower.includes("marzo")) {
        // Marzo: Mínimo 5 horas
        if (dispCount >= 5) adicional = 28;
      } else if (periodLower.includes("abril") || periodLower.includes("mayo") || periodLower.includes("junio") || 
                 periodLower.includes("julio") || periodLower.includes("agosto") || periodLower.includes("septiembre") || 
                 periodLower.includes("setiembre") || periodLower.includes("octubre")) {
        // Abril a Octubre: Mínimo 8 horas
        if (dispCount >= 8) adicional = 28;
      } else {
        // Noviembre en adelante o no especificado: No se cobra
        adicional = 0;
      }

      actions.push(["AddRecord", "Liquidaciones", null, {
        Periodo: parseInt(periodId),
        DR: parseInt(drId),
        Importe_Total_USD: totalsByDR[drId] + adicional
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