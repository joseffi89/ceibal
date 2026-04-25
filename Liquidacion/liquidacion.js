let allRecords = [];
let periodDetails = {};
let liqStatusMap = {};
let liqTotalMap = {};
let selectedPeriod = null;
let currentDR = null;
let isInitialized = false;
let isLoading = false;

const LIQ_INFO = {
  cuit: "30-71923076-4",
  razonSocial: "FUNDACIÓN PROGRAMAR",
  condicionIva: "Exento"
};

const eyeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

function formatDate(val) {
  if (!val) return "";
  const date = new Date(val * 1000);
  return date.toLocaleDateString('es-AR');
}

function buildIDLiq(periodo, dr) {
  return `${periodo} - ${dr}`;
}

async function loadData() {
  if (isLoading) return;
  isLoading = true;

  try {
    const tableData = await grist.docApi.fetchTable('Periodos_LIQ');
    periodDetails = {};
    const idToNameMap = {};

    for (let i = 0; i < tableData.id.length; i++) {
      const pName = tableData.Periodo[i];
      const pId = tableData.id[i];

      periodDetails[pName] = {
        id: pId,
        desde: tableData.Desde[i],
        hasta: tableData.Hasta[i],
        habilitado: tableData.Habilitar_a_DR[i],
        tipoCambio: tableData.Tipo_de_cambio ? tableData.Tipo_de_cambio[i] : 0
      };

      idToNameMap[pId] = pName;
    }

    const tableLiq = await grist.docApi.fetchTable('Liquidaciones');
    liqTotalMap = {};
    for (let i = 0; i < tableLiq.id.length; i++) {
      const idLiq = tableLiq.ID_Liq ? tableLiq.ID_Liq[i] : null;
      if (idLiq) {
        liqTotalMap[idLiq] = {
          id: tableLiq.id[i],
          total: tableLiq.Importe_Total_USD ? tableLiq.Importe_Total_USD[i] : 0
        };
      }
    }

    const tableSeg = await grist.docApi.fetchTable('Seguimiento_Liquidaciones');
    liqStatusMap = {};
    for (let i = 0; i < tableSeg.id.length; i++) {
      const idLiq = tableSeg.ID_Liq ? tableSeg.ID_Liq[i] : null;
      if (idLiq) {
        liqStatusMap[idLiq] = {
          id: tableSeg.id[i],
          estado: tableSeg.Estado[i] || "Pendiente Confirmación DR",
          observaciones: tableSeg.Observaciones ? tableSeg.Observaciones[i] : ""
        };
      }
    }

    isInitialized = true;

  } catch (err) {
    console.error("❌ Error en loadData:", err);
  } finally {
    isLoading = false;
  }
}

function getStatusColor(status) {
  if (status.includes('Pendiente')) return 'var(--status-pending)';
  if (status === 'Confirmada (No facturar)' || status === 'Confirmada (No Facturar)') return 'var(--status-dark-gray)';
  return 'var(--grist-green)';
}

function getStatus(periodName, dr) {
  const idLiq = buildIDLiq(periodName, dr);
  const pInfo = periodDetails[periodName];

  if (!pInfo) {
    return "Pendiente Confirmación DR";
  }

  const record = liqStatusMap[idLiq];

  if (!record || !record.estado) {
    return "Pendiente Confirmación DR";
  }

  const estado = record.estado;

  if (estado === "Confirmada (No facturar)" && pInfo.tipoCambio && pInfo.tipoCambio > 0) {
    return "Factura Solicitada";
  }

  return estado;
}

function renderSidebar() {
  if (!currentDR || !isInitialized) return;

  const list = document.getElementById('period-list');
  const validPeriods = [...new Set(allRecords
    .filter(r => r.Periodo && r.Validacion_LIQ === "Validada" && periodDetails[r.Periodo]?.habilitado)
    .map(r => r.Periodo)
  )].sort((a, b) => b.localeCompare(a));

  list.innerHTML = '';
  validPeriods.forEach(p => {
    const status = getStatus(p, currentDR);
    const badgeColor = getStatusColor(status);
    const div = document.createElement('div');
    const isActive = selectedPeriod === p;
    div.className = `period-item ${isActive ? 'active' : ''}`;

    if (isActive) {
      div.style.color = badgeColor;
      div.style.borderRightColor = badgeColor;
    }

    div.innerHTML = `<span>${p}</span><span class="period-badge" style="color:${badgeColor}">${status}</span>`;
    div.onclick = () => { selectedPeriod = p; renderSidebar(); renderDetail(p); };
    list.appendChild(div);
  });
}

async function handleAction(type) {
  const pInfo = periodDetails[selectedPeriod];
  if (!pInfo || !currentDR) { alert("Error: período o DR no encontrado"); return; }

  const idLiq = buildIDLiq(selectedPeriod, currentDR);

  let estado = type === 'confirm' ? "Confirmada (No facturar)" : "Pendiente de Aprobación";
  let obs = type === 'suggest' ? document.getElementById('obs-text')?.value || "" : "";

  if (type === 'suggest' && !obs) { alert("Por favor, indique los cambios necesarios."); return; }

  try {
    // Solo gestionamos la tabla de Seguimiento_Liquidaciones
    const existingSeg = liqStatusMap[idLiq];
    const segFields = { Periodo: pInfo.id, Estado: estado, Observaciones: obs };

    if (existingSeg?.id) {
      await grist.docApi.applyUserActions([["UpdateRecord", "Seguimiento_Liquidaciones", existingSeg.id, segFields]]);
    } else {
      await grist.docApi.applyUserActions([["AddRecord", "Seguimiento_Liquidaciones", null, segFields]]);
    }

    // Actualizamos solo el mapa de estados
    liqStatusMap[idLiq] = { id: existingSeg?.id || null, estado: estado, observaciones: obs };

    if (type === 'suggest') {
      const obsContainer = document.getElementById('obs-container');
      if (obsContainer) obsContainer.style.display = 'none';
      const obsText = document.getElementById('obs-text');
      if (obsText) obsText.value = '';
    }

    renderDetail(selectedPeriod);
    renderSidebar();

    setTimeout(() => {
      loadData().then(() => {
        renderDetail(selectedPeriod);
        renderSidebar();
      });
    }, 2000);

  } catch (e) {
    console.error("❌ Error:", e);
    alert("Error al guardar seguimiento: " + e.message);
  }
}

// 🔑 Función modificada - Validación Coord solo para clases con coordinación
function openDetailModal(conceptoFull) {
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title-text');
  title.innerText = `${conceptoFull} (${selectedPeriod})`;

  const clases = allRecords.filter(r => {
    if (r.Periodo !== selectedPeriod || r.Validacion_LIQ !== "Validada") return false;
    let cType = r.Estado_Clase;
    if (r.Estado_Clase === "Dictada") {
      cType = (r.Validacion_Coord_Previa === "Validada") ? "Dictada c/ coordinación" : "Dictada s/ coordinación";
    }
    return cType === conceptoFull;
  });

  // 🔑 Verificar si este concepto es de coordinación
  const esCoordinacion = conceptoFull.includes('coordinación');

  // 🔑 Tabla con columna Validación Coord (solo visible si es c/ o s/ coordinación)
  let html = `<table><thead><tr>
    <th>ID Clase</th>
    <th>Día</th>
    <th>Horario</th>
    <th>Validación LIQ</th>
    ${esCoordinacion ? '<th>Validación Coord</th>' : ''}
  </tr></thead><tbody>`;

  clases.forEach(c => {
    // 🔑 Solo mostrar badge si es clase con coordinación
    const coordCell = esCoordinacion ? (() => {
      const coordBadge = c.Validacion_Coord_Previa === "Validada"
        ? `<span class="coord-validation validada">✓ Validada</span>`
        : `<span class="coord-validation no-validada">✗ No validada</span>`;
      return `<td>${coordBadge}</td>`;
    })() : '';

    html += `<tr>
      <td><strong>#${c.ID_Clase || 'N/A'}</strong></td>
      <td>${c.Dia || '-'}</td>
      <td>${c.Hora_Desde || '-'}</td>
      <td>${c.Validacion_LIQ || '-'}</td>
      ${coordCell}
    </tr>`;
  });
  body.innerHTML = html + `</tbody></table>`;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

function renderDetail(period) {
  if (!currentDR) {
    document.getElementById('detail-view').innerHTML = '<div class="empty-state"><h3>No hay DR seleccionado</h3></div>';
    return;
  }

  const infoP = periodDetails[period];
  const status = getStatus(period, currentDR);
  const filtered = allRecords.filter(r => r.Periodo === period && r.Validacion_LIQ === "Validada");

  const tieneTipoCambio = (infoP.tipoCambio && infoP.tipoCambio > 0);
  const simboloMoneda = tieneTipoCambio ? "$" : "USD ";
  const etiquetaTotal = tieneTipoCambio ? "TOTAL NETO A LIQUIDAR" : "TOTAL NETO A LIQUIDAR (USD)";

  const readonly = status !== "Pendiente Confirmación DR";

  const resumen = {};
  let granTotal = 0;

  filtered.forEach(r => {
    let conceptoDisplay = r.Estado_Clase;
    if (r.Estado_Clase === "Dictada") {
      conceptoDisplay = (r.Validacion_Coord_Previa === "Validada") ? "Dictada c/ coordinación" : "Dictada s/ coordinación";
    }
    const key = `${conceptoDisplay}-${r.Importe_Pesos}`;
    if (!resumen[key]) resumen[key] = { concepto: conceptoDisplay, unitario: r.Importe_Pesos || 0, cantidad: 0, subtotal: 0 };
    resumen[key].cantidad++;
    resumen[key].subtotal += (r.Importe_Pesos || 0);
    granTotal += (r.Importe_Pesos || 0);
  });

  const billingBanner = status === "Factura Solicitada" ? `
      <div class="billing-banner">
        <div class="billing-banner-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
        </div>
        <div class="billing-banner-content">
          <div class="billing-banner-text">
            Realizar la factura con el detalle indicado y enviar a 
            <a href="mailto:clasespc@fundacionprogramar.org?subject=Factura ${period} - ${currentDR}" class="billing-email">clasespc@fundacionprogramar.org</a>
          </div>
          <div class="billing-banner-text" style="margin-top: 8px; font-size: 0.85rem;">
            <strong>ASUNTO:</strong> Factura ${period} - ${currentDR}
          </div>
        </div>
      </div>
    ` : '';

  let html = `
    <div class="action-bar">
      <div class="current-status">
          <span class="status-label">Estado Actual</span>
          <span class="status-value" style="color: ${getStatusColor(status)}">${status}</span>
      </div>
      ${!readonly ? `
        <div class="buttons-group">
          <button class="btn-circle btn-suggest" onclick="document.getElementById('obs-container').style.display='block'" title="Sugerir Cambios"><i class="fa-solid fa-pencil"></i></button>
          <button class="btn-circle btn-confirm" onclick="handleAction('confirm')" title="Confirmar Liquidación"><i class="fa-solid fa-check"></i></button>
        </div>
      ` : ''}
    </div>
    
    ${billingBanner}

    <div id="obs-container" class="card" style="border-radius:0; border-top:none;">
      <textarea id="obs-text" placeholder="Describa los cambios sugeridos..."></textarea>
      <div style="display:flex; gap:10px; margin-top:10px;">
          <button onclick="handleAction('suggest')" style="background:var(--grist-blue); color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">Enviar Sugerencia</button>
          <button onclick="document.getElementById('obs-container').style.display='none'" style="background:#ccc; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">Cancelar</button>
      </div>
    </div>

    <div class="card" style="${!readonly ? 'border-top-left-radius:0; border-top-right-radius:0;' : ''}">
      <div class="liq-header">
        <div class="company-data">
          <div class="company-name">${LIQ_INFO.razonSocial}</div>
          <div class="company-detail"><strong>CUIT:</strong> ${LIQ_INFO.cuit}</div>
          <div class="company-detail"><strong>IVA:</strong> ${LIQ_INFO.condicionIva}</div>
          <div class="company-detail"><strong>PERÍODO:</strong> ${formatDate(infoP.desde)} - ${formatDate(infoP.hasta)}</div>
          <div class="company-detail"><span class="dr-badge"><i class="fa fa-user" aria-hidden="true"></i> ${currentDR}</span></div>
        </div>
        <div class="period-summary">
          <div class="period-label">Detalle de Liquidación</div>
          <div class="period-value">${period}</div>
        </div>
      </div>

      <table>
        <thead><tr><th class="qty">Cantidad</th><th>Concepto / Estado</th><th class="currency">Unitario</th><th class="currency">Subtotal</th></tr></thead>
        <tbody>
          ${Object.values(resumen).map(item => `
            <tr>
              <td class="qty">${item.cantidad}</td>
              <td>${item.concepto} <span class="view-detail-btn" onclick="openDetailModal('${item.concepto}')">${eyeIcon}</span></td>
              <td class="currency">${simboloMoneda}${item.unitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
              <td class="currency">${simboloMoneda}${item.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="3" style="text-align: right; padding-right: 20px;">${etiquetaTotal}</td>
            <td class="currency">${simboloMoneda}${granTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('detail-view').innerHTML = html;
  document.getElementById('detail-view').className = '';
}

// Inicialización de Grist
grist.ready({ requiredAccess: 'full' });

let debounceTimer = null;
grist.onRecords((records) => {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    allRecords = records;

    if (records.length > 0 && records[0].DR_a_cargo_Apellido_y_Nombre) {
      const newDR = records[0].DR_a_cargo_Apellido_y_Nombre;
      if (currentDR !== newDR) {
        currentDR = newDR;
        selectedPeriod = null;
      }
    }

    await loadData();
    renderSidebar();
    if (selectedPeriod) renderDetail(selectedPeriod);
  }, 300);
});