# Grist Custom Widget: Gestión de Disponibilidad Horaria

Este es un widget personalizado que permite gestionar de forma visual y rápida la disponibilidad de horarios mediante una cuadrícula interactiva.

## 📋 Descripción

El widget presenta una matriz de días (Lunes a Viernes) y bloques horarios configurables. Permite a los usuarios seleccionar múltiples celdas para realizar acciones en bloque, como dar de alta nuevas disponibilidades o eliminar registros existentes de la base de datos de Grist.

### Características principales:
* **Interfaz Intuitiva:** Selección mediante checkboxes para una experiencia táctil y ágil.
* **Acciones en Bloque:** Guarda o elimina múltiples horarios a la vez.
* **Validación de Duplicados:** Evita crear registros repetidos en la tabla de disponibilidad.
* **Feedback en Tiempo Real:** Indicadores visuales de éxito, error y carga.

---

## 🛠️ Requisitos previos

Para que el widget funcione correctamente, tu documento de Grist debe contener las siguientes tablas y columnas:

### 1. Tabla: `Slots`
Esta tabla define los bloques de tiempo disponibles.
* **Columna `Horario_Inicio`:** (Texto) Ej: "08:30", "09:25", etc.
* **Columna `id`:** Generada automáticamente por Grist.

### 2. Tabla: `Disponibilidad`
Aquí es donde se almacenan las selecciones del usuario.
* **Columna `Dia_de_la_Semana`:** (Texto) Almacena el nombre del día.
* **Columna `Horario_Disponible`:** (Referencia a la tabla `Slots`).

---

## 🚀 Instalación y Configuración

1.  **Habilitar Widgets:** En tu documento de Grist, añade un nuevo widget de tipo "Custom".
2.  **Configurar Acceso:** En el panel de configuración del widget, asegúrate de otorgar **Access: Full** (necesario para añadir y eliminar registros).
3.  **Cargar Código:**
    * Copia el contenido de `gestionar_dispo.html` en la sección HTML.
    * Copia el contenido de `gestionar_dispo.js` en la sección JavaScript.
4.  **Confirmar:** Haz clic en "Save" y el widget estará listo para usar.

---

## 📖 Instrucciones de Uso

1.  **Selección:** Marca las casillas correspondientes a los días y horas que deseas gestionar.
2.  **Guardar:** Haz clic en el botón 💾 **GUARDAR DISPONIBILIDAD**. El sistema verificará si ya existen esos registros para evitar duplicados antes de guardarlos.
3.  **Eliminar:** Si deseas quitar horarios, selecciónalos y haz clic en 🗑️ **ELIMINAR DISPONIBILIDAD**. Se te pedirá una confirmación antes de proceder.

---

## ⚙️ Personalización

Si deseas cambiar los horarios o los días mostrados en la cuadrícula, modifica las constantes al inicio del archivo `script.js`:

```javascript
const horarios = ["08:30", "09:25", "10:20", ...];
const dias = ["Lunes", "Martes", "Miércoles", ...];