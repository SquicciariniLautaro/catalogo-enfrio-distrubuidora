// Catálogo público. Las categorías, el formato de precios y el cifrado están en comun.js.
const CONFIG = window.CONFIG || {};

// ---------- Estado ----------
let productos = [];
let actualizado = "";
const estado = {
    canal: leerGuardado("canal", "minorista"),
    venta: "empaquetado",
    cliente: "nuevo",       // pasa a "fijo" solo si entra con un link personal válido
    nombreCliente: "",
    linkVencido: false,
    categoria: null,
    busqueda: "",
};
let pedido = leerGuardado("pedido", {}); // { idProducto: cantidad }

// ---------- Elementos ----------
const $ = (selector) => document.querySelector(selector);
const elSecciones = $("#secciones");
const elCategorias = $("#categorias");
const elCarga = $("#pantalla-carga");
const elSinResultados = $("#sin-resultados");
const elAviso = $("#aviso-precios");
const elPanel = $("#panel-pedido");
const elFondo = $("#fondo-panel");

// ---------- Utilidades ----------
function leerGuardado(clave, porDefecto) {
    try {
        const valor = localStorage.getItem("enfrio-" + clave);
        return valor === null ? porDefecto : JSON.parse(valor);
    } catch {
        return porDefecto;
    }
}

function guardar(clave, valor) {
    try {
        if (valor === null) localStorage.removeItem("enfrio-" + clave);
        else localStorage.setItem("enfrio-" + clave, JSON.stringify(valor));
    } catch {
        // sin almacenamiento disponible: se sigue sin recordar
    }
}

// ---------- Datos ----------
function prepararProductos(lista) {
    return lista
        .filter((p) => p.producto && p.canal && p.venta)
        .map((p) => {
            const nuevo = Number(p.precio_nuevo) || null;
            return {
                id: p.id,
                canal: p.canal,
                venta: p.venta,
                categoria: p.categoria || "Otros",
                marca: p.marca || "",
                nombre: p.producto,
                presentacion: String(p.presentacion || "").split("·").map((t) => t.trim()).filter(Boolean),
                unidad: p.unidad || "unidad",
                kilosCaja: Number(p.kilos_caja) || null,
                precio: { nuevo, fijo: Number(p.precio_fijo) || nuevo },
                hayStock: p.stock !== false,
                imagen: p.imagen || "",
                sinTacc: /sin tacc|sin gluten/i.test(p.producto) || p.categoria === "Sin gluten",
                texto: sinTildes(`${p.producto} ${p.marca} ${p.categoria} ${p.presentacion}`),
            };
        });
}

// El link personal de un cliente fijo trae ?cliente=código. Se recuerda en el celular
// y se compara contra las huellas de datos/clientes.json.
async function identificarCliente() {
    const parametros = new URLSearchParams(location.search);
    let codigo = parametros.get("cliente");
    if (codigo) {
        guardar("codigo", codigo);
        parametros.delete("cliente");
        const resto = parametros.toString();
        history.replaceState(null, "", location.pathname + (resto ? "?" + resto : "") + location.hash);
    } else {
        codigo = leerGuardado("codigo", null);
    }
    if (!codigo) return;

    try {
        const respuesta = await fetch("datos/clientes.json", { cache: "no-cache" });
        const { clientes = [] } = await respuesta.json();
        const huella = await Cifrado.huella(codigo);
        const entrada = clientes.find((c) => c.h === huella);
        if (!entrada) {
            guardar("codigo", null);
            estado.linkVencido = true;
            return;
        }
        estado.cliente = "fijo";
        estado.nombreCliente = await Cifrado.descifrar(await Cifrado.claveDeCodigo(codigo), entrada.n);
    } catch (error) {
        console.error("No se pudo verificar el cliente:", error);
    }
}

// ---------- Precios ----------
function precioDe(producto, cliente = estado.cliente) {
    return producto.precio[cliente];
}

// Lo que cuesta una "unidad de pedido" (una unidad, una caja, o un kilo si va al peso).
function precioPorPedido(producto) {
    const precio = precioDe(producto);
    if (!precio) return null;
    return producto.unidad === "kg" && producto.kilosCaja ? precio * producto.kilosCaja : precio;
}

function textoCantidad(producto, cantidad) {
    if (producto.unidad === "kg" && !producto.kilosCaja) return `${cantidad} kg`;
    if (producto.unidad === "kg" || producto.unidad === "caja") return `${cantidad} ${cantidad === 1 ? "caja" : "cajas"}`;
    return `${cantidad} u.`;
}

function textoUnidadPedido(producto) {
    if (producto.unidad === "unidad") return "c/u";
    return producto.unidad === "kg" && !producto.kilosCaja ? "por kg" : "por caja";
}

// ---------- Dibujar el catálogo ----------
function productosVisibles() {
    return productos.filter((p) => p.canal === estado.canal && p.venta === estado.venta);
}

function dibujarTodo() {
    actualizarSelectores();
    dibujarCategorias();
    dibujarProductos();
    dibujarAviso();
}

function actualizarSelectores() {
    document.querySelectorAll(".canal").forEach((b) => b.setAttribute("aria-selected", b.dataset.canal === estado.canal));

    const ventasDisponibles = new Set(productos.filter((p) => p.canal === estado.canal).map((p) => p.venta));
    if (!ventasDisponibles.has(estado.venta)) estado.venta = [...ventasDisponibles][0] || "empaquetado";
    document.querySelectorAll("#selector-venta button").forEach((b) => {
        b.setAttribute("aria-checked", b.dataset.venta === estado.venta);
        b.disabled = !ventasDisponibles.has(b.dataset.venta);
        b.title = b.disabled ? `No hay productos ${NOMBRE_VENTA[b.dataset.venta].toLowerCase()} en ${NOMBRE_CANAL[estado.canal].toLowerCase()}` : "";
    });
}

function categoriasDe(lista) {
    const orden = Object.keys(CATEGORIAS);
    const cuenta = new Map();
    lista.forEach((p) => cuenta.set(p.categoria, (cuenta.get(p.categoria) || 0) + 1));
    return [...cuenta.entries()].sort((a, b) => {
        const ia = orden.indexOf(a[0]), ib = orden.indexOf(b[0]);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}

function dibujarCategorias() {
    const lista = productosVisibles();
    const categorias = categoriasDe(lista);
    if (estado.categoria && !categorias.some(([c]) => c === estado.categoria)) estado.categoria = null;

    elCategorias.innerHTML = [
        `<button class="chip" type="button" data-categoria="" aria-pressed="${!estado.categoria}">Todo <span>${lista.length}</span></button>`,
        ...categorias.map(([nombre, cantidad]) =>
            `<button class="chip" type="button" data-categoria="${escapar(nombre)}" aria-pressed="${estado.categoria === nombre}">${escapar(nombre)} <span>${cantidad}</span></button>`),
    ].join("");
}

function dibujarProductos() {
    const palabras = sinTildes(estado.busqueda.trim()).split(/\s+/).filter(Boolean);
    const lista = productosVisibles().filter((p) =>
        (!estado.categoria || p.categoria === estado.categoria) &&
        palabras.every((palabra) => p.texto.includes(palabra)));

    elSinResultados.hidden = lista.length > 0;
    elSecciones.innerHTML = categoriasDe(lista).map(([categoria]) => {
        const datos = CATEGORIAS[categoria] || CATEGORIA_GENERICA;
        const deCategoria = lista
            .filter((p) => p.categoria === categoria)
            .sort((a, b) => Number(b.hayStock) - Number(a.hayStock));
        return `
            <section class="seccion">
                <h2 class="seccion__titulo">
                    <span class="seccion__icono" style="background:${datos.color}">${iconoCategoria(categoria)}</span>
                    ${escapar(categoria)} <small>${deCategoria.length} productos</small>
                </h2>
                <div class="grilla">${deCategoria.map(tarjeta).join("")}</div>
            </section>`;
    }).join("");
}

function tarjeta(p) {
    const datos = CATEGORIAS[p.categoria] || CATEGORIA_GENERICA;
    const enPedido = pedido[p.id] || 0;
    const visual = p.imagen
        ? `<img src="${escapar(p.imagen)}" alt="" loading="lazy">`
        : iconoCategoria(p.categoria);

    return `
        <article class="tarjeta ${p.hayStock ? "" : "tarjeta--agotado"} ${enPedido ? "tarjeta--elegido" : ""}" data-id="${escapar(p.id)}"
                 style="--tinte:${datos.color};--tinte-suave:color-mix(in srgb, ${datos.color} 13%, var(--superficie))">
            <div class="tarjeta__visual">
                ${visual}
                ${p.marca ? `<span class="tarjeta__marca">${escapar(p.marca)}</span>` : ""}
                ${!p.hayStock ? `<span class="etiqueta etiqueta--agotado">Sin stock</span>` : p.sinTacc ? `<span class="etiqueta etiqueta--tacc">Sin TACC</span>` : ""}
            </div>
            <div class="tarjeta__cuerpo">
                <h3 class="tarjeta__nombre">${escapar(p.nombre)}</h3>
                ${p.presentacion.length ? `<div class="presentacion">${p.presentacion.map((t) => `<span>${escapar(t)}</span>`).join("")}</div>` : ""}
                <div class="precios">${bloquePrecio(p)}</div>
            </div>
            <div class="tarjeta__pie">${botonPedido(p)}</div>
        </article>`;
}

function bloquePrecio(p) {
    if (!p.hayStock) return `<span class="precio__consultar">Consultar ingreso</span>`;
    const precio = precioDe(p);
    if (!precio) return `<span class="precio__consultar">Consultar precio</span>`;

    const caja = p.unidad === "kg" && p.kilosCaja
        ? `<p class="precio__caja">Caja de ${String(p.kilosCaja).replace(".", ",")} kg: <b>${pesos(precio * p.kilosCaja)}</b></p>`
        : "";
    const lista = estado.cliente === "fijo" && p.precio.nuevo && p.precio.nuevo > precio
        ? `<p class="precio__otro">Precio de lista: <s>${pesos(p.precio.nuevo)}</s></p>`
        : "";
    return `
        <div class="precio"><span class="precio__valor">${pesos(precio)}</span><span class="precio__unidad">${NOMBRE_UNIDAD[p.unidad] || ""}</span></div>
        ${caja}${lista}`;
}

function botonPedido(p) {
    if (!p.hayStock) return `<button class="boton-agregar" type="button" disabled>Sin stock</button>`;
    const cantidad = pedido[p.id] || 0;
    if (!cantidad) {
        const texto = precioDe(p) ? "Agregar" : "Consultar";
        return `<button class="boton-agregar" type="button" data-accion="sumar">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>${texto}
                </button>`;
    }
    return `
        <div class="cantidad">
            <button type="button" data-accion="restar" aria-label="Quitar uno">−</button>
            <output>${textoCantidad(p, cantidad)}</output>
            <button type="button" data-accion="sumar" aria-label="Agregar uno">+</button>
        </div>`;
}

function dibujarAviso() {
    const info = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
    const tilde = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
    elAviso.classList.toggle("aviso-precios--fijo", estado.cliente === "fijo");
    if (estado.cliente === "fijo") {
        elAviso.innerHTML = `${tilde}<span>Hola${estado.nombreCliente ? ", <b>" + escapar(estado.nombreCliente) + "</b>" : ""}. Estás viendo tus <b>precios de cliente fijo</b>.
            <button type="button" class="aviso-precios__salir" id="boton-salir-cliente">¿No sos vos? Salir</button></span>`;
    } else if (estado.linkVencido) {
        elAviso.innerHTML = `${info}<span>Tu link de cliente fijo ya no está activo, así que ves los precios de lista. Escribinos por WhatsApp y te pasamos uno nuevo.</span>`;
    } else {
        elAviso.innerHTML = `${info}<span>Estás viendo los <b>precios de lista</b>. Si ya sos cliente fijo, pedinos por WhatsApp tu link personal para ver tus precios.</span>`;
    }
}

// ---------- Pedido ----------
function cambiarCantidad(id, diferencia) {
    const nueva = Math.max(0, (pedido[id] || 0) + diferencia);
    if (nueva) pedido[id] = nueva;
    else delete pedido[id];
    guardar("pedido", pedido);

    const elTarjeta = elSecciones.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (elTarjeta) {
        const producto = productos.find((p) => p.id === id);
        elTarjeta.querySelector(".tarjeta__pie").innerHTML = botonPedido(producto);
        elTarjeta.classList.toggle("tarjeta--elegido", nueva > 0);
    }
    dibujarPedido();
}

function lineasPedido() {
    return Object.entries(pedido)
        .map(([id, cantidad]) => ({ producto: productos.find((p) => p.id === id), cantidad }))
        .filter((l) => l.producto);
}

function totalPedido(lineas) {
    return lineas.reduce((suma, l) => suma + (precioPorPedido(l.producto) || 0) * l.cantidad, 0);
}

function dibujarPedido() {
    const lineas = lineasPedido();
    const cantidad = lineas.length;
    const total = totalPedido(lineas);

    $("#contador-pedido").hidden = cantidad === 0;
    $("#contador-pedido").textContent = cantidad;
    $("#barra-pedido").hidden = cantidad === 0;
    $("#barra-cantidad").textContent = cantidad;
    $("#barra-total").textContent = pesos(total);
    $("#total-pedido").textContent = pesos(total);
    $("#total-datos").textContent = pesos(total);
    $("#resumen-datos").textContent = `${cantidad} ${cantidad === 1 ? "producto" : "productos"} · total estimado`;
    $("#boton-continuar").disabled = cantidad === 0;
    $("#boton-enviar").disabled = cantidad === 0;
    $("#boton-vaciar").hidden = cantidad === 0;
    if (!cantidad) mostrarPaso(1);
    $("#panel-tipo").textContent = estado.cliente === "fijo" ? "Con tus precios de cliente fijo" : "Con precios de lista";

    const lista = $("#lista-pedido");
    if (!cantidad) {
        lista.innerHTML = `<p class="panel__vacio">Todavía no agregaste productos.</p>`;
        return;
    }
    lista.innerHTML = lineas.map(({ producto: p, cantidad: n }) => {
        const porPedido = precioPorPedido(p);
        return `
            <div class="renglon" data-id="${escapar(p.id)}">
                <div class="renglon__nombre">${escapar(p.nombre)}</div>
                <div class="renglon__subtotal">${porPedido ? pesos(porPedido * n) : "A consultar"}</div>
                <div class="renglon__detalle"><span class="renglon__canal">${NOMBRE_CANAL[p.canal]}</span>${escapar([p.marca, ...p.presentacion].filter(Boolean).join(" · "))}</div>
                <div class="renglon__detalle">${porPedido ? `${pesos(porPedido)} ${textoUnidadPedido(p)}` : ""}</div>
                <div class="cantidad">
                    <button type="button" data-accion="restar" aria-label="Quitar uno">−</button>
                    <output>${textoCantidad(p, n)}</output>
                    <button type="button" data-accion="sumar" aria-label="Agregar uno">+</button>
                </div>
            </div>`;
    }).join("");
}

function mostrarPaso(numero) {
    $("#paso-productos").hidden = numero !== 1;
    $("#form-datos").hidden = numero !== 2;
    $("#paso-1").classList.toggle("activo", numero >= 1);
    $("#paso-2").classList.toggle("activo", numero === 2);
    $("#titulo-pedido").textContent = numero === 1 ? "Mi pedido" : "Tus datos";
    elPanel.querySelectorAll(".panel__lista").forEach((el) => { el.scrollTop = 0; });
}

function abrirPedido() {
    mostrarPaso(1);
    dibujarPedido();
    elPanel.classList.add("abierto");
    elPanel.setAttribute("aria-hidden", "false");
    elFondo.hidden = false;
    document.body.style.overflow = "hidden";
}

function cerrarPedido() {
    elPanel.classList.remove("abierto");
    elPanel.setAttribute("aria-hidden", "true");
    elFondo.hidden = true;
    document.body.style.overflow = "";
}

// ---------- Datos del cliente ----------
const formDatos = $("#form-datos");
const CAMPOS_DATOS = ["nombre", "telefono", "comercio", "entrega", "direccion", "localidad", "referencias", "horario", "pago", "factura", "cuit", "notas"];

function leerDatos() {
    const f = formDatos.elements;
    return Object.fromEntries(CAMPOS_DATOS.map((c) => [c, (f[c].value || "").trim()]));
}

function cargarDatos() {
    const guardados = leerGuardado("datos", {});
    if (!guardados.nombre && estado.nombreCliente) guardados.nombre = estado.nombreCliente;
    const f = formDatos.elements;
    CAMPOS_DATOS.forEach((c) => {
        if (guardados[c] === undefined) return;
        if (c === "entrega") f.entrega.value = guardados.entrega || "envio";
        else f[c].value = guardados[c];
    });
    actualizarCamposDatos();
}

function actualizarCamposDatos() {
    const f = formDatos.elements;
    const envio = f.entrega.value === "envio";
    formDatos.querySelector(".solo-envio").hidden = !envio;
    ["direccion", "localidad"].forEach((c) => { f[c].required = envio; });
    const facturaA = f.factura.value.startsWith("Factura A");
    $("#campo-cuit").hidden = !facturaA;
    f.cuit.required = facturaA;
}

function marcarError(campo, mensaje) {
    const contenedor = campo.closest(".campo");
    contenedor.classList.add("campo--error");
    let aviso = contenedor.querySelector(".campo__error");
    if (!aviso) {
        aviso = document.createElement("small");
        aviso.className = "campo__error";
        contenedor.appendChild(aviso);
    }
    aviso.textContent = mensaje;
}

function limpiarError(campo) {
    const contenedor = campo.closest(".campo");
    if (!contenedor) return;
    contenedor.classList.remove("campo--error");
    contenedor.querySelector(".campo__error")?.remove();
}

function validarDatos() {
    const f = formDatos.elements;
    const errores = [];
    const revisar = (nombre, valido, mensaje) => {
        const campo = f[nombre];
        limpiarError(campo);
        if (!valido) {
            marcarError(campo, mensaje);
            errores.push(campo);
        }
    };
    const d = leerDatos();
    revisar("nombre", d.nombre.length >= 3, "Escribí tu nombre y apellido.");
    revisar("telefono", d.telefono.replace(/\D/g, "").length >= 8, "Escribí un teléfono con código de área.");
    if (d.entrega === "envio") {
        revisar("direccion", d.direccion.length >= 4, "Escribí la dirección de entrega.");
        revisar("localidad", d.localidad.length >= 2, "Escribí la localidad o el barrio.");
    }
    revisar("pago", Boolean(d.pago), "Elegí cómo vas a pagar.");
    if (d.factura.startsWith("Factura A")) revisar("cuit", d.cuit.replace(/\D/g, "").length === 11, "El CUIT tiene 11 números.");
    if (errores.length) {
        errores[0].focus();
        errores[0].scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return errores.length === 0;
}

function enviarPedido() {
    const lineas = lineasPedido();
    if (!lineas.length || !validarDatos()) return;
    const d = leerDatos();
    guardar("datos", { ...d, notas: "" });

    let mensaje = "¡Hola EnFrío! Quiero hacer este pedido:\n";
    mensaje += `\n*Datos*\n• Nombre: ${d.nombre}\n• Teléfono: ${d.telefono}\n`;
    if (d.comercio) mensaje += `• Comercio: ${d.comercio}\n`;
    mensaje += estado.cliente === "fijo"
        ? `• Cliente fijo: ${estado.nombreCliente}\n`
        : `• Precios: de lista (cliente nuevo)\n`;

    mensaje += `\n*Entrega*\n`;
    if (d.entrega === "envio") {
        mensaje += `• Envío a domicilio: ${d.direccion}, ${d.localidad}\n`;
        if (d.referencias) mensaje += `• Referencias: ${d.referencias}\n`;
    } else {
        mensaje += `• Retiro en el local\n`;
    }
    if (d.horario) mensaje += `• Día y horario: ${d.horario}\n`;

    mensaje += `\n*Pago*\n• ${d.pago}\n• ${d.factura}${d.factura.startsWith("Factura A") ? ` · CUIT ${d.cuit}` : ""}\n`;

    const grupos = {};
    lineas.forEach((l) => {
        const clave = `${NOMBRE_CANAL[l.producto.canal]} · ${NOMBRE_VENTA[l.producto.venta]}`;
        (grupos[clave] ||= []).push(l);
    });
    Object.entries(grupos).forEach(([grupo, deGrupo]) => {
        mensaje += `\n*${grupo}*\n`;
        deGrupo.forEach(({ producto: p, cantidad }) => {
            const detalle = [p.marca, ...p.presentacion].filter(Boolean).join(", ");
            const porPedido = precioPorPedido(p);
            mensaje += `• ${textoCantidad(p, cantidad)} — ${p.nombre}${detalle ? ` (${detalle})` : ""} — ${porPedido ? pesos(porPedido * cantidad) : "a consultar"}\n`;
        });
    });
    mensaje += `\n*Total estimado:* ${pesos(totalPedido(lineas))}\n`;
    if (d.notas) mensaje += `\n*Notas:* ${d.notas}\n`;
    mensaje += `\n_Precios del catálogo web, a confirmar._`;

    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
}

// ---------- Lista para imprimir ----------
function prepararImpresion() {
    const lista = productosVisibles();
    const fila = (p) => {
        const precio = !p.hayStock ? "Sin stock" : precioDe(p) ? pesos(precioDe(p)) : "Consultar";
        return `<tr><td>${escapar(p.nombre)}</td><td>${escapar(p.marca)}</td><td>${escapar(p.presentacion.join(" · "))}</td><td>${NOMBRE_UNIDAD[p.unidad] || ""}</td><td class="num">${precio}</td></tr>`;
    };
    const tipo = estado.cliente === "fijo" ? `Cliente fijo: ${escapar(estado.nombreCliente)}` : "Precios de lista";
    $("#impresion").innerHTML = `
        <div class="impresion__cabecera">
            <div>
                <h1>Lista de precios · ${NOMBRE_CANAL[estado.canal]} · ${NOMBRE_VENTA[estado.venta]}</h1>
                <p>${tipo}${actualizado ? " · " + escapar(actualizado) : ""}</p>
            </div>
            <img src="img/logo-negro.png" alt="EnFrío Distribuidora">
        </div>
        ${categoriasDe(lista).map(([categoria]) => `
            <h2>${escapar(categoria)}</h2>
            <table>
                <thead><tr><th>Producto</th><th>Marca</th><th>Presentación</th><th></th><th class="num">Precio</th></tr></thead>
                <tbody>${lista.filter((p) => p.categoria === categoria).map(fila).join("")}</tbody>
            </table>`).join("")}
        <p class="impresion__pie">Precios en pesos, sujetos a cambio sin previo aviso. Pedidos por WhatsApp: +${escapar(CONFIG.whatsapp)}</p>`;
}

// ---------- Tema claro / oscuro ----------
function aplicarTema(tema) {
    document.documentElement.dataset.tema = tema;
    $("#logo-principal").src = tema === "oscuro" ? "img/logo-blanco.png" : "img/logo-negro.png";
    $("#boton-tema").setAttribute("aria-label", tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    $("#boton-tema").innerHTML = tema === "oscuro"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
}

// ---------- Eventos ----------
document.querySelectorAll(".canal").forEach((boton) => boton.addEventListener("click", () => {
    estado.canal = boton.dataset.canal;
    estado.categoria = null;
    guardar("canal", estado.canal);
    dibujarTodo();
}));

$("#selector-venta").addEventListener("click", (e) => {
    const boton = e.target.closest("button");
    if (!boton || boton.disabled) return;
    estado.venta = boton.dataset.venta;
    estado.categoria = null;
    dibujarTodo();
});

elCategorias.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    estado.categoria = chip.dataset.categoria || null;
    dibujarCategorias();
    dibujarProductos();
    const filtros = $("#filtros");
    if (filtros.getBoundingClientRect().top <= 0) {
        window.scrollTo({ top: filtros.offsetTop, behavior: "smooth" });
    }
});

let esperaBusqueda;
$("#buscador").addEventListener("input", (e) => {
    clearTimeout(esperaBusqueda);
    esperaBusqueda = setTimeout(() => {
        estado.busqueda = e.target.value;
        dibujarProductos();
    }, 200);
});

elSecciones.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    cambiarCantidad(boton.closest("[data-id]").dataset.id, boton.dataset.accion === "sumar" ? 1 : -1);
});

$("#lista-pedido").addEventListener("click", (e) => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    cambiarCantidad(boton.closest("[data-id]").dataset.id, boton.dataset.accion === "sumar" ? 1 : -1);
});

elAviso.addEventListener("click", (e) => {
    if (!e.target.closest("#boton-salir-cliente")) return;
    guardar("codigo", null);
    estado.cliente = "nuevo";
    estado.nombreCliente = "";
    dibujarProductos();
    dibujarAviso();
    dibujarPedido();
});

$("#boton-abrir-pedido").addEventListener("click", abrirPedido);
$("#barra-pedido").addEventListener("click", abrirPedido);
$("#boton-cerrar-pedido").addEventListener("click", cerrarPedido);
elFondo.addEventListener("click", cerrarPedido);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarPedido(); });
$("#boton-continuar").addEventListener("click", () => {
    if (!lineasPedido().length) return;
    cargarDatos();
    mostrarPaso(2);
    setTimeout(() => formDatos.elements.nombre.focus({ preventScroll: true }), 300);
});
$("#boton-volver").addEventListener("click", () => mostrarPaso(1));
formDatos.addEventListener("submit", (e) => {
    e.preventDefault();
    enviarPedido();
});
formDatos.addEventListener("change", actualizarCamposDatos);
formDatos.addEventListener("input", (e) => {
    limpiarError(e.target);
    guardar("datos", leerDatos());
});
$("#boton-vaciar").addEventListener("click", () => {
    pedido = {};
    guardar("pedido", pedido);
    dibujarProductos();
    dibujarPedido();
});

$("#boton-tema").addEventListener("click", () => {
    const tema = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro";
    guardar("tema", tema);
    aplicarTema(tema);
});

$("#boton-imprimir").addEventListener("click", () => {
    prepararImpresion();
    window.print();
});
window.addEventListener("beforeprint", prepararImpresion);

// ---------- Inicio ----------
async function iniciar() {
    aplicarTema(leerGuardado("tema", window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro"));
    $("#enlace-whatsapp").href = `https://wa.me/${CONFIG.whatsapp}`;

    try {
        const [respuesta] = await Promise.all([
            fetch("datos/productos.json", { cache: "no-cache" }),
            identificarCliente(),
        ]);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const datos = await respuesta.json();
        actualizado = datos.actualizado || "";
        $("#texto-actualizado").textContent = actualizado;
        productos = prepararProductos(datos.productos || []);
        // Se descartan del pedido guardado los productos que ya no existen.
        Object.keys(pedido).forEach((id) => { if (!productos.some((p) => p.id === id)) delete pedido[id]; });
        elCarga.hidden = true;
        dibujarTodo();
        dibujarPedido();
    } catch (error) {
        console.error("No se pudo cargar el catálogo:", error);
        elCarga.innerHTML = `<p>No pudimos cargar el catálogo. Probá recargar la página o escribinos por WhatsApp.</p>`;
    }
}

iniciar();
