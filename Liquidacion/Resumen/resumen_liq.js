let allRecords = [];
let selectedPeriodo = null;

const TABLE_NAME = 'Agenda_summary_DR_a_cargo_Periodo_Periodo_Num';


/* =========================================================
   INICIALIZACIÓN GRIST
========================================================= */

grist.ready({
  requiredAccess: 'read table'
});


/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */

function getValue(value) {

  // Normaliza referencias de Grist
  if (Array.isArray(value)) {
    return value[1];
  }

  return value;
}


function toNumber(value) {

  const num = Number(value);

  return Number.isFinite(num)
    ? num
    : 0;
}


function formatUSD(value) {

  return `USD ${toNumber(value).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

}


function formatPesos(value) {

  return `$ ${toNumber(value).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

}


/* =========================================================
   CONVERTIR TABLA DE GRIST A REGISTROS
========================================================= */

function tableToRecords(table) {

  if (!table || !table.id) {
    return [];
  }

  const records = [];

  for (let i = 0; i < table.id.length; i++) {

    const record = {};

    Object.keys(table).forEach(columnName => {

      record[columnName] = table[columnName][i];

    });

    records.push(record);

  }

  return records;

}


/* =========================================================
   CARGAR DATOS DESDE LA TABLA ESPECIFICA
========================================================= */

async function loadData() {

  try {

    const table = await grist.docApi.fetchTable(TABLE_NAME);

    console.log(
      'Tabla consultada:',
      TABLE_NAME
    );

    console.log(
      'Columnas disponibles:',
      Object.keys(table)
    );

    console.log(
      'Total_USD:',
      table.Total_USD
    );

    console.log(
      'Total_Pesos:',
      table.Total_Pesos
    );

    allRecords = tableToRecords(table);

    console.log(
      'Registros procesados:',
      allRecords
    );

    renderDashboard();

  } catch (error) {

    console.error(
      'Error cargando la tabla:',
      error
    );

    const container =
      document.getElementById('period-container');

    if (container) {

      container.innerHTML = `
        <div class="empty-state">
          Error al cargar los datos.
        </div>
      `;

    }

  }

}






/* =========================================================
   GENERAR RESUMEN POR PERÍODO
========================================================= */

function buildPeriodSummary(records) {

  const resumen = {};

  records.forEach(record => {

    const periodoNum =
      getValue(record.Periodo_Num);

    const periodoNombre =
      getValue(record.Periodo) ||
      'Sin período';

    const key =
      periodoNum ||
      periodoNombre;


    if (!resumen[key]) {

      resumen[key] = {

        periodo: periodoNombre,

        periodoNum: periodoNum,

        totalUSD: 0,

        totalPesos: 0,

        dictadasConCoordinacion: 0,

        dictadasSinCoordinacion: 0,

        canceladasSinAnticipacion: 0,

        canceladasFactoresExternos: 0

      };

    }


    const item =
      resumen[key];


    /* =====================================================
       IMPORTES
    ===================================================== */

    item.totalUSD +=
      toNumber(record.Total_USD);

    item.totalPesos +=
      toNumber(record.Total_Pesos);


/* =====================================================
   CANTIDADES
   Campos de la tabla summary
===================================================== */

item.dictadasConCoordinacion +=
  toNumber(record.Dictadas_c_coord ?? record.$Dictadas_c_coord);

item.dictadasSinCoordinacion +=
  toNumber(record.Dictadas_s_coord ?? record.$Dictadas_s_coord);

item.canceladasSinAnticipacion +=
  toNumber(record.Cancelada_s_antic_);

item.canceladasFactoresExternos +=
  toNumber(record.Cancelada_fact_ext);

  });


  return Object.values(resumen);

}


/* =========================================================
   ORDENAR PERÍODOS
========================================================= */

function sortPeriods(periods) {

  return periods.sort((a, b) => {

    const numA =
      Number(a.periodoNum);

    const numB =
      Number(b.periodoNum);


    if (
      Number.isFinite(numA) &&
      Number.isFinite(numB)
    ) {

      return numB - numA;

    }


    return String(b.periodo)
      .localeCompare(
        String(a.periodo),
        'es',
        {
          numeric: true
        }
      );

  });

}


/* =========================================================
   RENDER DASHBOARD
========================================================= */

function renderDashboard() {

  const container =
    document.getElementById(
      'period-container'
    );


  if (!container) {
    return;
  }


  if (!allRecords.length) {

    container.innerHTML = `
      <div class="empty-state">
        No hay registros para mostrar.
      </div>
    `;

    return;

  }


  /* =====================================================
     FILTRO POR PERÍODO SELECCIONADO
  ===================================================== */

  let filteredRecords =
    allRecords;


  if (selectedPeriodo) {

    filteredRecords =
      allRecords.filter(record => {

        const periodoRecord =
          getValue(
            record.Periodo
          );

        return String(periodoRecord) ===
          String(selectedPeriodo);

      });

  }


  console.log(
    '📅 Período seleccionado:',
    selectedPeriodo
  );


  console.log(
    '🔎 Registros filtrados:',
    filteredRecords
  );


  if (!filteredRecords.length) {

    container.innerHTML = `
      <div class="empty-state">
        No hay registros para el período seleccionado.
      </div>
    `;

    return;

  }


  const periodos =
    sortPeriods(
      buildPeriodSummary(
        filteredRecords
      )
    );


  container.innerHTML =
    periodos
      .map(item => `

        <div class="period-card">


          <div class="period-header">

            <div class="period-title">

              Período ${item.periodo}

            </div>

          </div>


          <div class="metrics-grid">


            <!-- TOTAL USD -->

            <div class="metric usd">

              <div class="metric-label">
                Total USD
              </div>

              <div class="metric-value">

                ${formatUSD(
                  item.totalUSD
                )}

              </div>

            </div>


            <!-- TOTAL PESOS -->

            <div class="metric pesos">

              <div class="metric-label">
                Total $
              </div>

              <div class="metric-value">

                ${formatPesos(
                  item.totalPesos
                )}

              </div>

            </div>


            <!-- DICTADAS CON COORDINACIÃ“N -->

            <div class="metric dictadas">

              <div class="metric-label">
                Dictadas c/ coord.
              </div>

              <div class="metric-value">

                ${item.dictadasConCoordinacion
                  .toLocaleString(
                    'es-AR'
                  )}

              </div>

            </div>


            <!-- DICTADAS SIN COORDINACIÃ“N -->

            <div class="metric dictadas">

              <div class="metric-label">
                Dictadas s/ coord.
              </div>

              <div class="metric-value">

                ${item.dictadasSinCoordinacion
                  .toLocaleString(
                    'es-AR'
                  )}

              </div>

            </div>


            <!-- C. SIN ANTICIPACIÓN -->

            <div class="metric canceladas">

              <div class="metric-label">
                C. sin anticipación
              </div>

              <div class="metric-value">

                ${item
                  .canceladasSinAnticipacion
                  .toLocaleString(
                    'es-AR'
                  )}

              </div>

            </div>


            <!-- C. POR FACTORES EXTERNOS -->

            <div class="metric externas">

              <div class="metric-label">
                C. por factores externos
              </div>

              <div class="metric-value">

                ${item
                  .canceladasFactoresExternos
                  .toLocaleString(
                    'es-AR'
                  )}

              </div>

            </div>


          </div>


        </div>

      `)
      .join('');

}


/* =========================================================
   RECIBIR FILTRO / SELECCIÓN DESDE GRIST
========================================================= */

let debounceTimer = null;


grist.onRecords((records) => {

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }


  debounceTimer = setTimeout(() => {

    if (
      !records ||
      records.length === 0
    ) {

      selectedPeriodo = null;

      renderDashboard();

      return;

    }


    /*
      Toma el periodo recibido desde la tabla/vista
      vinculada al widget.
    */

    selectedPeriodo =
      getValue(
        records[0].Periodo
      );


    console.log(
      'Periodo recibido desde Grist:',
      selectedPeriodo
    );


    renderDashboard();

  }, 200);

});


/* =========================================================
   CARGA INICIAL
========================================================= */

loadData();


