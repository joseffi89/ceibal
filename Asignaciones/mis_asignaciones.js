(() => {
  let allRecords = [];
  let recordActual = null;
  let selectedId = null;
  let todosLosEstados = [];
  let estadoNombreActual = "";
  let filtroMateria = "all";

  const mapaDias = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 0,
  };

  const REGLAS_POR_NOMBRE = {
    "Confirmado ✅": [3, 5],
    "Aún no confirmado": [1, 2],
    "Solicitud Suplencia 🔁": [4, 5],
    "Suplencia Confirmada ✅": [3, 5],
  };
  const ESTADOS_CON_OBS = [2, 3, 5];

  const $ = (id) => document.getElementById(id);
  const elements = {
    panelEstado: $("actionPanel"),
    panelModificar: $("modificarPanel"),
    overlay: $("overlay"),
    openAction: $("openAction"),
    openModificar: $("openModificar"),
    subjectTabs: $("subjectTabs"),
    countAll: $("countAll"),
    countPC: $("countPC"),
    countHD: $("countHD"),
    groupList: $("group-list"),
    detailContent: $("detail-content"),
    grupoLabel: $("grupoLabel"),
    idGrupoLabel: $("idGrupoLabel"),
    statusLabel: $("statusLabel"),
    estado: $("estado"),
    obs: $("obs"),
    obsWrapper: $("obsWrapper"),
    guardarEstado: $("guardar"),
    tipoMod: $("tipoModificacion"),
    guardarMod: $("btnGuardarMod"),
    nuevoDia: $("nuevoDia"),
    nuevaHora: $("nuevaHora"),
    fechaEfectiva: $("fechaEfectiva"),
    nuevaFechaInicio: $("nuevaFechaInicio"),
    aulaCrea: $("inputAulaCrea"),
    infoActual: $("infoActual"),
    sectionDiaHora: $("sectionDiaHora"),
    sectionDA: $("sectionDA"),
    sectionFechaInicio: $("sectionFechaInicio"),
    sectionAulaCrea: $("sectionAulaCrea"),
    containerFechaEfectiva: $("containerFechaEfectiva"),
    msgWarning: $("msgWarning"),
  };

  const inputsDA = {
    Nombre_del_docente: $("da_nombre"),
    Apellido_del_docente: $("da_apellido"),
    Cedula_del_docente: $("da_cedula"),
    Telefono_del_docente: $("da_telefono"),
    Correo_del_docente: $("da_correo"),
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return escapeHtml(value);
  }

  function getSafeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function getMateria(record) {
    const posiblesCampos = [
      record.Materia_display,
      record.Materia,
      record.Asignatura_display,
      record.Asignatura,
      record.Area_display,
      record.Area,
      record.ID_Grupo,
      record.Grupo,
    ];
    const texto = posiblesCampos
      .filter((valor) => valor !== null && valor !== undefined && valor !== "")
      .join(" ")
      .toUpperCase();

    if (/(^|[^A-Z])HD([^A-Z]|$)|HABILIDADES DIGITALES/.test(texto)) return "HD";
    if (/(^|[^A-Z])PC([^A-Z]|$)|PENSAMIENTO COMPUTACIONAL/.test(texto)) return "PC";
    return "";
  }

  function getRecordsFiltrados() {
    if (filtroMateria === "all") return allRecords;
    return allRecords.filter((record) => getMateria(record) === filtroMateria);
  }

  function actualizarConteosMateria() {
    const totalPC = allRecords.filter((record) => getMateria(record) === "PC").length;
    const totalHD = allRecords.filter((record) => getMateria(record) === "HD").length;
    elements.countAll.textContent = allRecords.length;
    elements.countPC.textContent = totalPC;
    elements.countHD.textContent = totalHD;

    const mostrarFiltroMateria = totalPC > 0 && totalHD > 0;
    elements.subjectTabs.classList.toggle("hidden", !mostrarFiltroMateria);

    if (!mostrarFiltroMateria && filtroMateria !== "all") {
      filtroMateria = "all";
    }
  }

  function actualizarTabsMateria() {
    elements.subjectTabs.querySelectorAll(".subject-tab").forEach((tab) => {
      const activo = tab.dataset.subject === filtroMateria;
      tab.classList.toggle("active", activo);
      tab.setAttribute("aria-selected", activo ? "true" : "false");
    });
  }

  function seleccionarPrimerGrupoVisible() {
    const visibles = getRecordsFiltrados();
    const seleccionadoVisible = visibles.some((record) => record.id === selectedId);
    if (seleccionadoVisible || visibles.length === 0) {
      renderList();
      return;
    }

    selectedId = visibles[0].id;
    grist.setCursorPos({ rowId: selectedId });
    renderDetail(visibles[0]);
    renderList();
  }

  function openEstado() {
    closePanels();
    elements.panelEstado.classList.add("open");
    elements.overlay.classList.add("active");
  }

  function openMod() {
    closePanels();
    elements.panelModificar.classList.add("open");
    elements.overlay.classList.add("active");
  }

  function closePanels() {
    elements.panelEstado.classList.remove("open");
    elements.panelModificar.classList.remove("open");
    elements.overlay.classList.remove("active");
  }

  function formatDate(val) {
    if (!val) return "-";
    const date = typeof val === "number" ? new Date(val * 1000) : new Date(val);
    if (Number.isNaN(date.getTime())) return val;
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }

  function limpiarFormularios() {
    elements.estado.value = "";
    elements.obs.value = "";
    elements.tipoMod.value = "";
    elements.nuevoDia.value = "";
    elements.nuevaHora.value = "";
    elements.fechaEfectiva.value = "";
    elements.nuevaFechaInicio.value = "";
    elements.aulaCrea.value = "";
    Object.values(inputsDA).forEach((input) => {
      input.value = "";
    });
    validarEstado();
    validarMod();
  }

  async function cargarEstadosBase() {
    try {
      const data = await grist.docApi.fetchTable("Estados_DR");
      todosLosEstados = data.id.map((id, i) => ({ id, nombre: data.Estado_DR[i] }));
      if (estadoNombreActual) actualizarOpcionesEstado(estadoNombreActual);
    } catch (e) {
      console.error(e);
    }
  }

  function actualizarOpcionesEstado(nombreActual) {
    elements.estado.innerHTML = '<option value="">Seleccionar estado...</option>';
    const nombreLimpio = (nombreActual || "").trim();
    const idsPermitidos = REGLAS_POR_NOMBRE[nombreLimpio];
    const estadosAMostrar = idsPermitidos
      ? todosLosEstados.filter((estado) => idsPermitidos.includes(Number(estado.id)))
      : todosLosEstados.filter((estado) => Number(estado.id) !== 6);

    const fragment = document.createDocumentFragment();
    estadosAMostrar.forEach((estado) => {
      const option = document.createElement("option");
      option.value = estado.id;
      option.textContent = estado.nombre;
      fragment.appendChild(option);
    });
    elements.estado.appendChild(fragment);
  }

  function validarEstado() {
    const seleccionadoId = Number(elements.estado.value);
    const requiereObs = ESTADOS_CON_OBS.includes(seleccionadoId);
    elements.obsWrapper.classList.toggle("hidden", !requiereObs);
    const obsOk = !requiereObs || elements.obs.value.trim().length > 0;
    elements.guardarEstado.disabled = !(selectedId && seleccionadoId && obsOk);
  }

  function actualizarInfoPreviaMod() {
    if (!recordActual) return;

    const tipo = elements.tipoMod.value;
    if (tipo === "dia_hora") {
      elements.infoActual.innerHTML = `<strong>Actual:</strong> <span class="actual-dato">${safeText(recordActual.Dia, "—")} ${safeText(recordActual.Hora_desde, "")}</span>`;
    } else if (tipo === "datos_da") {
      elements.infoActual.innerHTML = '<strong>Modificando:</strong> <span class="actual-dato">Datos del Docente</span>';
    } else if (tipo === "fecha_inicio") {
      elements.infoActual.innerHTML = `<strong>Actual:</strong> <span class="actual-dato">${escapeHtml(formatDate(recordActual.Fecha_Inicio))}</span>`;
    } else if (tipo === "aula_crea") {
      elements.infoActual.innerHTML = `<strong>Actual:</strong> <span class="actual-dato">${recordActual.Aula_de_CREA ? "Link asignado" : "Sin aula"}</span>`;
    } else {
      elements.infoActual.textContent = "Seleccione una opción.";
    }
  }

  function validarMod() {
    const tipo = elements.tipoMod.value;
    const agendaCreada = recordActual ? recordActual.Agenda_Creada : false;

    elements.sectionDiaHora.classList.toggle("hidden", tipo !== "dia_hora");
    elements.sectionDA.classList.toggle("hidden", tipo !== "datos_da");
    elements.sectionFechaInicio.classList.toggle("hidden", tipo !== "fecha_inicio");
    elements.sectionAulaCrea.classList.toggle("hidden", tipo !== "aula_crea");

    if (tipo === "dia_hora") {
      elements.containerFechaEfectiva.classList.toggle("hidden", !agendaCreada);
      elements.msgWarning.classList.toggle("hidden", !agendaCreada);
    }

    actualizarInfoPreviaMod();

    let esValido = false;
    if (tipo === "dia_hora") {
      const diaUHoraCargado = elements.nuevoDia.value !== "" || elements.nuevaHora.value !== "";
      esValido = agendaCreada ? elements.fechaEfectiva.value !== "" && diaUHoraCargado : diaUHoraCargado;
    } else if (tipo === "datos_da") {
      esValido = true;
    } else if (tipo === "fecha_inicio") {
      esValido = elements.nuevaFechaInicio.value !== "";
    } else if (tipo === "aula_crea") {
      esValido = elements.aulaCrea.value.trim() !== "";
    }

    elements.guardarMod.disabled = !recordActual || !esValido || tipo === "";
  }

  function getStatusClass(status) {
    if (!status) return "status-default";
    const s = status.toLowerCase();
    if (s.includes("dado de baja")) return "status-baja";
    if (s.includes("no asignado")) return "status-no-asignado";
    if (s.includes("pre")) return "status-pre";
    if (s.includes("asignado")) return "status-asignado";
    if (s.includes("suplente") || s.includes("reasignar")) return "status-rojo";
    return "status-default";
  }

  function getSidebarClass(status) {
    if (!status) return "";
    const s = status.toLowerCase();
    if (s.includes("dado de baja")) return "item-baja";
    if (s.includes("no asignado")) return "item-no-asignado";
    if (s.includes("pre")) return "item-pre";
    if (s.includes("asignado")) return "item-asignado";
    if (s.includes("suplente") || s.includes("reasignar")) return "item-rojo";
    return "";
  }

  function renderList() {
    elements.groupList.innerHTML = "";
    const fragment = document.createDocumentFragment();

    actualizarConteosMateria();
    actualizarTabsMateria();

    const recordsFiltrados = getRecordsFiltrados();

    if (recordsFiltrados.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      empty.textContent = filtroMateria === "all" ? "No hay grupos para mostrar." : `No hay grupos ${filtroMateria} para mostrar.`;
      elements.groupList.appendChild(empty);
      return;
    }

    recordsFiltrados.forEach((record) => {
      const item = document.createElement("button");
      const statusClass = getSidebarClass(record.Estado_Grupo);
      item.type = "button";
      item.className = `group-item ${statusClass} ${record.id === selectedId ? "active" : ""}`;
      item.textContent = record.ID_Grupo || record.Grupo || record.id;
      item.addEventListener("click", () => {
        selectedId = record.id;
        grist.setCursorPos({ rowId: record.id });
        renderDetail(record);
        renderList();
      });
      fragment.appendChild(item);
    });

    elements.groupList.appendChild(fragment);
  }

  function renderUsuarioVC(usuarioVC) {
    if (Array.isArray(usuarioVC)) {
      return usuarioVC.map((usuario) => `<span>${safeText(usuario)}</span>`).join("");
    }
    if (usuarioVC) {
      return String(usuarioVC)
        .split(",")
        .map((usuario) => `<span>${safeText(usuario.trim())}</span>`)
        .join("");
    }
    return "-";
  }

  function renderAulaCrea(aulaCrea) {
    const url = getSafeUrl(aulaCrea);
    if (!url) {
      return '<span style="color:#94a3b8; font-style:italic;">Sin aula asignada</span>';
    }
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="aula-link"><i class="fas fa-external-link-alt"></i> Ver Aula CREA</a>`;
  }

  function renderDetail(record) {
    if (!record) return;

    recordActual = record;
    selectedId = record.id;

    elements.openAction.style.display = "block";
    elements.openModificar.style.display = "block";

    const grupoNombre = record.ID_Grupo_display || record.ID_Grupo || record.id;
    elements.idGrupoLabel.textContent = grupoNombre;
    elements.grupoLabel.textContent = grupoNombre;

    const estadoValue = record.Estado_DR;
    estadoNombreActual = Array.isArray(estadoValue)
      ? estadoValue[1]
      : record.Estado_DR_display || estadoValue || "";
    elements.statusLabel.textContent = estadoNombreActual;
    actualizarOpcionesEstado(estadoNombreActual);

    inputsDA.Nombre_del_docente.value = record.Nombre_del_docente || "";
    inputsDA.Apellido_del_docente.value = record.Apellido_del_docente || "";
    inputsDA.Cedula_del_docente.value = record.Cedula_del_docente || "";
    inputsDA.Telefono_del_docente.value = record.Telefono_del_docente || "";
    inputsDA.Correo_del_docente.value = record.Correo_del_docente || "";
    elements.aulaCrea.value = record.Aula_de_CREA || "";

    const statusClass = getStatusClass(record.Estado_Grupo);
    const nombreDocente = `${record.Nombre_del_docente || ""} ${record.Apellido_del_docente || ""}`.trim();

    elements.detailContent.innerHTML = `
      <div class="container">
        <div class="header">
          <h3><i class="fa fa-graduation-cap" aria-hidden="true"></i> ${safeText(record.ID_Grupo)}</h3>
          <span class="status-badge ${statusClass}">${safeText(record.Estado_Grupo, "Sin Estado")}</span>
          <div class="data-row"><span class="label">Docente Remoto</span><span class="val">${safeText(record.DR)}</span></div>
        </div>
        <div class="content-grid">
          <section>
            <span class="section-title"><i class="fas fa-calendar-alt"></i> Clases</span>
            <div class="data-row"><span class="label">Día</span><span class="val highlight-green">${safeText(record.Dia)}</span></div>
            <div class="data-row"><span class="label">Horario</span><span class="val">${safeText(record.Hora_desde, "00:00")} a ${safeText(record.Hora_hasta, "00:00")}</span></div>
            <div class="data-row"><span class="label">Inicio</span><span class="val">${escapeHtml(formatDate(record.Fecha_Inicio))}</span></div>
            <div class="data-row"><span class="label">Aula de CREA</span><span class="val">${renderAulaCrea(record.Aula_de_CREA)}</span></div>
          </section>
          <section>
            <span class="section-title"><i class="fas fa-school"></i> Institución</span>
            <div class="data-row"><span class="label">Escuela</span><span class="val">№ ${safeText(record.No_Escuela)}</span></div>
            <div class="data-row"><span class="label">Departamento</span><span class="val">${safeText(record.Departamento)}</span></div>
            <div class="data-row"><span class="label">Correo electrónico</span><span class="val">${safeText(record.Correo_electronico)}</span></div>
            <div class="data-group">
              <span class="label">Usuario Webex/Jabber</span>
              <div class="val" style="display: flex; flex-direction: column; gap: 2px;">
                ${renderUsuarioVC(record.Usuario_VC)}
              </div>
            </div>
          </section>
        </div>
        <section style="border-top: 1px solid var(--border)">
          <span class="section-title"><i class="fas fa-user-graduate"></i> Docente del Aula</span>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div><div class="data-row"><span class="label">Nombre</span><span class="val">${safeText(nombreDocente)}</span></div></div>
            <div><div class="data-row"><span class="label">Cédula</span><span class="val">${safeText(record.Cedula_del_docente)}</span></div></div>
            <div><div class="data-row"><span class="label">Teléfono</span><span class="val">${safeText(record.Telefono_del_docente)}</span></div></div>
            <div><div class="data-row"><span class="label">Correo</span><span class="val">${safeText(record.Correo_del_docente)}</span></div></div>
          </div>
        </section>
      </div>`;

    validarEstado();
    validarMod();
  }

  function ajustarFechaALunes(event) {
    if (!event.target.value) {
      validarMod();
      return;
    }

    const fecha = new Date(`${event.target.value}T12:00:00`);
    const dia = fecha.getDay();
    if (dia !== 1) {
      const diff = dia === 0 ? -6 : 1 - dia;
      fecha.setDate(fecha.getDate() + diff);
      event.target.value = fecha.toISOString().split("T")[0];
      alert("La fecha se ajustó al lunes de esa semana para mantener la consistencia de la agenda.");
    }
    validarMod();
  }

  async function guardarEstado() {
    const nuevoId = Number(elements.estado.value);
    if (nuevoId === 2) {
      const grupoNombreTexto = elements.grupoLabel.textContent;
      const confirma = confirm(`¿Está seguro que desea rechazar el grupo ${grupoNombreTexto}?`);
      if (!confirma) return;
    }

    try {
      elements.guardarEstado.disabled = true;
      await grist.docApi.applyUserActions([
        [
          "AddRecord",
          "Confirmacion_Grupo",
          null,
          {
            Grupo2: selectedId,
            Confirmacion: nuevoId,
            Observacion: elements.obs.value.trim(),
          },
        ],
      ]);
      limpiarFormularios();
      closePanels();
      alert("✅ Estado actualizado correctamente.");
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      validarEstado();
    }
  }

  async function guardarModificacion() {
    try {
      elements.guardarMod.disabled = true;
      const tipo = elements.tipoMod.value;
      const acciones = [];
      const agendaCreada = recordActual.Agenda_Creada;

      if (tipo === "dia_hora") {
        const nuevaHora = elements.nuevaHora.value;
        const nuevoDiaKey = elements.nuevoDia.value;
        const textoDiaSeleccionado = elements.nuevoDia.options[elements.nuevoDia.selectedIndex]?.text;

        if (agendaCreada) {
          const fechaLimiteStr = elements.fechaEfectiva.value;
          const targetDay = mapaDias[nuevoDiaKey];
          const tablaAgenda = await grist.docApi.fetchTable("Agenda");
          const ids = [];
          const fechas = [];
          const horas = [];

          for (let i = 0; i < tablaAgenda.id.length; i += 1) {
            const idGrupo = Array.isArray(tablaAgenda.ID_Grupo_Grupo[i])
              ? tablaAgenda.ID_Grupo_Grupo[i][0]
              : tablaAgenda.ID_Grupo_Grupo[i];
            const fechaOriginal = new Date(tablaAgenda.Clase[i] * 1000);

            if (idGrupo === recordActual.id && fechaOriginal.toISOString().split("T")[0] >= fechaLimiteStr) {
              ids.push(tablaAgenda.id[i]);

              if (nuevoDiaKey) {
                const fechaNueva = new Date(fechaOriginal);
                fechaNueva.setUTCDate(fechaOriginal.getUTCDate() + targetDay - fechaOriginal.getUTCDay());
                fechas.push(fechaNueva.getTime() / 1000);
              } else {
                fechas.push(tablaAgenda.Clase[i]);
              }

              horas.push(nuevaHora || tablaAgenda.Hora_Desde[i]);
            }
          }

          if (ids.length > 0) {
            acciones.push(["BulkUpdateRecord", "Agenda", ids, { Clase: fechas, Hora_Desde: horas }]);
          }
        }

        acciones.push([
          "AddRecord",
          "Historial_Dia_y_Hora",
          null,
          {
            ID_Grupo: recordActual.id,
            Dia: nuevoDiaKey ? textoDiaSeleccionado : recordActual.Dia,
            Hora: nuevaHora || recordActual.Hora_desde,
            Observaciones: `Anterior: ${recordActual.Dia || "S/N"} ${recordActual.Hora_desde || ""}`,
          },
        ]);
      } else if (tipo === "datos_da") {
        acciones.push([
          "UpdateRecord",
          "Asignaciones",
          recordActual.id,
          {
            Nombre_del_docente: inputsDA.Nombre_del_docente.value.trim(),
            Apellido_del_docente: inputsDA.Apellido_del_docente.value.trim(),
            Cedula_del_docente: inputsDA.Cedula_del_docente.value.trim(),
            Telefono_del_docente: inputsDA.Telefono_del_docente.value.trim(),
            Correo_del_docente: inputsDA.Correo_del_docente.value.trim(),
          },
        ]);
      } else if (tipo === "fecha_inicio") {
        const timestamp = new Date(`${elements.nuevaFechaInicio.value}T12:00:00`).getTime() / 1000;
        acciones.push(["UpdateRecord", "Asignaciones", recordActual.id, { Fecha_Inicio: timestamp }]);
      } else if (tipo === "aula_crea") {
        acciones.push(["UpdateRecord", "Asignaciones", recordActual.id, { Aula_de_CREA: elements.aulaCrea.value.trim() }]);
      }

      await grist.docApi.applyUserActions(acciones);
      alert("✅ Cambios aplicados.");
      limpiarFormularios();
      closePanels();
    } catch (e) {
      alert(`Error: ${e.message}`);
      validarMod();
    }
  }

  function bindEvents() {
    elements.openAction.addEventListener("click", openEstado);
    elements.openModificar.addEventListener("click", openMod);
    elements.subjectTabs.addEventListener("click", (event) => {
      const tab = event.target.closest(".subject-tab");
      if (!tab) return;
      filtroMateria = tab.dataset.subject;
      seleccionarPrimerGrupoVisible();
    });
    elements.overlay.addEventListener("click", closePanels);
    document.querySelectorAll(".close-panel").forEach((button) => {
      button.addEventListener("click", closePanels);
    });

    elements.estado.addEventListener("change", validarEstado);
    elements.obs.addEventListener("input", validarEstado);
    [
      elements.tipoMod,
      elements.nuevoDia,
      elements.nuevaHora,
      elements.fechaEfectiva,
      elements.nuevaFechaInicio,
      elements.aulaCrea,
    ].forEach((element) => {
      element.addEventListener("change", validarMod);
      element.addEventListener("input", validarMod);
    });
    Object.values(inputsDA).forEach((element) => element.addEventListener("input", validarMod));

    elements.fechaEfectiva.addEventListener("change", ajustarFechaALunes);
    elements.guardarEstado.addEventListener("click", guardarEstado);
    elements.guardarMod.addEventListener("click", guardarModificacion);
  }

  function bindGrist() {
    grist.onRecords((records) => {
      allRecords = records;
      renderList();
      if (selectedId) {
        const record = records.find((item) => item.id === selectedId);
        if (record) renderDetail(record);
      }
    });

    grist.onRecord((record) => {
      if (record) {
        selectedId = record.id;
        renderDetail(record);
        renderList();
      }
    });

    cargarEstadosBase();
    grist.ready({ requiredAccess: "full" });
  }

  bindEvents();
  bindGrist();
})();
