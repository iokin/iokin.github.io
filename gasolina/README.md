# Precios de carburantes en España

Web estática para consultar los precios oficiales de carburantes (API REST del MITECO) con un buscador global, filtros plegables, ordenación y paginación. El nombre de cada estación enlaza a Google Maps.

## Archivos

- `index.html`: estructura semántica y accesible.
- `styles.css`: estilos responsive, sin dependencias.
- `app.js`: búsqueda, filtros, consulta, ordenación y paginación.

## Probar en local

```bash
python -m http.server 8000
```

Abre <http://localhost:8000>. No hay dependencias que instalar.

## Publicar en GitHub Pages

Sube los cuatro archivos a la raíz del repositorio y activa **Settings → Pages** (rama principal, carpeta `/`). Después prueba una consulta real (ver «CORS»).

## Cómo funciona

- **Buscador:** reconoce una provincia o comunidad dentro del texto y usa el resto para filtrar por dirección, estación, municipio o código postal. Ejemplos: `Sevilla`, `País Vasco`, `Gran Vía Madrid`. Si aparecen varias zonas, gana la última («Avenida de Madrid Valladolid» busca en Valladolid). No distingue tildes ni mayúsculas.
- **Consulta:** solo se llama al servicio al cambiar de zona o combustible. Refinar el texto filtra al instante, y repetir la misma búsqueda vuelve a consultar.
- **Filtros** (botón «Mostrar filtros»): comunidad, provincia, municipio (texto, filtra al escribir) y combustible. «Aplicar filtros» consulta con esa zona y refleja la zona en el buscador.
- **Google Maps:** usa las coordenadas oficiales. Si faltan o quedan fuera de España, busca por nombre y dirección.
- **Fecha:** es la que devuelve el servicio al responder, no la del último cambio de cada precio.
- **Móvil (≤ 640 px):** se ocultan dirección y horario para que el precio sea visible.

## API oficial

- Portal: <https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/>
- Por provincia: `EstacionesTerrestres/FiltroProvinciaProducto/{IDPROVINCIA}/{IDPRODUCTO}`
- Por comunidad: `EstacionesTerrestres/FiltroCCAAProducto/{IDCCAA}/{IDPRODUCTO}`
- Los IDs de combustible y provincia coinciden con los listados oficiales (verificado el 10/10/2026). Gasolina 95 E10 es el ID 23.

## CORS

La web llama a la API directamente desde el navegador y el servicio no garantiza CORS para todos los dominios. Pruébala en GitHub Pages (pestaña Network). Si el navegador la bloquea, hace falta un proxy sencillo (por ejemplo, una Cloudflare Worker) que reenvíe la consulta con las cabeceras CORS.

Las peticiones tienen un límite de 30 segundos.

## Privacidad y licencia

Sin cookies, analítica ni datos personales. Los enlaces a Google Maps abren una pestaña nueva y se anuncian a los lectores de pantalla. Código: MIT. Los datos siguen las condiciones del MITECO.
