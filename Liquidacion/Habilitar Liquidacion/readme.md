# Grist Custom Widget - Habilitar Liquidación DR

Este widget permite a los administradores habilitar períodos de liquidación de forma masiva. Al activarse, marca el período como disponible para los Dpcentes Remotos (DR) y genera automáticamente los registros de liquidación basados en los datos validados de la agenda.

## 📋 Funcionalidad

1.  **Selección de Período**: Desplegable vinculado a la tabla `Periodos_LIQ`.
2.  **Habilitación**: Al presionar el botón, el campo `Habilitar_a_DR` del período seleccionado se marca como `True`.
3.  **Generación de Registros**: 
    -   Escanea la tabla `Agenda` buscando clases vinculadas al período.
    -   Filtra únicamente los registros donde `Validacion_LIQ` sea "Validada".
    -   Agrupa los importes por DR.
    -   Crea los registros correspondientes en la tabla `Liquidaciones`.

## 📊 Estructura de Datos Requerida

El widget asume que el documento de Grist tiene la siguiente estructura:

### Tabla: `Periodos_LIQ`
- `Periodo` (Texto - Nombre del período)
- `Habilitar_a_DR` (Toggle/Bool)

### Tabla: `Agenda`
- `Periodo` (Referencia a Periodos_LIQ)
- `DR_a_cargo` (Referencia a la tabla de DRs)
- `Validacion_LIQ` (Texto - Debe ser "Validada" para procesarse)
- `Importe_Pesos` (Numérico - Valor a sumar)

### Tabla: `Liquidaciones`
- `Periodo` (Referencia)
- `DR` (Referencia)
- `Importe_Total_USD` (Numérico - Sumatoria final)

## 🛠️ Detalles Técnicos

- **Manejo de Referencias**: El script utiliza los IDs internos de Grist para garantizar la integridad referencial entre las tablas `Periodos_LIQ`, `Agenda` y `Liquidaciones`.
- **Acciones Atómicas**: Se utiliza `applyUserActions` para enviar todas las actualizaciones y creaciones en un solo paquete, asegurando que si algo falla, no se realicen cambios parciales.
- **Interfaz**: Diseñado con CSS moderno, incluyendo estados de carga y feedback de éxito/error para el usuario.

---
