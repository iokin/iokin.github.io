# Precios de carburantes en España

Web estática para consultar los precios oficiales de carburantes (API REST del MITECO) por localidad o cerca de ti. El nombre de cada estación enlaza a Google Maps.

## Archivos

- `index.html`: estructura semántica y accesible.
- `styles.css`: estilos responsive, sin dependencias.
- `app.js`: buscador, geolocalización, consulta, ordenación y paginación.

## Probar en local

```bash
python -m http.server 8000
```

Abre <http://localhost:8000>. No hay dependencias que instalar. La geolocalización solo funciona en `localhost` o con HTTPS (GitHub Pages lo es).

## Publicar en GitHub Pages

Sube los cuatro archivos a la raíz del repositorio y activa **Settings → Pages** (rama principal, carpeta `/`). Después prueba una consulta real (ver «CORS»).

## Cómo funciona

- **Localidad:** escribe un municipio (sin tildes ni mayúsculas, con sugerencias). Si el nombre es único se consulta directamente; si hay varios («Zalla», «San Sebastián»), eliges cuál.
- **Cerca de mí:** pide tu ubicación al navegador y muestra las estaciones a menos de 15 km. Si no hay ninguna, las 10 más cercanas. Las distancias se calculan en el navegador con las coordenadas de cada estación.
- **Combustible:** el único filtro. Al cambiarlo se repite la última búsqueda.
- **Orden:** más baratas (por defecto), más caras o, con «Cerca de mí», más cercanas.
- **Google Maps:** usa las coordenadas oficiales; si faltan o quedan fuera de España, busca por nombre y dirección.
- **Fecha:** la que devuelve el servicio al responder, no la del último cambio de cada precio.
- **Móvil (≤ 640 px):** se ocultan dirección y horario para que el precio sea visible.

### Detalles de «Cerca de mí»

La API no consulta por radio, así que se piden las provincias cuyo centro queda más cerca de tu ubicación (hasta 3 y a menos de 160 km). Los centros de `PROVINCES` en `app.js` son aproximados y solo sirven para elegir provincias; la distancia final sale de cada estación. Las estaciones sin coordenadas válidas no aparecen en esta búsqueda.

## API oficial

- Portal: <https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/>
- Localidades: `Listados/Municipios/` (se descarga al usar el buscador y se guarda 30 días en `localStorage`)
- Por municipio: `EstacionesTerrestres/FiltroMunicipioProducto/{IDMUNICIPIO}/{IDPRODUCTO}`
- Por provincia: `EstacionesTerrestres/FiltroProvinciaProducto/{IDPROVINCIA}/{IDPRODUCTO}`
- Los IDs de combustible y provincia coinciden con los listados oficiales (verificado el 10/10/2026). Gasolina 95 E10 es el ID 23.

## CORS

La web llama a la API directamente desde el navegador y el servicio no garantiza CORS para todos los dominios. Pruébala en GitHub Pages (pestaña Network). Si el navegador la bloquea, hace falta un proxy sencillo (por ejemplo, una Cloudflare Worker) que reenvíe la consulta con las cabeceras CORS.

Las peticiones tienen un límite de 30 segundos (60 la lista de localidades).

## Privacidad y licencia

Sin cookies ni analítica. Tu ubicación no se envía ni se guarda: solo se consultan provincias cercanas. Los enlaces a Google Maps abren una pestaña nueva y se anuncian a los lectores de pantalla. Código: MIT. Los datos siguen las condiciones del MITECO.
