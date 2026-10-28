// Panel de administración. No hay base de datos: los productos y los clientes fijos son
// archivos del repositorio (datos/*.json) y el panel los guarda con la API de GitHub.
// Vercel vuelve a publicar el sitio solo con cada cambio, en uno o dos minutos.
//
// Con ?prueba en la dirección todo se guarda en este navegador (localStorage), para
// probar el panel sin tocar el catálogo real.

const CONFIG = window.CONFIG || {};
const MODO_PRUEBA = new URLSearchParams(location.search).has("prueba");
const VUELTAS_CONTRASENA = 600000;

const RUTA_ACCESO = "datos/acceso.json";
const RUTA_PRODUCTOS = "datos/productos.json";
const RUTA_CLIENTES = "datos/clientes.json";

const $ = (selector) => document.querySelector(selector);

// ---------- Dónde se guardan los archivos ----------
class ErrorGuardado extends Error {}

function utf8ABase64(texto) {
    return Cifrado.aBase64(new TextEncoder().encode(texto));
}
function base64AUtf8(base64) {
    return new TextDecoder().decode(Cifrado.deBase64(base64.replace(/\s/g, "")));
}

const GitHub = {
    llave: null,

    async pedir(ruta, opciones = {}, conLlave = true) {
        const encabezados = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
        if (conLlave && this.llave) encabezados.Authorization = `Bearer ${this.llave}`;
        let respuesta;
        try {
            respuesta = await fetch(`https://api.github.com/repos/${CONFIG.repositorio}${ruta}`, { ...opciones, headers: { ...encabezados, ...opciones.headers }, cache: "no-store" });
        } catch {
            throw new ErrorGuardado("No hay conexión con GitHub. Revisá internet y probá de nuevo.");
        }
        return respuesta;
    },

    explicar(respuesta) {
        if (respuesta.status === 401) return "La llave de GitHub dejó de funcionar. Avisale a Lambda Soluciones.";
        if (respuesta.status === 403) return "La llave de GitHub no tiene permiso para guardar en este repositorio.";
        if (respuesta.status === 409 || respuesta.status === 422) return "Alguien guardó cambios mientras tanto. Recargá el panel y volvé a hacer el cambio.";
        return `GitHub respondió con un error (${respuesta.status}). Probá de nuevo en un rato.`;
    },

    async leer(ruta, conLlave = true) {
        const respuesta = await this.pedir(`/contents/${ruta}?ref=${encodeURIComponent(CONFIG.rama)}`, {}, conLlave);
        if (respuesta.status === 404) return { contenido: null, sha: null };
        if (!respuesta.ok) throw new ErrorGuardado(this.explicar(respuesta));
        const datos = await respuesta.json();
        return { contenido: JSON.parse(base64AUtf8(datos.content)), sha: datos.sha };
    },

    async escribir(ruta, contenido, sha, mensaje) {
        const cuerpo = {
            message: mensaje,
            content: utf8ABase64(JSON.stringify(contenido, null, 1) + "\n"),
            branch: CONFIG.rama,
        };
        if (sha) cuerpo.sha = sha;
        const respuesta = await this.pedir(`/contents/${ruta}`, { method: "PUT", body: JSON.stringify(cuerpo) });
        if (!respuesta.ok) throw new ErrorGuardado(this.explicar(respuesta));
        return (await respuesta.json()).content.sha;
    },

    async probarLlave(llave) {
        const anterior = this.llave;
        this.llave = llave;
        try {
            const respuesta = await this.pedir("");
            if (respuesta.status === 401) throw new ErrorGuardado("Esa llave de GitHub no es válida.");
            if (!respuesta.ok) throw new ErrorGuardado("La llave no tiene acceso a este repositorio.");
            const repo = await respuesta.json();
            if (!repo.permissions?.push) throw new ErrorGuardado("La llave no tiene permiso de escritura (Contents: Read and write).");
        } finally {
            this.llave = anterior;
        }
    },
};

const Prueba = {
    llave: "prueba",
    clave: (ruta) => "enfrio-prueba-" + ruta,

    async leer(ruta) {
        const guardado = localStorage.getItem(this.clave(ruta));
        if (guardado) return JSON.parse(guardado);
        if (ruta === RUTA_ACCESO) return { contenido: null, sha: null };
        const respuesta = await fetch(ruta, { cache: "no-store" });
        const archivo = { contenido: respuesta.ok ? await respuesta.json() : null, sha: "inicial" };
        localStorage.setItem(this.clave(ruta), JSON.stringify(archivo));
        return archivo;
    },

    async escribir(ruta, contenido, sha) {
        const actual = await this.leer(ruta);
        if (actual.sha && actual.sha !== sha) throw new ErrorGuardado("Alguien guardó cambios mientras tanto. Recargá el panel y volvé a hacer el cambio.");
        const nuevo = { contenido, sha: Cifrado.alAzar(8) };
        localStorage.setItem(this.clave(ruta), JSON.stringify(nuevo));
        return nuevo.sha;
    },

    async probarLlave() {},
};

const Almacen = MODO_PRUEBA ? Prueba : GitHub;

// ---------- Estado ----------
const sesion = {
    claveDatos: null,   // cifra la lista privada de clientes
    acceso: null,       // { contenido, sha } de datos/acceso.json
};
let archivoProductos = { contenido: null, sha: null };
let archivoClientes = { contenido: null, sha: null };
let productos = [];     // lo que se está editando
let originales = new Map(); // id -> JSON del producto como está publicado
let clientes = [];      // [{ id, nombre, whatsapp, codigo, alta }]
let editando = null;    // producto abierto en el diálogo (null = nuevo)

// ---------- Avisos ----------
let esperaAviso;
function avisar(texto, tipo = "ok") {
    const el = $("#aviso-flotante");
    el.textContent = texto;
    el.dataset.tipo = tipo;
    el.hidden = false;
    clearTimeout(esperaAviso);
    esperaAviso = setTimeout(() => { el.hidden = true; }, tipo === "error" ? 8000 : 4000);
}

function mostrarErrorAcceso(texto) {
    const el = $("#acceso-error");
    el.textContent = texto;
    el.hidden = !texto;
}

async function ocupado(boton, tarea) {
    const texto = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Guardando…";
    try {
        return await tarea();
    } catch (error) {
        console.error(error);
        avisar(error instanceof ErrorGuardado ? error.message : "Algo salió mal. Probá de nuevo.", "error");
        return undefined;
    } finally {
        boton.disabled = false;
        boton.textContent = texto;
    }
}

// ---------- Ingreso ----------
// datos/acceso.json guarda la llave de GitHub y la clave con la que se cifra la lista de
// clientes en "ranuras" cifradas: una con la contraseña del negocio, otra con la del dueño
// del sistema (Lambda) y otra con la propia llave de GitHub, que le deja al dueño volver a
// entrar aunque se pierdan las contraseñas. Cambiar una contraseña solo reescribe su ranura.
async function cifrarRanura(contrasena, valor) {
    const sal = Cifrado.nuevaSal();
    const clave = await Cifrado.claveDeContrasena(contrasena, sal, VUELTAS_CONTRASENA);
    return { sal, vueltas: VUELTAS_CONTRASENA, secreto: await Cifrado.cifrar(clave, valor) };
}

async function abrirRanura(ranura, contrasena) {
    if (!ranura || !contrasena) return null;
    const clave = await Cifrado.claveDeContrasena(contrasena, ranura.sal, ranura.vueltas);
    try {
        return await Cifrado.descifrar(clave, ranura.secreto);
    } catch {
        return null;
    }
}

// El archivo de antes tenía una sola ranura sin nombre: la del negocio.
function ranuras() {
    const contenido = sesion.acceso?.contenido;
    return contenido?.secreto ? { negocio: contenido } : { ...contenido };
}

const datosRanura = () => ({ llave: Almacen.llave, claveDatos: sesion.claveDatosBase64 });
const claveDatosNueva = () => Cifrado.aBase64(crypto.getRandomValues(new Uint8Array(32)));

async function guardarAcceso(nuevas, mensaje) {
    const contenido = {
        ...ranuras(),
        ...nuevas,
        recuperacion: await cifrarRanura(Almacen.llave, { claveDatos: sesion.claveDatosBase64 }),
    };
    const sha = await Almacen.escribir(RUTA_ACCESO, contenido, sesion.acceso.sha, mensaje);
    sesion.acceso = { contenido, sha };
}

async function importarClaveDatos(base64) {
    return crypto.subtle.importKey("raw", Cifrado.deBase64(base64), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function entrar(rol, datos) {
    Almacen.llave = MODO_PRUEBA ? "prueba" : datos.llave;
    sesion.rol = rol;
    sesion.claveDatosBase64 = datos.claveDatos;
    sesion.claveDatos = await importarClaveDatos(datos.claveDatos);
    if (!ranuras().recuperacion) {
        // Panel configurado antes de que existiera la ranura de la llave: se agrega una sola vez.
        await guardarAcceso({}, "Panel: acceso de recuperacion").catch((error) => console.error(error));
    }
    await abrirPanel();
}

async function iniciarAcceso() {
    $("#aviso-prueba").hidden = !MODO_PRUEBA;
    $("#campo-llave-inicial").hidden = MODO_PRUEBA;
    if (!window.crypto?.subtle) {
        $("#acceso-cargando").hidden = true;
        mostrarErrorAcceso("Este navegador no permite usar el panel. Abrilo desde la dirección https del catálogo.");
        return;
    }
    try {
        sesion.acceso = await Almacen.leer(RUTA_ACCESO, false);
    } catch (error) {
        $("#acceso-cargando").hidden = true;
        mostrarErrorAcceso(error.message || "No se pudo conectar. Recargá la página.");
        return;
    }
    $("#acceso-cargando").hidden = true;
    if (sesion.acceso.contenido) {
        $("#form-ingreso").hidden = false;
        $("#ingreso-contrasena").focus();
    } else {
        $("#form-inicial").hidden = false;
    }
}

$("#form-ingreso").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarErrorAcceso("");
    const boton = e.submitter;
    boton.disabled = true;
    boton.textContent = "Entrando…";
    try {
        const contrasena = $("#ingreso-contrasena").value;
        const { dueno, negocio } = ranuras();
        let rol = "dueno";
        let datos = await abrirRanura(dueno, contrasena);
        if (!datos) {
            rol = "negocio";
            datos = await abrirRanura(negocio, contrasena);
        }
        if (!datos) throw new ErrorGuardado("Contraseña incorrecta.");
        await entrar(rol, datos);
    } catch (error) {
        console.error(error);
        mostrarErrorAcceso(error instanceof ErrorGuardado ? error.message : "No se pudo entrar. Probá de nuevo.");
    } finally {
        boton.disabled = false;
        boton.textContent = "Entrar";
    }
});

$("#form-inicial").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarErrorAcceso("");
    const llave = MODO_PRUEBA ? "prueba" : $("#inicial-llave").value.trim();
    const contrasena = $("#inicial-contrasena").value;
    const contrasenaDueno = $("#inicial-dueno").value;
    if (contrasena !== $("#inicial-repetir").value) return mostrarErrorAcceso("Las contraseñas del negocio no coinciden.");
    if (contrasenaDueno !== $("#inicial-dueno-repetir").value) return mostrarErrorAcceso("Las contraseñas del dueño no coinciden.");
    if (contrasena === contrasenaDueno) return mostrarErrorAcceso("La contraseña del dueño tiene que ser distinta de la del negocio.");
    if (!llave) return mostrarErrorAcceso("Falta la llave de GitHub.");

    const boton = e.submitter;
    boton.disabled = true;
    boton.textContent = "Guardando…";
    try {
        await Almacen.probarLlave(llave);
        Almacen.llave = llave;
        sesion.claveDatosBase64 = claveDatosNueva();
        await guardarAcceso({
            negocio: await cifrarRanura(contrasena, datosRanura()),
            dueno: await cifrarRanura(contrasenaDueno, datosRanura()),
        }, "Panel: configuracion inicial");
        await entrar("dueno", datosRanura());
    } catch (error) {
        console.error(error);
        mostrarErrorAcceso(error instanceof ErrorGuardado ? error.message : "No se pudo guardar. Probá de nuevo.");
    } finally {
        boton.disabled = false;
        boton.textContent = "Guardar y entrar";
    }
});

// Entrada del dueño con la llave de GitHub, para cuando no sabe (o no tiene) su contraseña.
// Con la misma llave de siempre alcanza; con una llave nueva hace falta además la contraseña
// del negocio: la actual (se mantiene) o una nueva (el negocio pasa a entrar con esa).
function mostrarIngresoDueno(mostrar) {
    mostrarErrorAcceso("");
    $("#form-ingreso").hidden = mostrar;
    $("#form-dueno").hidden = !mostrar;
    (mostrar ? $("#dueno-llave") : $("#ingreso-contrasena")).focus();
}
$("#boton-soy-dueno").addEventListener("click", () => mostrarIngresoDueno(true));
$("#boton-volver-ingreso").addEventListener("click", () => mostrarIngresoDueno(false));

$("#form-dueno").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarErrorAcceso("");
    const llave = $("#dueno-llave").value.trim();
    const contrasena = $("#dueno-contrasena").value;
    const contrasenaNegocio = $("#dueno-negocio").value;
    if (contrasena !== $("#dueno-repetir").value) return mostrarErrorAcceso("Las contraseñas no coinciden.");
    if (contrasena === contrasenaNegocio) return mostrarErrorAcceso("Tu contraseña tiene que ser distinta de la del negocio.");

    const boton = e.submitter;
    boton.disabled = true;
    boton.textContent = "Entrando…";
    try {
        await Almacen.probarLlave(llave);
        Almacen.llave = MODO_PRUEBA ? "prueba" : llave;
        const actuales = ranuras();
        const nuevas = {};
        const recuperado = await abrirRanura(actuales.recuperacion, llave);
        if (recuperado) {
            if (await abrirRanura(actuales.negocio, contrasena)) throw new ErrorGuardado("Tu contraseña tiene que ser distinta de la del negocio.");
            sesion.claveDatosBase64 = recuperado.claveDatos;
        } else {
            if ($("#campos-negocio-dueno").hidden) {
                $("#campos-negocio-dueno").hidden = false;
                $("#dueno-negocio").focus();
                throw new ErrorGuardado("Falta un paso: escribí también la contraseña del negocio (abajo).");
            }
            const delNegocio = await abrirRanura(actuales.negocio, contrasenaNegocio);
            if (delNegocio) {
                sesion.claveDatosBase64 = delNegocio.claveDatos;
            } else {
                if (contrasenaNegocio.length < 10) throw new ErrorGuardado("Esa no es la contraseña actual del negocio. Si querés ponerle una nueva, tiene que tener al menos 10 caracteres.");
                const archivo = await Almacen.leer(RUTA_CLIENTES);
                const hayClientes = Boolean(archivo.contenido?.privado);
                const pregunta = "Esa no es la contraseña actual del negocio.\n\n¿Ponerla como contraseña NUEVA del negocio? El negocio va a tener que entrar con esta." +
                    (hayClientes ? "\n\nOjo: la lista de clientes fijos se borra y sus links dejan de funcionar (hay que volver a darlos de alta)." : "");
                if (!confirm(pregunta)) throw new ErrorGuardado("No se cambió nada.");
                sesion.claveDatosBase64 = claveDatosNueva();
                if (hayClientes) await Almacen.escribir(RUTA_CLIENTES, { clientes: [], privado: null }, archivo.sha, "Panel: reinicio de clientes fijos");
            }
            nuevas.negocio = await cifrarRanura(contrasenaNegocio, datosRanura());
        }
        nuevas.dueno = await cifrarRanura(contrasena, datosRanura());
        await guardarAcceso(nuevas, "Panel: acceso del dueno");
        await entrar("dueno", datosRanura());
    } catch (error) {
        console.error(error);
        mostrarErrorAcceso(error instanceof ErrorGuardado ? error.message : "No se pudo entrar. Probá de nuevo.");
    } finally {
        boton.disabled = false;
        boton.textContent = "Entrar como dueño";
    }
});

async function abrirPanel() {
    [archivoProductos, archivoClientes] = await Promise.all([Almacen.leer(RUTA_PRODUCTOS), Almacen.leer(RUTA_CLIENTES)]);
    productos = structuredClone(archivoProductos.contenido?.productos || []);
    originales = new Map(productos.map((p) => [p.id, JSON.stringify(p)]));

    const privado = archivoClientes.contenido?.privado;
    clientes = privado ? await Cifrado.descifrar(sesion.claveDatos, privado) : [];

    $("#pantalla-acceso").hidden = true;
    $("#pantalla-panel").hidden = false;
    prepararFiltros();
    dibujarProductos();
    dibujarClientes();
    prepararAjustes();
}

$("#boton-salir").addEventListener("click", () => {
    if (cantidadCambios() && !confirm("Tenés cambios sin publicar. ¿Salir igual y perderlos?")) return;
    originales = new Map(productos.map((p) => [p.id, JSON.stringify(p)]));
    location.reload();
});

// ---------- Pestañas ----------
document.querySelectorAll("[data-pestana]").forEach((boton) => boton.addEventListener("click", () => {
    document.querySelectorAll("[data-pestana]").forEach((b) => b.setAttribute("aria-selected", b === boton));
    document.querySelectorAll(".pestana").forEach((p) => { p.hidden = p.id !== "pestana-" + boton.dataset.pestana; });
}));

// ---------- Productos ----------
const NUEVA_CATEGORIA = "__nueva__";

function prepararFiltros() {
    // Las categorías nuevas no se guardan aparte: existen mientras algún producto las use.
    const categorias = Object.keys(CATEGORIAS);
    productos.forEach((p) => { if (!categorias.includes(p.categoria)) categorias.push(p.categoria); });
    const filtro = $("#filtro-categoria");
    const elegida = filtro.value;
    filtro.innerHTML = `<option value="">Todas las categorías</option>` +
        categorias.map((c) => `<option>${escapar(c)}</option>`).join("");
    filtro.value = categorias.includes(elegida) ? elegida : "";
    formProducto.elements.categoria.innerHTML =
        categorias.map((c) => `<option>${escapar(c)}</option>`).join("") +
        `<option value="${NUEVA_CATEGORIA}">+ Nueva categoría…</option>`;
    const marcas = [...new Set(productos.map((p) => p.marca).filter(Boolean))].sort();
    $("#lista-marcas").innerHTML = marcas.map((m) => `<option value="${escapar(m)}">`).join("");
}

function productosFiltrados() {
    const palabras = sinTildes($("#filtro-texto").value.trim()).split(/\s+/).filter(Boolean);
    const canal = $("#filtro-canal").value;
    const venta = $("#filtro-venta").value;
    const categoria = $("#filtro-categoria").value;
    return productos.filter((p) =>
        (!canal || p.canal === canal) &&
        (!venta || p.venta === venta) &&
        (!categoria || p.categoria === categoria) &&
        palabras.every((palabra) => sinTildes(`${p.producto} ${p.marca} ${p.presentacion} ${p.codigo_barras || ""}`).includes(palabra)));
}

function cambiado(p) {
    return originales.get(p.id) !== JSON.stringify(p);
}

function filaProducto(p) {
    const nuevo = !originales.has(p.id);
    return `
        <div class="fila-producto ${cambiado(p) ? "fila-producto--cambiada" : ""} ${p.stock ? "" : "fila-producto--agotada"}" data-id="${escapar(p.id)}">
            <div class="fila-producto__info">
                <button class="miniatura ${fotoOptimizada(p.imagen, 120) ? "" : "miniatura--vacia"}" type="button" data-accion="editar"
                        aria-label="${p.imagen ? "Cambiar foto" : "Agregar foto"} de ${escapar(p.producto)}"
                        style="--tinte:${(CATEGORIAS[p.categoria] || CATEGORIA_GENERICA).color}">
                    ${fotoOptimizada(p.imagen, 120) ? `<img src="${escapar(fotoOptimizada(p.imagen, 120))}" alt="" loading="lazy">` : iconoCategoria(p.categoria)}
                </button>
                <span class="fila-producto__textos">
                    <span class="fila-producto__nombre">${escapar(p.producto)}${nuevo ? ' <span class="insignia insignia--nuevo">Nuevo</span>' : ""}</span>
                    <span class="fila-producto__detalle">
                        <span class="insignia">${NOMBRE_CANAL[p.canal] || p.canal}</span>
                        <span class="insignia">${NOMBRE_VENTA[p.venta] || p.venta}</span>
                        ${escapar([p.marca, p.presentacion, p.codigo_barras && `Cód. ${p.codigo_barras}`].filter(Boolean).join(" · "))}
                    </span>
                </span>
            </div>
            <label class="fila-producto__precio">
                <span>Lista ${NOMBRE_UNIDAD[p.unidad] || ""}</span>
                <input type="number" min="0" step="1" inputmode="numeric" data-campo="precio_nuevo" value="${p.precio_nuevo ?? ""}" placeholder="Consultar">
            </label>
            <label class="fila-producto__precio">
                <span>Fijo ${NOMBRE_UNIDAD[p.unidad] || ""}</span>
                <input type="number" min="0" step="1" inputmode="numeric" data-campo="precio_fijo" value="${p.precio_fijo ?? ""}" placeholder="Igual">
            </label>
            <label class="interruptor" title="Hay stock">
                <input type="checkbox" data-campo="stock" ${p.stock ? "checked" : ""}>
                <span class="interruptor__texto">${p.stock ? "Hay" : "Sin stock"}</span>
            </label>
            <button class="boton-icono" type="button" data-accion="editar" aria-label="Editar ${escapar(p.producto)}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>
            </button>
        </div>`;
}

function dibujarProductos() {
    const lista = productosFiltrados();
    $("#cantidad-filtrados").textContent = lista.length;
    $("#productos-vacio").hidden = lista.length > 0;
    $("#lista-productos").innerHTML = lista.map(filaProducto).join("");
    actualizarBarraPublicar();
}

function cantidadCambios() {
    const ids = new Set(productos.map((p) => p.id));
    let cambios = productos.filter(cambiado).length;
    originales.forEach((_, id) => { if (!ids.has(id)) cambios++; }); // eliminados
    return cambios;
}

function actualizarBarraPublicar() {
    const cambios = cantidadCambios();
    $("#barra-publicar").hidden = cambios === 0;
    $("#cantidad-cambios").textContent = cambios;
    document.body.classList.toggle("con-cambios", cambios > 0);
}

function refrescarFila(id) {
    const p = productos.find((x) => x.id === id);
    const el = $(`#lista-productos [data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.classList.toggle("fila-producto--cambiada", cambiado(p));
    el.classList.toggle("fila-producto--agotada", !p.stock);
    el.querySelector(".interruptor__texto").textContent = p.stock ? "Hay" : "Sin stock";
    actualizarBarraPublicar();
}

const numeroOVacio = (valor) => (valor === "" || valor === null || Number(valor) <= 0 ? null : Math.round(Number(valor)));

$("#lista-productos").addEventListener("input", (e) => {
    const campo = e.target.dataset.campo;
    if (!campo) return;
    const id = e.target.closest("[data-id]").dataset.id;
    const p = productos.find((x) => x.id === id);
    p[campo] = campo === "stock" ? e.target.checked : numeroOVacio(e.target.value);
    refrescarFila(id);
});

$("#lista-productos").addEventListener("click", (e) => {
    if (!e.target.closest('[data-accion="editar"]')) return;
    abrirDialogo(productos.find((p) => p.id === e.target.closest("[data-id]").dataset.id));
});

let esperaFiltro;
["#filtro-texto", "#filtro-canal", "#filtro-venta", "#filtro-categoria"].forEach((selector) =>
    $(selector).addEventListener("input", () => {
        clearTimeout(esperaFiltro);
        esperaFiltro = setTimeout(dibujarProductos, 150);
    }));

// Cambios de precio en bloque sobre lo filtrado.
$("#boton-aumento").addEventListener("click", () => {
    const porcentaje = Number($("#porcentaje-aumento").value);
    const lista = productosFiltrados();
    if (!porcentaje || !lista.length) return avisar("Escribí un porcentaje (por ejemplo 8, o -5 para bajar).", "error");
    if (!confirm(`¿${porcentaje > 0 ? "Aumentar" : "Bajar"} ${Math.abs(porcentaje)}% el precio de lista y el fijo de ${lista.length} productos?`)) return;
    const factor = 1 + porcentaje / 100;
    lista.forEach((p) => {
        if (p.precio_nuevo) p.precio_nuevo = Math.round(p.precio_nuevo * factor);
        if (p.precio_fijo) p.precio_fijo = Math.round(p.precio_fijo * factor);
    });
    $("#porcentaje-aumento").value = "";
    dibujarProductos();
    avisar(`Listo: ${lista.length} productos cambiados. Revisá y tocá "Publicar cambios".`);
});

$("#boton-fijo").addEventListener("click", () => {
    const porcentaje = Number($("#porcentaje-fijo").value);
    const lista = productosFiltrados().filter((p) => p.precio_nuevo);
    if (!(porcentaje > 0 && porcentaje < 90) || !lista.length) return avisar("Escribí un porcentaje entre 1 y 89.", "error");
    if (!confirm(`¿Poner el precio fijo ${porcentaje}% por debajo del de lista en ${lista.length} productos?`)) return;
    lista.forEach((p) => { p.precio_fijo = Math.round(p.precio_nuevo * (1 - porcentaje / 100)); });
    $("#porcentaje-fijo").value = "";
    dibujarProductos();
    avisar(`Listo: ${lista.length} productos cambiados. Revisá y tocá "Publicar cambios".`);
});

// ---------- Diálogo de producto ----------
const dialogo = $("#dialogo-producto");
const formProducto = $("#form-producto");

function abrirDialogo(producto) {
    editando = producto || null;
    $("#dialogo-titulo").textContent = producto ? "Editar producto" : "Nuevo producto";
    $("#boton-eliminar-producto").hidden = !producto;
    const p = producto || {
        canal: $("#filtro-canal").value || "minorista",
        venta: $("#filtro-venta").value || "empaquetado",
        categoria: $("#filtro-categoria").value || Object.keys(CATEGORIAS)[0],
        unidad: "unidad", stock: true,
    };
    for (const campo of formProducto.elements) {
        if (!campo.name) continue;
        if (campo.type === "checkbox") campo.checked = Boolean(p[campo.name]);
        else campo.value = p[campo.name] ?? "";
    }
    categoriaAnterior = formProducto.elements.categoria.value;
    actualizarCampoKilos();
    $("#foto-archivo").value = "";
    dibujarFoto();
    dialogo.showModal();
}

// ---------- Fotos (Cloudinary) ----------
// Se suben directo desde el navegador con un perfil "sin firmar": no hace falta ninguna
// clave secreta. La dirección de la foto queda en el campo oculto "imagen" del producto.
// Las fotos grandes (de celular o de cámara) se achican en el navegador antes de subirlas:
// así cualquier foto entra en el límite de Cloudinary, sube rápido y no ocupa espacio de más.
const MAXIMO_ORIGINAL = 50 * 1024 * 1024;
const LADO_MAXIMO = 2000;            // px del lado más largo: sobra para el catálogo
const SUBIR_SIN_TOCAR = 2 * 1024 * 1024;
const AYUDA_FOTO = "Cualquier foto JPG, PNG o WEBP (también de celular, aunque pese mucho): el panel la achica sola. Mejor con fondo claro y el producto centrado.";
let subiendoFoto = false;

function dibujarFoto(estado) {
    const url = fotoOptimizada(formProducto.elements.imagen.value, 360);
    const categoria = formProducto.elements.categoria.value;
    const vista = $("#foto-vista");
    vista.style.setProperty("--tinte", (CATEGORIAS[categoria] || CATEGORIA_GENERICA).color);
    vista.classList.toggle("foto__vista--vacia", !url);
    vista.innerHTML = url ? `<img src="${escapar(url)}" alt="">` : iconoCategoria(categoria);
    $("#foto-texto-boton").textContent = subiendoFoto ? "Subiendo…" : url ? "Cambiar foto" : "Subir foto";
    $("#foto-quitar").hidden = !formProducto.elements.imagen.value || subiendoFoto;
    $("#foto-estado").textContent = estado || AYUDA_FOTO;
    $("#foto-estado").classList.toggle("ayuda--error", Boolean(estado) && !subiendoFoto && estado.startsWith("No"));
}

const megas = (bytes) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

function lienzoABlob(lienzo, tipo, calidad) {
    return new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad));
}

// Devuelve la foto lista para subir: la original si ya es liviana, o una copia achicada.
async function prepararFoto(archivo) {
    if (archivo.size > MAXIMO_ORIGINAL) throw new ErrorGuardado(`No se pudo: la foto pesa ${megas(archivo.size)} (máximo 50 MB).`);
    if (archivo.type && !archivo.type.startsWith("image/")) throw new ErrorGuardado("No se pudo: el archivo no es una foto.");

    let imagen;
    try {
        imagen = await createImageBitmap(archivo); // respeta si la foto se sacó con el celular girado
    } catch {
        throw new ErrorGuardado("No se pudo leer la foto. Si es de iPhone (HEIC), pasala a JPG o subila desde el celular.");
    }
    const { width: ancho, height: alto } = imagen;
    const yaSirve = /^image\/(jpeg|webp)$/.test(archivo.type) && archivo.size <= SUBIR_SIN_TOCAR && Math.max(ancho, alto) <= LADO_MAXIMO;
    if (yaSirve) {
        imagen.close();
        return archivo;
    }

    const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(ancho * escala);
    lienzo.height = Math.round(alto * escala);
    const ctx = lienzo.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    imagen.close();

    // WEBP mantiene la transparencia de los PNG y pesa menos; si el navegador no lo sabe
    // generar, va JPG con fondo blanco.
    let blob = await lienzoABlob(lienzo, "image/webp", 0.88);
    if (!blob || blob.type !== "image/webp") {
        const blanco = document.createElement("canvas");
        blanco.width = lienzo.width;
        blanco.height = lienzo.height;
        const c = blanco.getContext("2d");
        c.fillStyle = "#fff";
        c.fillRect(0, 0, blanco.width, blanco.height);
        c.drawImage(lienzo, 0, 0);
        blob = await lienzoABlob(blanco, "image/jpeg", 0.88);
    }
    if (!blob) throw new ErrorGuardado("No se pudo preparar la foto. Probá con otra.");
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], (archivo.name || "foto").replace(/\.[^.]+$/, "") + "." + extension, { type: blob.type });
}

async function subirFoto(archivo) {
    const { nube, perfil } = CONFIG.cloudinary || {};
    if (!nube || !perfil) throw new ErrorGuardado("No se configuró Cloudinary en config.js.");

    const datos = new FormData();
    datos.append("file", archivo);
    datos.append("upload_preset", perfil);
    let respuesta;
    try {
        respuesta = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(nube)}/image/upload`, { method: "POST", body: datos });
    } catch {
        throw new ErrorGuardado("No se pudo subir: revisá la conexión a internet.");
    }
    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
        console.error("Cloudinary:", resultado);
        throw new ErrorGuardado(`No se pudo subir la foto (${resultado.error?.message || respuesta.status}).`);
    }
    return resultado.secure_url;
}

$("#foto-archivo").addEventListener("change", async (e) => {
    const archivo = e.target.files[0];
    if (!archivo || subiendoFoto) return;
    subiendoFoto = true;
    dibujarFoto(archivo.size > SUBIR_SIN_TOCAR ? `Achicando la foto (${megas(archivo.size)})…` : "Preparando la foto…");
    try {
        const lista = await prepararFoto(archivo);
        dibujarFoto(lista === archivo ? "Subiendo la foto…" : `Subiendo la foto (achicada a ${megas(lista.size)})…`);
        formProducto.elements.imagen.value = await subirFoto(lista);
        subiendoFoto = false;
        dibujarFoto('Foto subida. Tocá "Listo" y después "Publicar cambios".');
    } catch (error) {
        subiendoFoto = false;
        dibujarFoto(error instanceof ErrorGuardado ? error.message : "No se pudo subir la foto. Probá de nuevo.");
    } finally {
        e.target.value = "";
    }
});

$("#foto-quitar").addEventListener("click", () => {
    formProducto.elements.imagen.value = "";
    dibujarFoto("Foto quitada. Tocá \"Listo\" para guardar.");
});

// Categoría nueva: se agrega a la lista y queda elegida. Lleva el ícono genérico.
let categoriaAnterior = "";
formProducto.elements.categoria.addEventListener("focus", (e) => { categoriaAnterior = e.target.value; });
formProducto.elements.categoria.addEventListener("change", (e) => {
    const select = e.target;
    if (select.value === NUEVA_CATEGORIA) {
        const escrita = (prompt("Nombre de la categoría nueva (ej.: Embutidos):") || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const nombre = escrita.charAt(0).toUpperCase() + escrita.slice(1);
        const existente = [...select.options].find((o) => o.value !== NUEVA_CATEGORIA && sinTildes(o.value) === sinTildes(nombre));
        if (!nombre) {
            select.value = categoriaAnterior;
        } else if (existente) {
            select.value = existente.value;
        } else {
            select.lastElementChild.before(new Option(nombre, nombre));
            select.value = nombre;
            avisar(`Categoría "${nombre}" creada. Aparece en el catálogo cuando publiques el producto.`);
        }
    }
    categoriaAnterior = select.value;
    dibujarFoto();
});

function actualizarCampoKilos() {
    $("#campo-kilos").hidden = formProducto.elements.unidad.value !== "kg";
}
formProducto.elements.unidad.addEventListener("change", actualizarCampoKilos);

// La pistola lectora escribe el código y aprieta Enter: que no cierre la ventana.
formProducto.elements.codigo_barras.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
});
$("#boton-nuevo-producto").addEventListener("click", () => abrirDialogo(null));

function idNuevo(p) {
    const base = sinTildes(`${p.canal.slice(0, 3)}-${p.venta.slice(0, 3)}-${p.producto}`).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let id = base;
    for (let n = 2; productos.some((x) => x.id === id) || originales.has(id); n++) id = `${base}-${n}`;
    return id;
}

formProducto.addEventListener("submit", (e) => {
    e.preventDefault();
    if (subiendoFoto) return avisar("Esperá a que termine de subir la foto.", "error");
    const f = formProducto.elements;
    const datos = {
        canal: f.canal.value,
        venta: f.venta.value,
        categoria: f.categoria.value,
        marca: f.marca.value.trim(),
        producto: f.producto.value.trim(),
        presentacion: f.presentacion.value.split(/\s*[·,]\s*/).filter(Boolean).join(" · "),
        unidad: f.unidad.value,
        kilos_caja: f.unidad.value === "kg" && Number(f.kilos_caja.value) > 0 ? Number(f.kilos_caja.value) : null,
        precio_nuevo: numeroOVacio(f.precio_nuevo.value),
        precio_fijo: numeroOVacio(f.precio_fijo.value),
        stock: f.stock.checked,
        imagen: f.imagen.value.trim(),
    };
    // Solo se guarda si tiene código, así los productos sin código no figuran como cambiados.
    const codigo = f.codigo_barras.value.replace(/\s+/g, "");
    if (codigo) datos.codigo_barras = codigo;
    if (editando) {
        delete editando.codigo_barras;
        Object.assign(editando, datos);
    } else {
        const nuevo = { id: "", ...datos };
        nuevo.id = idNuevo(nuevo);
        productos.unshift(nuevo);
    }
    dialogo.close();
    prepararFiltros();
    dibujarProductos();
});

$("#boton-cancelar-producto").addEventListener("click", () => dialogo.close());
$("#boton-eliminar-producto").addEventListener("click", () => {
    if (!editando || !confirm(`¿Eliminar "${editando.producto}" del catálogo?`)) return;
    productos = productos.filter((p) => p !== editando);
    dialogo.close();
    dibujarProductos();
    avisar('Producto eliminado. Se va del catálogo cuando toques "Publicar cambios".');
});

// ---------- Publicar productos ----------
function mesActual() {
    const texto = new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" }).replace(" de ", " ");
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

$("#boton-publicar").addEventListener("click", (e) => ocupado(e.currentTarget, async () => {
    const cambios = cantidadCambios();
    const contenido = { ...(archivoProductos.contenido || {}), actualizado: mesActual(), productos };
    const sha = await Almacen.escribir(RUTA_PRODUCTOS, contenido, archivoProductos.sha, `Panel: ${cambios} cambios en productos`);
    archivoProductos = { contenido: structuredClone(contenido), sha };
    originales = new Map(productos.map((p) => [p.id, JSON.stringify(p)]));
    dibujarProductos();
    avisar(MODO_PRUEBA ? "Publicado (modo prueba)." : "¡Publicado! El catálogo se actualiza en 1 o 2 minutos.");
}));

$("#boton-descartar").addEventListener("click", () => {
    if (!confirm("¿Descartar todos los cambios sin publicar?")) return;
    productos = structuredClone(archivoProductos.contenido?.productos || []);
    dibujarProductos();
});

window.addEventListener("beforeunload", (e) => {
    if (productos.length && cantidadCambios()) e.preventDefault();
});

// ---------- Clientes fijos ----------
function linkCliente(c) {
    // El catálogo está en la misma carpeta que el panel, sea cual sea el dominio.
    return `${new URL("./", location.href).href}?cliente=${c.codigo}`;
}

function soloNumeros(telefono) {
    const numeros = String(telefono || "").replace(/\D/g, "");
    if (!numeros) return "";
    return numeros.startsWith("54") ? numeros : "549" + numeros.replace(/^0/, "");
}

function dibujarClientes() {
    const el = $("#lista-clientes");
    if (!clientes.length) {
        el.innerHTML = `<p class="estado">Todavía no hay clientes fijos.</p>`;
        return;
    }
    el.innerHTML = `<h2>${clientes.length} ${clientes.length === 1 ? "cliente fijo" : "clientes fijos"}</h2>` +
        [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => `
        <div class="fila-cliente" data-id="${escapar(c.id)}">
            <div class="fila-cliente__info">
                <span class="fila-producto__nombre">${escapar(c.nombre)}</span>
                <span class="fila-producto__detalle">${c.whatsapp ? escapar(c.whatsapp) + " · " : ""}desde ${new Date(c.alta).toLocaleDateString("es-AR")}</span>
            </div>
            <div class="fila-cliente__acciones">
                <button class="boton boton--borde" type="button" data-accion="copiar">Copiar link</button>
                <button class="boton boton--verde" type="button" data-accion="whatsapp">Enviar por WhatsApp</button>
                <button class="boton boton--peligro-suave" type="button" data-accion="baja">Dar de baja</button>
            </div>
        </div>`).join("");
}

async function publicarClientes(mensaje) {
    const publicos = await Promise.all(clientes.map(async (c) => ({
        h: await Cifrado.huella(c.codigo),
        n: await Cifrado.cifrar(await Cifrado.claveDeCodigo(c.codigo), c.nombre),
    })));
    const contenido = { clientes: publicos, privado: await Cifrado.cifrar(sesion.claveDatos, clientes) };
    const sha = await Almacen.escribir(RUTA_CLIENTES, contenido, archivoClientes.sha, mensaje);
    archivoClientes = { contenido, sha };
}

function mensajeWhatsApp(c) {
    return `¡Hola ${c.nombre}! Te paso tu link personal del catálogo de EnFrío Distribuidora, con tus precios de cliente fijo:\n${linkCliente(c)}\n\nGuardalo para hacer tus pedidos.`;
}

$("#form-cliente").addEventListener("submit", (e) => {
    e.preventDefault();
    ocupado(e.submitter, async () => {
        const cliente = {
            id: Cifrado.alAzar(8),
            nombre: $("#cliente-nombre").value.trim(),
            whatsapp: $("#cliente-whatsapp").value.trim(),
            codigo: Cifrado.alAzar(12),
            alta: new Date().toISOString(),
        };
        clientes.push(cliente);
        try {
            await publicarClientes("Panel: alta de cliente fijo");
        } catch (error) {
            clientes = clientes.filter((c) => c !== cliente);
            throw error;
        }
        e.target.reset();
        dibujarClientes();
        avisar(`Listo. Mandale el link a ${cliente.nombre}${MODO_PRUEBA ? "" : " (se activa en 1 o 2 minutos)"}.`);
    });
});

$("#lista-clientes").addEventListener("click", async (e) => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    const cliente = clientes.find((c) => c.id === boton.closest("[data-id]").dataset.id);
    const accion = boton.dataset.accion;

    if (accion === "copiar") {
        try {
            await navigator.clipboard.writeText(linkCliente(cliente));
            avisar("Link copiado.");
        } catch {
            prompt("Copiá el link:", linkCliente(cliente));
        }
    } else if (accion === "whatsapp") {
        const numero = soloNumeros(cliente.whatsapp);
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensajeWhatsApp(cliente))}`, "_blank", "noopener");
    } else if (accion === "baja") {
        if (!confirm(`¿Dar de baja a ${cliente.nombre}? Su link deja de funcionar y vuelve a ver precios de lista.`)) return;
        await ocupado(boton, async () => {
            const anteriores = clientes;
            clientes = clientes.filter((c) => c !== cliente);
            try {
                await publicarClientes("Panel: baja de cliente fijo");
            } catch (error) {
                clientes = anteriores;
                throw error;
            }
            dibujarClientes();
            avisar(`${cliente.nombre} quedó dado de baja.`);
        });
    }
});

// ---------- Ajustes ----------
function prepararAjustes() {
    const dueno = sesion.rol === "dueno";
    $("#rol-panel").textContent = dueno ? "Panel · Dueño" : "Panel";
    $("#titulo-mi-contrasena").textContent = dueno ? "Cambiar tu contraseña de dueño" : "Cambiar contraseña del panel";
    $("#ayuda-mi-contrasena").textContent = dueno
        ? "Es la contraseña con la que entrás vos. La del negocio no cambia."
        : "El dueño del sistema (Lambda) tiene su propio acceso: cambiar esta contraseña no lo afecta.";
    $("#tarjeta-negocio").hidden = !dueno;
}

$("#form-contrasena").addEventListener("submit", (e) => {
    e.preventDefault();
    const contrasena = $("#nueva-contrasena").value;
    if (contrasena !== $("#nueva-repetir").value) return avisar("Las contraseñas no coinciden.", "error");
    ocupado(e.submitter, async () => {
        const otra = ranuras()[sesion.rol === "dueno" ? "negocio" : "dueno"];
        if (await abrirRanura(otra, contrasena)) throw new ErrorGuardado("Esa contraseña ya la usa el otro acceso. Elegí otra.");
        await guardarAcceso({ [sesion.rol]: await cifrarRanura(contrasena, datosRanura()) }, "Panel: cambio de contrasena");
        e.target.reset();
        avisar("Contraseña cambiada. La próxima vez entrá con la nueva.");
    });
});

// Solo el dueño: ponerle una contraseña nueva al negocio (por ejemplo si se la olvidó).
$("#form-contrasena-negocio").addEventListener("submit", (e) => {
    e.preventDefault();
    const contrasena = $("#negocio-nueva").value;
    if (contrasena !== $("#negocio-repetir").value) return avisar("Las contraseñas no coinciden.", "error");
    ocupado(e.submitter, async () => {
        if (await abrirRanura(ranuras().dueno, contrasena)) throw new ErrorGuardado("Tiene que ser distinta de tu contraseña de dueño.");
        await guardarAcceso({ negocio: await cifrarRanura(contrasena, datosRanura()) }, "Panel: nueva contrasena del negocio");
        e.target.reset();
        avisar("Listo. Pasale la contraseña nueva al negocio.");
    });
});

iniciarAcceso();
