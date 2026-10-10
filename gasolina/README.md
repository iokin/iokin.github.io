# Precios de carburantes en España

Web estática para consultar estaciones de servicio filtrando por comunidad autónoma, provincia (opcional), municipio y combustible, con resultados ordenables por precio, municipio o nombre y paginación. El nombre de cada estación enlaza a su ubicación en Google Maps. Los datos proceden del servicio REST oficial de precios de carburantes del MITECO.

## Contenido

- `index.html`: estructura semántica y accesible.
- `styles.css`: estilos responsive, sin dependencias ni frameworks.
- `app.js`: filtros, consulta de precios, ordenación y paginación.

## Ejecutar en local

No necesita instalación de dependencias.

1. Descomprime el ZIP.
2. Abre una terminal en la carpeta del proyecto.
3. Ejecuta un servidor estático, por ejemplo:

   ```bash
   python -m http.server 8000
   ```

4. Abre <http://localhost:8000>.

También puedes abrir `index.html` directamente, aunque un servidor local facilita depurar las peticiones de red.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub.
2. Sube `index.html`, `styles.css`, `app.js` y `README.md` a la raíz del repositorio.
3. En **Settings → Pages**, configura la publicación desde la rama principal y la carpeta `/ (root)`.
4. Abre la URL que proporciona GitHub Pages y comprueba una consulta real (ver «Incidencias: CORS»).

## Fuente oficial y API

- Portal de servicios: <https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/>
- Listado de provincias: <https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/Listados/Provincias/>
- Listado de productos petrolíferos: <https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/Listados/ProductosPetroliferos/>
- Consulta por provincia y producto: `EstacionesTerrestres/FiltroProvinciaProducto/{IDPROVINCIA}/{IDPRODUCTO}`
- Consulta por comunidad autónoma y producto: `EstacionesTerrestres/FiltroCCAAProducto/{IDCCAA}/{IDPRODUCTO}`
- Documentación: <https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/help/operations/PreciosEESSTerrestresFiltroProvinciaProducto>

Los identificadores de combustible y de provincia coinciden con los listados oficiales (verificados el 10/10/2026). Por ejemplo, **Gasolina 95 E10 es el ID 23**. La web intenta negociar JSON mediante la cabecera `Accept: application/json`.

## Cómo funcionan los filtros

- **Comunidad autónoma y provincia:** la provincia es opcional. Si eliges una, se consulta por provincia; si dejas «Todas las provincias», se consulta toda la comunidad (puede tardar más y devolver miles de estaciones).
- **Municipio:** es un campo de texto. Se activa tras la consulta, filtra en el navegador (sin nueva petición), no distingue tildes ni mayúsculas y acepta texto parcial («alcala» encuentra «Alcalá de Henares»). Ofrece sugerencias con los municipios de la consulta.
- **Google Maps:** el enlace usa las coordenadas que publica el servicio oficial. Si faltan o quedan fuera de España, busca por nombre y dirección.
- **Fecha de datos:** es la que devuelve el servicio al responder. Indica cuándo se generó la respuesta, no cuándo cambió el precio cada estación.
- **Pantallas estrechas (≤ 640 px):** se ocultan las columnas de dirección y horario para que el precio sea siempre visible.

## Incidencias: CORS, red o formato

Este proyecto es estático y consulta la API oficial directamente desde el navegador. La documentación consultada describe la operación y el formato JSON, pero no garantiza que el servidor permita peticiones cross-origin desde todos los dominios. Antes de dar la web por operativa en producción, prueba la carga en GitHub Pages y revisa la pestaña **Network/Console** de las herramientas de desarrollo.

Si el navegador bloquea la petición por CORS, no se puede solucionar solo con HTML/JavaScript del cliente. En ese caso, añade un pequeño proxy en servidor (por ejemplo, una Cloudflare Worker o una función serverless) que consulte únicamente el servicio oficial y devuelva JSON con las cabeceras CORS apropiadas. No se incluye un proxy ficticio en este ZIP porque requiere desplegarlo y configurarlo por separado.

Las peticiones tienen un límite de 30 segundos; si el servicio no responde, se muestra un aviso.

## Privacidad y accesibilidad

No se recogen datos personales ni se usan cookies o analítica. Los filtros, mensajes de estado y tabla tienen etiquetas y estructura semántica; se incluye soporte para teclado, foco visible y preferencias de movimiento reducido. Los enlaces a Google Maps se abren en una pestaña nueva y lo anuncian a los lectores de pantalla. Al visitar Google Maps se aplican las condiciones de Google.

## Licencia

Código del proyecto: MIT. Los datos de precios siguen sujetos a las condiciones y avisos del proveedor oficial.
