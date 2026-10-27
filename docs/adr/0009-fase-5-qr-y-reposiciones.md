# ADR 0009 · Decisiones de la fase 5 (QR de versión y reposiciones)

- Estado: aceptada (28/10/2026)
- Contexto: secciones 8.7 y 8.8 del plan; criterio de la fase: «un pedido desde QR llega validado a reparto».

## QR de versión

- **Un código por versión aprobada y restaurante**, no por pieza física. Lo dice el plan («lote por versión y restaurante») y basta para saber qué versión hay en cada sitio. Si hiciera falta uno por unidad, se añade una columna de número de serie sin cambiar la landing.
- **Formato** `7KQ4-M2XD`: 8 caracteres de un alfabeto sin confusos (sin 0/O ni 1/I/L), unos 40 bits. Es corto para leerlo por teléfono y no se puede adivinar con el límite de 20 consultas cada 15 minutos por IP.
- **Generación automática** cuando la marca aprueba la última versión pendiente del soporte, sea una a una o con «Aprobar todas». En `/qr`, «Generar» crea los que falten (restaurantes dados de alta después) y nunca cambia los existentes. Si se deshace una aprobación, el código sigue existiendo y la landing dice «Pendiente de aprobar».
- **Destino de cada versión**: el de los kits si ya están generados y, si no, el maestro (misma regla `versionFor` que los kits). Así coincide con lo que llega al restaurante.
- **Para la imprenta**: la hoja `/qr/soporte/<id>` (SVG en servidor, imprimible a 4 por fila) y el CSV con la URL de cada código. El plan citaba también PDF; con la hoja imprimible y el CSV la imprenta tiene lo que necesita, y el PDF queda para la fase 6 junto con los informes.
- **Seed**: genera los QR de todo lo aprobado con códigos derivados de versión y restaurante (siempre los mismos), más un pedido desde QR pendiente de validar para que la cola de Operaciones no esté vacía.

## Landing pública `/qr/<código>`

- Sin sesión, con `noindex`, `no-store` y límite por IP. No muestra precios ni personas: pieza, versión, campaña, restaurante y lote.
- **Estados**: vigente, sustituida (la versión tiene una revisión posterior), retirada y pendiente de aprobar.
- **Acciones**:
  - Pedir reposición: de 1 a 50 unidades. El pedido nace «Pendiente de validar».
  - Avisar de un error: abre una consulta `CON-` con motivo, lote y restaurante, y avisa a Operaciones.
  - Marcar retirada.
- Quien escanea no se identifica. El pedido y la consulta quedan a nombre de `QR <código>` y en la auditoría con IP y navegador.
- **Sin precio**: la pieza de campaña repuesta desde el QR va sin importe (0 €) porque se factura con la campaña. Si Promopicking quiere cobrarla, basta con poner precio a la línea al validarla.

## Reposiciones

- **Precio y plazo** salen del catálogo en el momento del pedido y quedan en la línea. Un cambio de precio posterior no altera pedidos ya hechos.
- **Plazo del pedido**: el del artículo más lento, en días naturales desde la confirmación.
- **Estados**:
  - Del portal: En preparación → En reparto → Entregado. Solo Promopicking avanza el estado; el restaurante recibe un aviso en cada paso.
  - Del QR: antes pasan por «Pendiente de validar». Operaciones los acepta (pasan a preparación) o los rechaza con motivo, que ve el restaurante.
- **Cancelar**: solo en «En preparación», por quien lo pidió o por Promopicking (8.8). Los pendientes de validar no se cancelan: se rechazan.
- **Sin JavaScript**:
  - «Enviar pedido» manda el carrito a «revisar». El servidor devuelve el resumen con total y plazo, y la confirmación llega abierta.
  - Con JavaScript, el total se calcula en el cliente y la confirmación se abre sin ir al servidor.
- **Filtros sin perder el carrito**: el de categoría oculta fichas, pero no las quita del formulario, así que filtrar no vacía el carrito. Cambiar de restaurante sí lo vacía, porque cambia el catálogo.
- **Quién ve qué**:
  - La marca ve y pide para los restaurantes de su marca; el gerente, para los suyos.
  - Producción (Albatros) no entra en Reposiciones, como en la matriz de permisos.
