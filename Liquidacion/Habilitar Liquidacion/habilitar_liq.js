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
    // 1. Traer datos de la tabla Agenda (donde están las clases y validaciones)
    const agendaData = await grist.docApi.fetchTable('Agenda');
    
    // 2. Agrupar totales por DR usando la lógica del script anterior
    // Filtramos por Período y Validacion_LIQ === "Validada"
    const totalsByDR = {};

    for (let i = 0; i < agendaData.id.length; i++) {
      const recPeriod = agendaData.Periodo[i];
      const isValidated = agendaData.Validacion_LIQ[i] === "Validada";
      
      // Verificamos si el registro pertenece al período seleccionado (por nombre o ID según referencia)
      if (recPeriod === periodName && isValidated) {
        const drRef = agendaData.DR_a_cargo[i]; // Esto suele ser el ID de la tabla DRs
        const importe = agendaData.Importe_USD[i] || 0;

        if (!totalsByDR[drRef]) {
          totalsByDR[drRef] = 0;
        }
        totalsByDR[drRef] += importe;
      }
    }

    // 3. Preparar las acciones para Grist
    const actions = [];

    // Acción A: Poner Habilitar_a_DR en True en la tabla Periodos_LIQ
    actions.push(["UpdateRecord", "Periodos_LIQ", parseInt(periodId), {
      Habilitar_a_DR: true
    }]);

    // Acción B: Generar registros en la tabla Liquidaciones por cada DR encontrado
    for (const drId in totalsByDR) {
      actions.push(["AddRecord", "Liquidaciones", null, {
        Periodo: parseInt(periodId),
        DR: parseInt(drId), // Asumiendo que es un campo de referencia
        Importe_Total_USD: totalsByDR[drId]
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