# Catálogo EnFrío Distribuidora

Catálogo web de productos congelados con panel de administración. **No usa base de datos ni
servidor**: es un sitio estático publicado en GitHub Pages, y los productos y clientes fijos son
archivos del propio repositorio que el panel guarda a través de GitHub.

```
Cliente ── catálogo (index.html) ── lee ──> datos/productos.json, datos/clientes.json
Negocio ── panel (admin.html) ── guarda con la API de GitHub ──> esos mismos archivos
                                    └─ GitHub Pages republica el sitio en 1 o 2 minutos
```

- El cliente elige **Minorista** o **Mayorista** y **Empaquetado** o **A granel**, arma el pedido
  y lo manda por WhatsApp.
- Todos ven el **precio de lista** (cliente nuevo). Los **clientes fijos** los da de alta el negocio
  en el panel: cada uno recibe un **link personal** con el que ve sus precios de cliente fijo.

## Carpetas

| Archivo | Qué es |
| --- | --- |
| `index.html`, `style.css`, `app.js` | El catálogo. |
| `admin.html`, `admin.css`, `admin.js` | El panel de administración. |
| `comun.js` | Lo que usan los dos: categorías, formato de precios y cifrado. |
| `config.js` | Número de WhatsApp, repositorio de GitHub y dirección del sitio. |
| `datos/productos.json` | Productos y precios. Se edita desde el panel. |
| `datos/clientes.json` | Clientes fijos (cifrados). Se edita desde el panel. |
| `datos/acceso.json` | La llave de GitHub cifrada con la contraseña del panel. Lo crea el panel. |
| `scripts/importar_excel.py` | Se usó para la carga inicial desde los Excel. **Volver a correrlo pisa lo cargado en el panel.** |
| `img/` | Logos. |

## Puesta en marcha del panel (una sola vez)

El panel necesita una **llave de GitHub** para poder guardar. La crea Lautaro desde su cuenta:

1. Entrar a GitHub → foto de perfil → **Settings** → **Developer settings** → **Personal access tokens**
   → **Fine-grained tokens** → **Generate new token**.
2. Nombre: `Panel EnFrío`. Expiration: **No expiration**.
3. **Repository access** → **Only select repositories** → elegir `catalogo-enfrio-distrubuidora`.
4. **Permissions** → **Repository permissions** → **Contents** → **Read and write**. Nada más.
5. **Generate token** y copiar la llave (empieza con `github_pat_`). GitHub la muestra una sola vez.
6. Abrir `https://squicciarinilautaro.github.io/catalogo-enfrio-distrubuidora/admin.html`
   (con este código ya publicado), pegar la llave y elegir la contraseña del negocio.
7. Pasarle al cliente la dirección del panel y la contraseña. La llave no se la tiene que saber nadie.

La llave no vence. Si alguna vez hay que cambiarla (por ejemplo si se filtró, o si se borró en
GitHub y el panel dice "La llave de GitHub dejó de funcionar"): crear una llave nueva igual a la
anterior, borrar el archivo `datos/acceso.json` del repositorio y volver a entrar a `admin.html`,
que pide de nuevo la llave y la contraseña. Los productos y los clientes fijos no se pierden.

### Seguridad
- La llave queda guardada **cifrada** con la contraseña (`datos/acceso.json`): sin la contraseña no
  sirve. Por eso la contraseña tiene que ser larga (mínimo 10 caracteres; mejor una frase).
- La llave solo puede tocar este repositorio.
- El repositorio es público: cualquiera que sepa buscar puede ver `productos.json`, incluidos los
  precios de cliente fijo. Los nombres y teléfonos de los clientes fijos **no** se pueden leer.

## Qué puede hacer el negocio en el panel

- **Productos:** cambiar precio de lista, precio fijo y stock directamente en la lista; editar,
  agregar o eliminar productos; subir o bajar un % los precios de los productos filtrados; recalcular
  el precio fijo como "lista menos X%". Los cambios se acumulan y se publican todos juntos con
  **Publicar cambios**.
- **Clientes fijos:** agregar (nombre y WhatsApp), copiar o mandar por WhatsApp su link personal,
  dar de baja (el link deja de funcionar).
- **Ajustes:** cambiar la contraseña.

## Probar en la computadora

```bash
python -m http.server 5173
```

- Catálogo: http://localhost:5173
- Panel en **modo prueba** (guarda todo en el navegador, no toca el catálogo real):
  http://localhost:5173/admin.html?prueba

Abrir `index.html` con doble clic no funciona porque el navegador no deja leer los archivos de `datos/`.
