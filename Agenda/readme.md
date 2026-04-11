# Módulo de Agenda - Grist Custom Widget

Este widget personalizado para **Grist** permite la gestión técnica y pedagógica de clases mediante una interfaz de calendario interactiva. Está diseñado para centralizar el seguimiento de grupos, la carga de informes de clase y la administración de recuperaciones.


## ✨ Funcionalidades

### 1. Calendario de Gestión
* Visualización de clases mediante **FullCalendar**.
* Diferenciación visual de estados por colores (Dictada, Cancelada, Pendiente).
* Integración de feriados y días no laborables desde la tabla `Calendario`.

### 2. Informe de Clase (Dinámico)
* **Formulario adaptativo**: Los campos cambian según si la clase fue dictada o cancelada.
* **Validación de Drive**: El sistema exige que los links de evidencia comiencen con el prefijo oficial de Google Drive.
* **Bloqueo de seguridad**: Si un informe ya fue validado o la fecha es futura, ciertas acciones se restringen automáticamente.

### 3. Sistema de Recuperaciones
* Cálculo automático de cupos basados en clases canceladas vs. ya recuperadas.
* Generación automática de nuevos registros en la tabla `Agenda` manteniendo el vínculo con la clase original.

### 4. Historial de Grupo
* Acceso a una vista cronológica de todos los informes cargados para el grupo seleccionado sin salir del widget.

## 🛠️ Tecnologías y Librerías

* **Grist Plugin API**: Comunicación con la base de datos.
* **FullCalendar v6.1.11**: Gestión de la vista de agenda.
* **FontAwesome 6**: Iconografía de la interfaz.
* **Google Fonts (Inter)**: Tipografía del sistema.

---
