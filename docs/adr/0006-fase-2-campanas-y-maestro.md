# ADR 0006 · Decisiones de la fase 2 (campañas, maestro y administración)

- Estado: aceptada (27/10/2026)
- Contexto: secciones 8.3, 8.4, 8.10, 8.12 y 5.4 del plan; criterio de la fase: «un admin crea una campaña y un usuario de marca la ve solo en su marca».

## Campañas

- **Alta**: el «+» del panel abre un panel lateral que se descarga al pulsarlo. Sin JavaScript, el mismo enlace lleva a `/campanas/nueva`, que es una página normal. Se hace así para mantener la ruta del panel por debajo de 60 KB de JS (9.2): con el formulario cargado de entrada llegaba a 65 KB.
- **Códigos**: `PREFIJO-AA-NN` (`VI-27-01`), el siguiente número de la marca y el año, generado bajo un cerrojo de transacción. El prefijo (FH, VI, GI) se guarda en `brands.id_prefix`.
- **Hitos**: se calculan con los plazos de Administración › Ajustes (por defecto, los de `calDates()` del prototipo) y son editables. Al cambiar la fecha en restaurante se recalculan los que no están hechos.
- **Archivar en vez de borrar**: la campaña archivada sale del panel y de los KPI, conserva todo y se puede restaurar. Archivar exige escribir el nombre.
- **Duplicar como plantilla**: copia los datos y los soportes (en fase de brief, sin artes) con una fecha nueva.
- **Soportes**: alta, edición y borrado desde el detalle; no se borra un soporte que ya tenga artes finales. La fase de cada soporte se fija a mano hasta que la muevan las aprobaciones (fase 3) y los kits (fase 4).
- **Pendiente para la fase 3**: «Subir artes» y la sección de documentos del lateral del detalle.
- **Calendario**: rejilla mensual de lunes a domingo; en móvil pasa a agenda (solo los días con hitos).

## Maestro de restaurantes

- **Decisión pendiente 7 del plan (qué campos edita Alsea)**: mientras no se acuerde otra cosa, marketing de marca edita nombre, ciudad, dirección, tarifa, idioma, surtido y fachada de su marca. El punto de entrega, las altas, las bajas y la importación son solo de Promopicking. Está en `BRAND_EDITABLE` (`src/lib/domain/master.ts`) y se cambia en una línea. **Hay que confirmarlo con Alsea.**
- **Valores cerrados** (tarifa, idioma, surtido y entrega) por marca, los del prototipo, como constantes. Pasarán a Ajustes cuando haya que añadir uno sin desplegar.
- **Cambiar tarifa, idioma o surtido** pide confirmación, porque cambia la versión que recibe el restaurante. Funciona sin JS: el servidor responde 409 con el resumen y el formulario se reenvía confirmado.
- **Histórico de la ficha**: se lee del registro de auditoría (`entity = restaurant`); no hay una tabla aparte.
- **Importación de Excel** (`read-excel-file`) o CSV:
  - Se sube el fichero, se guarda la comparación en `master_imports`, se previsualiza y se confirma.
  - Se aplica en una transacción, una sola vez, y cada restaurante deja su entrada en la auditoría.
  - Las bajas son lógicas (`active = false`): los restaurantes activos de las marcas que aparecen en el fichero y que no vienen en él. Las marcas que no aparecen no se tocan.
  - Con un solo error, no se aplica nada.
- **Descarga** en .xlsx (`write-excel-file`) con las mismas columnas que admite la importación.
- **Validación trimestral por marca** (`master_validations`): la hacen Promopicking o el marketing de la marca y queda quién y cuándo.

## Administración

- **Pestañas por rol**: Usuarios, Invitaciones, Auditoría y Ajustes. Marketing de marca solo ve Usuarios e Invitaciones, y solo con los gerentes de su marca.
- **Cambiar rol o ámbito, o suspender, cierra todas las sesiones de la persona** (4.3). Nadie se gestiona a sí mismo desde aquí y siempre queda al menos otra cuenta de administración activa.
- **Eliminar = anonimizar**: se borran passkeys, sesiones y ámbito; la fila queda como «Cuenta eliminada» (`status = deleted`). El registro de auditoría es inmutable (ADR 0003): sus entradas siguen apuntando al mismo id, que ya no identifica a nadie. Así se cumple el «borrado que anonimiza la auditoría» de 4.3 sin reescribir el registro.
- **Auditoría**: filtros en la URL (usuario, acción, entidad o id, fechas), 50 por página y exportación a CSV con los mismos filtros (separador «;» y BOM, como espera Excel en español).
- **Ajustes**: plazos de las fases y objetivo OTIF. Los datos de la empresa y el correo remitente llegan cuando haya correo real.

## Técnica

- **Iconos de Lucide agrupados en un único fichero** (`build.rolldownOptions.output.advancedChunks`). Con decenas de módulos pequeños, el sobrecoste por fichero pesaba más que los iconos que no se usan en la ruta. La ruta del panel queda en unos 58 KB.
- **CSP**: el anunciador de rutas de SvelteKit lleva un estilo en línea fijo. Se autoriza solo ese estilo por su hash (`style-src-attr 'unsafe-hashes' 'sha256-…'`) y `app.css` lo oculta igualmente por si el hash cambia con una versión de SvelteKit. Sigue sin haber `unsafe-inline`.
- **Mensajes de validación de Zod en español** (`src/lib/schemas/z.ts`).
- **Pruebas E2E**: un paso previo (`auth.setup.ts`) entra una vez por usuario con enlace mágico y guarda la sesión. Sin eso, el límite real de intentos por IP y por correo se alcanzaba dentro de una misma ejecución.
