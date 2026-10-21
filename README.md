# CASTA XBOX VAULT — PWA universitaria

## Archivos
- `index.html`: interfaz y estilos.
- `manifest.json`: identidad y configuración de instalación.
- `app.js`: consulta RAWG, búsqueda, filtros y favoritos.
- `sw.js`: caché de recursos y portadas consultadas.
- `icons/`: iconos PNG de la aplicación.

## Configurar RAWG
1. Obtén una API key en https://rawg.io/apidocs.
2. Abre `app.js`.
3. Sustituye `PEGA_AQUI_TU_CLAVE_DE_RAWG` por tu clave.
4. Recuerda: una clave escrita en JavaScript del navegador es visible para los visitantes. Para producción, conviene usar un backend.

## Ejecutar en Mac
No abras `index.html` con doble clic. Las PWA y los service workers requieren `localhost` o HTTPS.
En VS Code, instala la extensión **Live Server**, haz clic derecho sobre `index.html` y selecciona **Open with Live Server**.
También puedes ejecutar un servidor estático desde Terminal, estando dentro de la carpeta:
`python3 -m http.server 8000`
Después abre `http://localhost:8000`.

## Probar
- Con internet: configura la clave y revisa el catálogo.
- Guarda varios favoritos.
- Visita el catálogo para que el navegador almacene los recursos y portadas.
- En DevTools > Application revisa Manifest y Service Workers.
- En DevTools > Network marca Offline y recarga para comprobar el modo sin conexión.
- Para instalar en un móvil, publica el proyecto en HTTPS (por ejemplo, GitHub Pages) y abre el enlace desde un navegador compatible.

## Límites de modo sin conexión
La interfaz, los favoritos, los juegos guardados y las portadas que ya se hayan almacenado pueden estar disponibles offline. La búsqueda en RAWG y los juegos que nunca se hayan cargado necesitan conexión. Los navegadores también pueden borrar cachés por gestión de almacenamiento.

## Atribución
Este proyecto académico usa la RAWG Video Games Database API. Revisa sus condiciones y requisitos de atribución antes de publicar o distribuir la aplicación.
