# Grist Custom Widget - Sistema de Liquidaciones DR

Este widget permite la visualización, validación y seguimiento de liquidaciones mensuales para Docentes Remotos (DR). Facilita el proceso de confirmación de importes y la gestión de facturación mediante una interfaz interactiva.

## 🚀 Características

- **Navegación por Períodos**: Sidebar dinámico que filtra los períodos habilitados y validados.
- **Visualización Detallada**: Desglose de conceptos (clases dictadas, coordinación, etc.) con sus respectivos subtotales.
- **Gestión de Estados**: Permite confirmar liquidaciones o sugerir cambios directamente desde la interfaz.
- **Validación de Coordinación**: Modal integrado para verificar el estado de validación de cada clase individual.
- **Integración de Facturación**: Banner dinámico con acceso directo a email cuando la liquidación está lista para facturar.


## 📊 Estructura de Datos Requerida

Para que el script funcione correctamente, el documento debe contar con las siguientes tablas y columnas:

### Tabla: `Periodos_LIQ`
- `Periodo` (Texto/ID)
- `Desde` / `Hasta` (Fecha)
- `Habilitar_a_DR` (Bool)
- `Tipo_de_cambio` (Numérico)

### Tabla: `Liquidaciones`
- `ID_Liq` (Texto - Formato: "Periodo - Nombre DR")
- `Importe_Total_USD` (Numérico)

### Tabla: `Seguimiento_Liquidaciones`
- `ID_Liq` (Texto)
- `Estado` (Texto: Pendiente, Confirmada, etc.)
- `Observaciones` (Texto)


## 📝 Notas de Implementación

- El script incluye un **Debounce** de 300ms para optimizar la carga de registros al navegar entre filas en Grist.
- La lógica de "Factura Solicitada" se activa automáticamente cuando el período tiene un Tipo de Cambio asignado y el estado es "Confirmada".

---
