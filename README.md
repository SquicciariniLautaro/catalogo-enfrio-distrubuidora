# Catálogo EnFrío Distribuidora

Catálogo web de productos congelados con panel de administración. **No usa base de datos ni
servidor**: es un sitio estático publicado en Vercel, y los productos y clientes fijos son archivos
del propio repositorio que el panel guarda a través de GitHub.

```
Cliente ── catálogo (index.html) ── lee ──> datos/productos.json, datos/clientes.json
Negocio ── panel (admin.html) ── guarda con la API de GitHub ──> esos mismos archivos
                                    └─ Vercel publica el cambio solo, en 1 o 2 minutos
```

- El cliente elige **Minorista** o **Mayorista** y **Empaquetado** o **A granel**, arma el pedido,
  completa sus datos (entrega, pago, factura) y lo manda por WhatsApp.
- Todos ven el **precio de lista** (cliente nuevo). Los **clientes fijos** los da de alta el negocio
  en el panel: cada uno recibe un **link personal** con el que ve sus precios de cliente fijo.

## Carpetas

| Archivo | Qué es |
| --- | --- |
| `index.html`, `style.css`, `app.js` | El catálogo. |
| `admin.html`, `admin.css`, `admin.js` | El panel de administración. |
| `comun.js` | Lo que usan los dos: categorías, formato de precios y cifrado. |
| `config.js` | Número de WhatsApp, repositorio de GitHub donde guarda el panel y cuenta de Cloudinary para las fotos. |
| `vercel.json` | Que los datos no queden guardados viejos en el navegador y que el panel no aparezca en Google. |
| `datos/productos.json` | Productos y precios. Se edita desde el panel. |
| `datos/clientes.json` | Clientes fijos (cifrados). Se edita desde el panel. |
| `datos/acceso.json` | La llave de GitHub cifrada con la contraseña del panel. Lo crea el panel. |
| `scripts/importar_excel.py` | Se usó para la carga inicial desde los Excel. **Volver a correrlo pisa lo cargado en el panel.** |
| `img/` | Logos. |

## Publicar en Vercel (una sola vez)

1. Entrar a [vercel.com](https://vercel.com) → **Add New… → Project** → importar el repositorio
   `catalogo-enfrio-distrubuidora`.
2. **Framework Preset:** `Other`. Build Command y Output Directory vacíos (es un sitio estático).
3. **Deploy.** Queda en `https://<nombre-del-proyecto>.vercel.app` (después se le puede poner un dominio
   propio en Settings → Domains).
4. Desde ahí, cada vez que el panel guarda un cambio en GitHub, Vercel lo publica solo.
5. Apagar GitHub Pages para que no queden dos copias: en GitHub → Settings → Pages → Source: **None**.

Los links de los clientes fijos se arman con la dirección desde donde se usa el panel: entrar siempre
al panel por la dirección definitiva (la de Vercel o el dominio propio).

## Puesta en marcha del panel (una sola vez)

El panel necesita una **llave de GitHub** para poder guardar. La crea Lautaro desde su cuenta:

1. Entrar a GitHub → foto de perfil → **Settings** → **Developer settings** → **Personal access tokens**
   → **Fine-grained tokens** → **Generate new token**.
2. Nombre: `Panel EnFrío`. Expiration: **No expiration**.
3. **Repository access** → **Only select repositories** → elegir `catalogo-enfrio-distrubuidora`.
4. **Permissions** → **Repository permissions** → **Contents** → **Read and write**. Nada más.
5. **Generate token** y copiar la llave (empieza con `github_pat_`). GitHub la muestra una sola vez.
6. Abrir `https://<la-dirección-de-vercel>/admin.html`, pegar la llave y elegir la contraseña del negocio
   y la del dueño (la de Lautaro). Tienen que ser distintas.
7. Pasarle al cliente la dirección del panel y **su** contraseña. La llave no se la tiene que saber nadie
   (y no se pega en chats ni mensajes). Guardar la llave en un lugar seguro: es la llave maestra.

### Acceso del dueño (Lautaro)
Hay dos contraseñas: la del **negocio** y la del **dueño**. Con cualquiera de las dos se entra en el
mismo lugar de "Contraseña"; con la del dueño el panel dice **Panel · Dueño** arriba.
- El negocio puede cambiar su contraseña cuando quiera: la del dueño no se toca.
- El dueño, en **Ajustes → Contraseña del negocio**, le puede poner una contraseña nueva al negocio
  (por ejemplo si se la olvidó).
- Si el dueño se olvida su contraseña: en la pantalla de ingreso, **Soy el dueño del sistema: entrar con
  la llave de GitHub** → pegar la llave y elegir una contraseña nueva. Con la misma llave de siempre no
  pide nada más.
- **Cambiar la llave** (si se filtró, o si se borró en GitHub y el panel dice "La llave de GitHub dejó de
  funcionar"): crear una llave nueva igual a la anterior y entrar con **Soy el dueño del sistema** usando
  la llave nueva. Como es una llave distinta, pide también la contraseña del negocio: si se pone la
  actual, queda igual; si no se sabe, se escribe una nueva y hay que pasársela al negocio. En ese último
  caso la lista de clientes fijos se pierde (el panel avisa antes) y hay que volver a darlos de alta.
  No hace falta borrar `datos/acceso.json`.

### Seguridad
- La llave queda guardada **cifrada** en `datos/acceso.json`, una vez con cada contraseña y otra con la
  propia llave: sin una contraseña (o la llave) no sirve. Por eso las contraseñas tienen que ser largas
  (mínimo 10 caracteres; mejor una frase).
- La llave solo puede tocar este repositorio.
- El repositorio es público: cualquiera que sepa buscar puede ver `productos.json`, incluidos los
  precios de cliente fijo. Los nombres y teléfonos de los clientes fijos **no** se pueden leer.

## Qué puede hacer el negocio en el panel

- **Productos:** cambiar precio de lista, precio fijo y stock directamente en la lista; editar,
  agregar o eliminar productos; subir o bajar un % los precios de los productos filtrados; recalcular
  el precio fijo como "lista menos X%". Los cambios se acumulan y se publican todos juntos con
  **Publicar cambios**.
- **Código de barras:** en la ventana de cada producto se puede escribir o pasar con la pistola lectora
  (el Enter de la pistola no cierra la ventana). Se ve en la tarjeta del catálogo y se puede buscar por
  código tanto en el catálogo como en el panel. Es opcional.
- **Fotos:** en la ventana de cada producto, **Subir foto** la sube a Cloudinary (cuenta `ikzhq00e`,
  perfil de subida sin firmar `enfrio-catalogo`, carpeta `enfrio`). Antes de subirla, el panel achica la
  foto a 2000 px y la pasa a WEBP (una foto de 15 MB queda en ~1 MB), así entran fotos de celular o de
  cámara de hasta 50 MB. En el catálogo se muestran achicadas otra vez y en el formato más liviano. Si el perfil se borra o se renombra en Cloudinary, hay que actualizar `config.js`.
- **Clientes fijos:** agregar (nombre y WhatsApp), copiar o mandar por WhatsApp su link personal,
  dar de baja (el link deja de funcionar).
- **Descuento extra por cliente fijo:** opcional, al darlo de alta o después con el botón **Descuento**.
  Es un % que se resta del precio fijo solo para ese cliente (todos los clientes fijos comparten el
  mismo precio fijo; el descuento extra es lo que diferencia a uno de otro). Con su link ve los precios
  ya descontados, y el pedido de WhatsApp dice qué descuento tiene. Va cifrado con el código del link,
  así que nadie más lo puede leer.
- **Categorías nuevas:** en la ventana del producto, **Categoría → + Nueva categoría…**. Llevan el ícono
  de copo de nieve y van al final del catálogo. No se guardan aparte: existen mientras algún producto
  las use.
- **Ajustes:** cambiar la contraseña (el dueño, además, la del negocio).

## Probar en la computadora

```bash
python -m http.server 5173
```

- Catálogo: http://localhost:5173
- Panel en **modo prueba** (guarda todo en el navegador, no toca el catálogo real):
  http://localhost:5173/admin.html?prueba

Abrir `index.html` con doble clic no funciona porque el navegador no deja leer los archivos de `datos/`.
