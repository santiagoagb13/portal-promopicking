# ADR 0010 · Decisiones de la fase 6 (soporte e informes)

- Estado: aceptada (28/10/2026)
- Contexto: secciones 8.9 y 8.11 del plan; criterio de la fase: «informe mensual exportado en PDF coincide con los datos».

## Soporte

- **Ámbito**:
  - Promopicking y Albatros ven todos los registros.
  - La marca ve los de sus campañas y restaurantes; el gerente, los de sus restaurantes.
  - Cualquiera ve además lo que abrió o tiene asignado.
- **Permisos**:
  - `ticket.manage` (asignar y cambiar la severidad) es solo de Promopicking.
  - `ticket.respond` sigue la matriz del plan, más el responsable asignado, que puede responder y cerrar aunque no lo abriera.
  - **Desviación**: el gerente puede responder en los registros que él abrió. La matriz le da «—», pero sin esto no podría contestar a «¿cuántas faltan?». Tampoco cierra ni gestiona; sí puede reabrir lo suyo si el problema sigue.
- **Estados**: el plan no fija las transiciones. Responder quien gestiona → «Respondida». Escribir quien abrió → «En curso». Asignar un registro abierto → «En curso». Cerrar → «Cerrada». Reabrir → «Abierta», o «En curso» si tiene responsable.
- **Hilo**: los cambios de responsable, severidad y estado quedan en el hilo como eventos (`ticket_updates.kind`), además de en la auditoría, para que quien lo lea vea qué pasó sin ir a Administración.
- **Tipo y motivo** se eligen en un solo selector con dos grupos (Consulta, Incidencia). El tipo sale del motivo, así no pueden contradecirse.
- **Avisos**:
  - Campana y correo a quien abrió y al responsable (nunca a quien actúa). Sin responsable, va a Operaciones.
  - Si falla el correo, la acción no falla: el aviso de la campana ya está.
  - El plan pide preferencias de correo en Cuenta (8.13). Aún no existen, así que todos estos correos se envían; queda para la fase 7.
- **Fotos**: opcionales, reducidas a 1600 px en el móvil antes de subirlas (como en la recepción) y guardadas en el almacenamiento de ficheros.
- **Pedido vinculado**: `tickets.order_id`. El kit se enlaza por `kits.incident_ticket_id`, como en la fase 4. Desde el detalle de un pedido, «Abrir consulta» abre el alta con el pedido ya puesto.
- **Contador de la navegación**: incidencias abiertas en el ámbito del usuario, con la misma consulta que la lista.

## Informes

- **Dos fuentes**:
  - Los meses anteriores al primero que mide el portal salen de `report_history` (y `report_history_incidents`): el histórico de las hojas de seguimiento, por mes y marca.
  - Desde ese mes, de los datos vivos.
  - «Primer mes que mide el portal» = mes de entrega de la primera campaña con kits generados.
  - En el seed, el histórico se reparte a partir de las cifras globales del prototipo (9.812 bultos, 108 incidencias, 312 pedidos por 14.870 €, OTIF y consumo mensuales, días de aprobación por marca), proporcional al consumo.
- **Definiciones** (datos vivos; el mes es el de la fecha en restaurante de la campaña):
  - **Bultos**: los de los kits recibidos o con la fecha en restaurante ya pasada.
  - **OTIF**: bultos de kits recibidos a tiempo (recepción ≤ fecha en restaurante) y sin incidencia, sobre los bultos.
  - **Incidencias**: registros de tipo incidencia abiertos en el mes, frente a los bultos.
  - **Piezas**: unidades de las líneas de los kits recibidos.
  - **Reposiciones**: pedidos no cancelados del mes y su importe.
  - **Aprobación**: días laborables (lunes a viernes, sin festivos) entre la subida y la aprobación de cada versión.
  - **Top soportes**: tirada del brief de las campañas del periodo.
  - **Top restaurantes**: solo pedidos hechos en el portal; el histórico no tiene detalle por restaurante.
- **Periodos**: últimos 12 meses, último trimestre (3 meses) y año en curso, siempre hasta el mes actual incluido.
- **Mismo dato en todas partes**: la página, los CSV y el PDF llaman a `reportData`. Las cifras de cabecera se escriben con `kpiCards` y los gráficos con la misma geometría (`reportCharts`, d3-scale y d3-shape en el servidor). En el PDF, los trazos se dibujan con `drawSvgPath` de pdf-lib. Lo comprueban la integración y la E2E extrayendo el texto del PDF.
- **Sin JS en el cliente**: los gráficos son SVG pintados en el servidor. Los valores van en `<title>` (tooltip nativo) y en tablas, y cada tabla tiene su CSV. d3 no llega al navegador.
- **Paleta**: los cinco primeros huecos de la paleta categórica de referencia, validada en claro y en oscuro (tokens `--series-1…5`).
  - El orden es fijo: FH, VIPS y Ginos usan siempre los tres primeros, y filtrar una marca no repinta las demás.
  - En claro, tres colores no llegan a 3:1 sobre el fondo, así que todos los gráficos llevan leyenda o tabla.
  - Las marcas siguen sin color propio fuera de los gráficos (regla 3 de 7.5).
- **Formato de exportación**: CSV con `;`, BOM y decimales con coma, como los abre Excel en español. El PDF es A4 vertical con fuentes estándar, que solo codifican WinAnsi: se sustituyen «≤» y los espacios finos.
- **Datos de muestra**: el portal solo tiene dados de alta 25 restaurantes, frente al total de la cadena del histórico. Por eso el mes vivo (octubre de 2026) sale muy por debajo en bultos y piezas. Es el dato real de la muestra; la página y el PDF dicen desde qué mes cuenta el portal.
