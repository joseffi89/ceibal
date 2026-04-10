// Configuración de datos iniciales para la tabla
const horarios = ["08:30", "09:25", "10:20", "11:15", "13:30", "14:25", "15:20", "16:15"];
const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

// Generación dinámica de las filas de la tabla
const tbody = document.getElementById("gridBody");
horarios.forEach(hora => {
  const row = document.createElement("tr");
  row.innerHTML = `<td class="hora-label">${hora}</td>` + 
    dias.map(dia => `
      <td>
        <label class="slot-check">
          <input type="checkbox" data-dia="${dia}" data-hora="${hora}">
        </label>
      </td>
    `).join('');
  tbody.appendChild(row);
});

/**
 * LÓGICA PARA GUARDAR DISPONIBILIDAD
 */
document.getElementById("saveBtn").onclick = async () => {
  const btn = document.getElementById("saveBtn");
  const status = document.getElementById("status");
  const selected = document.querySelectorAll('input[type="checkbox"]:checked');
  
  if (selected.length === 0) {
    alert("❌ Selecciona al menos un horario");
    return;
  }

  btn.disabled = true;
  status.innerText = "Validando y guardando...";

  try {
    // Obtenemos los datos de las tablas necesarias en Grist
    const slotsTable = await grist.docApi.fetchTable("Slots");
    const dispoActual = await grist.docApi.fetchTable("Disponibilidad");
    const actions = [];
    const erroresDuplicados = [];

    for (const input of selected) {
      const dia = input.dataset.dia;
      const horaStr = input.dataset.hora;
      // Buscamos el ID del slot correspondiente a la hora seleccionada
      const slotIdx = slotsTable.Horario_Inicio.indexOf(horaStr); 
      const slotId = slotIdx !== -1 ? slotsTable.id[slotIdx] : null;

      if (!slotId) throw new Error(`Slot no encontrado para ${horaStr}`);

      // Verificamos si ya existe el registro para evitar duplicados
      const yaExiste = dispoActual.id.some((_, i) => {
        const dComp = dispoActual.Dia_de_la_Semana[i];
        const hCompRaw = dispoActual.Horario_Disponible[i];
        const hCompId = Array.isArray(hCompRaw) ? hCompRaw[0] : hCompRaw;
        return dComp === dia && hCompId === slotId;
      });

      if (yaExiste) {
        erroresDuplicados.push(`${dia} ${horaStr}`);
      } else {
        // Agregamos la acción de añadir registro
        actions.push(["AddRecord", "Disponibilidad", null, {
          Dia_de_la_Semana: dia,
          Horario_Disponible: slotId 
        }]);
      }
    }

    if (erroresDuplicados.length > 0) {
      alert("❌ Disponibilidad ya registrada:\n" + erroresDuplicados.join(", "));
      status.innerText = "";
      btn.disabled = false;
      return;
    }

    // Aplicamos las acciones en bloque a la base de datos
    await grist.docApi.applyUserActions(actions);
    status.innerHTML = '<span class="success">✅ ¡Guardado con éxito!</span>';
    document.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
    
  } catch (e) {
    alert("❌ Error: " + e.message);
    status.innerText = "";
  } finally {
    btn.disabled = false;
  }
};

/**
 * LÓGICA PARA ELIMINAR DISPONIBILIDAD
 */
document.getElementById("deleteBtn").onclick = async () => {
  const btn = document.getElementById("deleteBtn");
  const status = document.getElementById("status");
  const selected = document.querySelectorAll('input[type="checkbox"]:checked');
  
  if (selected.length === 0) {
    alert("❌ Selecciona horarios para eliminar");
    return;
  }

  if (!confirm("⚠️ ¿Desea eliminar la disponibilidad seleccionada?")) return;

  btn.disabled = true;
  status.innerText = "Buscando registros...";

  try {
    const slotsTable = await grist.docApi.fetchTable("Slots");
    const dispoActual = await grist.docApi.fetchTable("Disponibilidad");
    const actions = [];
    const noEncontrados = [];

    for (const input of selected) {
      const dia = input.dataset.dia;
      const horaStr = input.dataset.hora;
      const slotIdx = slotsTable.Horario_Inicio.indexOf(horaStr); 
      const slotId = slotIdx !== -1 ? slotsTable.id[slotIdx] : null;

      let idAEliminar = null;
      // Buscamos el registro real en la tabla Disponibilidad para obtener su ID de fila
      for (let i = 0; i < dispoActual.id.length; i++) {
        const dComp = dispoActual.Dia_de_la_Semana[i];
        const hCompRaw = dispoActual.Horario_Disponible[i];
        const hCompId = Array.isArray(hCompRaw) ? hCompRaw[0] : hCompRaw;
        if (dComp === dia && hCompId === slotId) {
          idAEliminar = dispoActual.id[i];
          break;
        }
      }

      if (idAEliminar) {
        actions.push(["RemoveRecord", "Disponibilidad", idAEliminar]);
      } else {
        noEncontrados.push(`${dia} ${horaStr}`);
      }
    }

    if (noEncontrados.length > 0 && actions.length === 0) {
      alert("⚠️ No existen registros para la disponibilidad:\n" + noEncontrados.join(", "));
      status.innerText = "";
      btn.disabled = false;
      return;
    }

    await grist.docApi.applyUserActions(actions);
    status.innerHTML = '<span class="success">✅ Eliminados correctamente.</span>';
    document.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);

  } catch (e) {
    alert("❌ Error: " + e.message);
    status.innerText = "";
  } finally {
    btn.disabled = false;
  }
};

// Inicialización de la API indicando el nivel de acceso requerido
grist.ready({ requiredAccess: 'full' });