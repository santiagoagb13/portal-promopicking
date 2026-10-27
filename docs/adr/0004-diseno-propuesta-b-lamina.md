# ADR 0004 · Sistema de diseño: propuesta B «Lámina»

- Estado: aceptada (fase 0, 27/10/2026; implementada en la fase 1)
- Contexto: secciones 7.1–7.5 del plan; maquetas en `docs/propuestas/`.

## Decisión

Propuesta B «Lámina» con las diez reglas de la sección 7.5: hoja blanca con poca tinta, líneas de 1 px en lugar de tarjetas, Geist + Geist Mono, títulos de 24 px con peso 500, radio 0 en superficies y 2 px en controles, el acento es la tinta (negro en claro, blanco en oscuro) y los únicos colores son los de estado.

## Cómo se ha llevado al código

- **Tokens** en `src/app.css`, copiados de `b-lamina-campanas.html`: `:root` (claro), `prefers-color-scheme` (oscuro salvo que se fuerce claro) y `[data-theme=dark]`. Tailwind v4 los expone en `@theme inline` y se vacían las escalas por defecto de color, radio, sombra y tipo, de modo que no se pueden usar valores fuera del sistema.
- **Tema** sistema / claro / oscuro en una cookie que el servidor pinta en `<html data-theme>`: no hace falta JS de arranque ni hay destello.
- **Fuentes** de `@fontsource-variable` servidas desde el propio dominio (CSP `font-src 'self'`); con `unicode-range` el navegador solo descarga el subconjunto latino: dos ficheros.
- **Iconos** Lucide a 20 px (16 en tablas), trazo 1,5, importados uno a uno.
- **Componentes** (`src/lib/components`): botón con variantes semánticas y versión solo icono con tooltip obligatorio, chip de estado, chip de marca neutro, semáforo, barra de progreso neutra, tabla que pasa a fichas (dos columnas entre 768 y 1023 px, una en móvil con 8 filas y «Ver más»), diálogo de confirmación nativo con «escribe el nombre», aviso con «Deshacer» y estado vacío.

## Decisiones al implementar

1. **Barra de progreso en SVG.** La CSP no admite estilos en línea, así que el ancho no puede ir en `style="width: 83%"`; se dibuja con un `<rect width>` en SVG.
2. **El tema va en el menú de cuenta** (8.2) y no como icono suelto en la barra superior como en la maqueta.
3. **Sin conmutador tabla / calendario ni filtro de fase** en el panel: la vista de calendario llega con la fase 2. El buscador de la barra superior filtra campañas por nombre o código hasta que exista el buscador global.
4. **«Administración»** aparece en el sidebar para quien puede invitar (admin y marca), además de las ocho secciones de la maqueta.
5. **Diálogos sin JS**: el disparador es un enlace a `?confirmar=…` y la página llega con el diálogo abierto; con JS se abre en modal sin navegar.
