# Portfolio 2026 · Julen De La Serna

Sitio estático (HTML, CSS y JavaScript sin dependencias) generado desde dos archivos de datos.
Rediseño de la web de 2021 con cuadrícula de trabajo, vídeos en bucle dentro de las miniaturas y cursor "play" que sigue al ratón.

## Dónde está cada cosa

| Qué | Dónde |
| --- | --- |
| Proyectos (título, artista, categoría, enlace, imagen) | `data/projects.json` |
| Textos, redes, clientes, email | `data/site.json` |
| Miniaturas | `assets/img/projects/<slug>.jpg` |
| Bucles de vídeo de las miniaturas | `assets/loops/<slug>.mp4` |
| Diseño y comportamiento | `assets/css/style.css`, `assets/js/main.js` |
| Generador de páginas | `tools/build.mjs` |

Las páginas (`index.html`, `work/*`, `about/`, `contact/`) se generan: no se editan a mano.

## Flujo de trabajo

```bash
node tools/build.mjs                          # regenera las páginas
python3 -m http.server 8000                   # abre http://localhost:8000
```

### Añadir un proyecto

1. Copia una entrada de `data/projects.json` y cambia `slug`, título, enlace e imagen.
2. Guarda la miniatura en `assets/img/projects/<slug>.jpg` (800×600 o mayor).
3. Ejecuta `node tools/build.mjs`.

Los proyectos con `"published": false` quedan fuera del sitio (hay dos pendientes de enlace).

### Vídeo en la miniatura

Si existe `assets/loops/<slug>.mp4`, la miniatura lo reproduce al pasar el ratón (y en móvil, al verla en pantalla).
Sin ese archivo, la miniatura muestra solo la imagen. Para crear uno desde el vídeo completo (necesita ffmpeg):

```bash
tools/make-loop.sh kolpe ~/Rodajes/kolpe.mov 42 6   # slug, vídeo, segundo de inicio, duración
```

### Formulario de contacto

Sin configurar, abre el programa de correo del visitante. Para enviar desde la propia web, pon la URL de un servicio de formularios
(Formspree, Web3Forms…) en `contactEndpoint` de `data/site.json`.

## Revisión cruzada (Claude + Muse)

1. Claude programa en una rama y abre un pull request.
2. Muse revisa el PR y deja sus comentarios en `REVIEW.md` (o como comentarios del PR).
3. Claude lee `REVIEW.md`, aplica los cambios y marca cada punto como resuelto.
