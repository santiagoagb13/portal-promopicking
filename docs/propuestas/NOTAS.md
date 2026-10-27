# Maquetas de la fase 0 · notas de valoración

Seis páginas estáticas (HTML + CSS incrustado, sin build) con los datos reales del prototipo (`CAMPAIGNS`, `APPROVALS`, fecha de referencia 22/10/2026): Panel de campañas (8.3) y Aprobación de artes finales (8.5) para las propuestas A «Taller», B «Lámina» y C «Pliego». `index.html` enlaza las seis, reproduce la comparativa de 7.3 y muestra las 24 capturas de `capturas/` (1440 y 375 px, claro y oscuro). Comprobado con Playwright que ninguna página tiene scroll horizontal a 375, 480, 768, 1024, 1280 ni 1440 px, en claro y en oscuro.

Cada página lleva conmutador de modo oscuro (luna/sol en la barra superior; sigue el sistema por defecto y acepta `?tema=oscuro`), filtro por marca (`?marca=FH`), el diálogo «¿Aprobar 4 versiones de Carta surtido FH?» abierto al cargar (`?sindialogo` lo evita) y, en móvil, pantallas encadenadas soportes → versiones → visor con botón de volver.

## Lo que ha quedado peor de lo esperado

### Común a las tres

- **Ámbar como texto.** El ámbar de las tres paletas no llega a AA 4,5:1 cuando se usa como texto de 12 px en los chips «Pendiente» (A 4,1 · B 3,6 · C 3,8 sobre su fondo claro). Vale para el punto del semáforo y los iconos; para texto hay que oscurecerlo un paso en las tres propuestas.
- **Semáforo y progreso dicen lo mismo.** La barra de progreso se tiñe de rojo o ámbar según el semáforo (como en el prototipo), así que en cada fila hay dos indicadores del mismo estado. En la v2 conviene que la barra sea siempre neutra y el semáforo el único color.
- **Cabecera del visor en móvil.** Cuatro acciones de 44 px no caben junto al código de versión a 375 px: pasan a una segunda línea y la cabecera ocupa dos filas, restando altura al visor.
- **Tablet (768–1023 px).** La tabla de 7 columnas solo entra comprimiendo (sin fecha relativa, «Rtes.» abreviado, celdas de 6 px). Una rejilla de fichas a dos columnas sería mejor en ese tramo.
- **Panel en móvil muy largo.** 17 fichas son unos 3 700 px de alto; la barra de progreso dentro de la ficha aporta poco y podría eliminarse en móvil.
- **Zoom, comparar y ordenar** son solo iconos sin comportamiento en la maqueta.

### A · «Taller»

- El modo oscuro pierde la identidad: el sidebar navy pasa a ser una superficie gris y el navy de la acción principal hay que aclararlo a `#3f6fae` para que el texto blanco contraste, con lo que el «azul de marca» del oscuro es otro azul.
- La sensación «ERP» que temía el plan es real: tarjetas con borde, cebra y cabeceras en mayúsculas lo acercan mucho al prototipo. Es la propuesta más densa (17 campañas en 950 px) y la menos distinguible de hoy.

### B · «Lámina»

- Los chips de marca con color propio (teja, azul, verde) añaden tres colores a cada fila y compiten con el semáforo: el chip rojo-teja de FH se lee como alerta al lado del punto verde. Rompe la idea de «poca tinta».
- El sidebar de solo iconos deja los contadores (13, 1) encima de los iconos a 56 px; sin pasar el ratón no se sabe qué sección es cuál.
- Es la menos densa: con filas de 44 px la tabla de 17 campañas no cabe en una pantalla de 900 px (la captura mide 1 083 px).
- El «acento negro» no sobrevive al modo oscuro: la acción principal se vuelve un botón blanco. Funciona, pero deja de ser un rasgo de la propuesta.

### C · «Pliego»

- **El cobre choca con el ámbar.** Las fases «En producción» y «En kitting» van en chip cobre (acción principal) y quedan junto a semáforos y barras ámbar; a primera vista el chip cobre parece un aviso. Al no haber azul, «Expedida» pasa a un chip neutro y se confunde con «Brief recibido». La paleta cálida tiene menos tonos libres para estados.
- Fraunces en el título del diálogo parte en dos líneas la frase de confirmación ya a 480 px.
- Tres familias de Google Fonts (Fraunces variable con eje `opsz` incluido): es la primera carga más pesada y el cambio de fuente al cargar se nota.
- El trazo 1,25 de los iconos se ve fino en modo oscuro, sobre todo en los iconos desactivados.
- Lo bueno que sí se confirma: el cobre sobre hueso contrasta 5,5:1 y la propuesta es la que más se diferencia de una plantilla.

## Cómo se han hecho

Las seis páginas salen de un generador (plantilla común + bloque de paleta y tipografía por propuesta) y las capturas de un script de Playwright; ambos están guardados fuera del repositorio, en la carpeta de notas compartidas de la sesión, por si hay que regenerar o volver a capturar tras un cambio. Las páginas son autónomas: se pueden editar a mano sin el generador.

## Correcciones aplicadas a B (27/10/2026)

Elegida la propuesta B «Lámina»; sus dos maquetas incorporan las diez reglas de la sección 7.5 del plan. A y C no se han tocado.

| Regla | Cómo queda en la maqueta |
|---|---|
| 1 · Dos ámbares | `--amber #b7791f` solo en iconos, puntos del semáforo y contadores (texto `#111` encima); chips «Pendiente» con texto `#8a5a10` sobre `#fbf3e3` (5,7:1). En oscuro `#f0b65a` / `#f6cf8a` sobre `#2a2215`. |
| 2 · Barra neutra | La barra es siempre tinta sobre `#e6e6e6`; el semáforo es el único color de la fila. |
| 3 · Chips de marca neutros | Fondo `#f2f2f2`, texto `#111`, 12 px, radio 2 px; sin teja, azul ni verde. |
| 4 · Sidebar de 72 px | Icono con etiqueta corta de 11 px en una línea (Campañas · Aprobaciones · Kits · QR · Reposiciones · Informes · Maestro · Soporte) y contador en la esquina superior derecha; desde 1280 px, 232 px con el nombre largo al lado. Sin expansión al pasar el ratón. |
| 5 · Filas de 40 px | Tabla de campañas a 40 px (17 campañas en 1 000 px de alto a 1440, antes 1 083); lista de versiones a 36 px; 44 px solo en móvil. |
| 6 · Acento tinta | Sin cambios: negro en claro, blanco en oscuro. |
| 7 · Tablet | Entre 768 y 1023 px el panel pasa a fichas a dos columnas (captura `b-lamina-campanas-768-claro.png`); la tabla completa solo desde 1024 px. Se retira la compresión de columnas que había. |
| 8 · Acciones del visor | En móvil van en una barra inferior fija de 56 px que sustituye a la barra de navegación mientras se está en el visor; la cabecera lleva solo volver y el código. |
| 9 · Fichas en móvil | Progreso como texto con el mismo porcentaje ponderado por soporte que la tabla de escritorio («83 %») y sin barra; se muestran 8 campañas y un botón «Ver más · 9». |
| 10 · Diálogo | 440 px y título de 18 px; por debajo de 480 px el título baja a 16 px y los márgenes a 16 px, y así la pregunta cabe en una línea hasta 360 px (aceptado y recogido en la regla). |

Comprobado con Playwright: sin scroll horizontal a 375, 480, 768, 1024, 1280 y 1440 px, en claro y oscuro; el título del diálogo ocupa una sola línea a 360, 375, 480, 768 y 1440 px.

### Ajustes finales (27/10/2026)

Tras la revisión del apartado anterior: etiquetas cortas de una línea en el sidebar de 72 px (los nombres largos se conservan en el modo de 232 px), porcentaje ponderado en las fichas móviles en lugar de «4/7», y el título del diálogo a 16 px por debajo de 480 px aceptado como regla. Capturas regeneradas: panel a 375 px (claro y oscuro) y a 768 px; las de 1440 px y las de aprobación no cambian porque el sidebar ancho conserva los nombres largos y el visor a 768 px cubre el sidebar.

### Lo que sigue sin quedar del todo bien

- **Tabla de campañas a 1440 × 900.** Con filas de 40 px la página mide unos 1 000 px de alto: entran 15 de las 17 campañas sin desplazarse.
- **Barra de acciones en móvil y diálogo.** En la captura a 375 px el diálogo (hoja inferior) tapa la barra de acciones del visor; la barra está debajo y se ve al cancelar.
