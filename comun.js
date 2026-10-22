// Lo que usan tanto el catálogo como el panel: categorías, formato de precios y cifrado.

const CATEGORIAS = {
    "Pescados y mariscos": { color: "#1fa3dc", icono: '<path d="M3 12c2.5-3.5 6-5.5 10-5.5S20 9 22 12c-2 3-5 5.5-9 5.5S5.5 15.5 3 12z"/><path d="M3 12 1 8.5M3 12l-2 3.5"/><circle cx="17" cy="11" r=".6"/>' },
    "Pollo": { color: "#e08a1f", icono: '<path d="M13.5 13.6c-2.3-2.3-2-6.4.6-8.6 2.4-2 6-1.6 7.7.9 1.4 2.2.8 5.3-1.4 6.8-2 1.4-4.6 1.5-6.9.9z"/><path d="m13.5 13.6-5.2 5.2"/><path d="M8.3 18.8a1.8 1.8 0 1 1-2.5-1.6 1.8 1.8 0 1 1 1.6-2.5"/>' },
    "Croquetas y bocaditos": { color: "#d39a12", icono: '<ellipse cx="8" cy="15" rx="5" ry="3.5"/><ellipse cx="16" cy="9" rx="5" ry="3.5"/><path d="M6 14.5h.01M9.5 16h.01M14 8.5h.01M17.5 10h.01"/>' },
    "Veggie": { color: "#2f9e5b", icono: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="m5 19 8-8"/>' },
    "Papas": { color: "#e2a60f", icono: '<path d="M6 10h12l-1.5 10h-9z"/><path d="M8 10V4.5M11 10V3M14 10V4M16.5 10V6"/>' },
    "Pastas": { color: "#c9772e", icono: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 11c0-3 1-6 4-7M12 11c0-3 1.5-5 4-6"/>' },
    "Tartas": { color: "#b8662d", icono: '<path d="M3 13h18l-2 6H5z"/><path d="M4 13c1-4 4.5-6 8-6s7 2 8 6M9 10l1.5 1.5M14 9.5 13 11"/>' },
    "Panificados": { color: "#a8743a", icono: '<path d="M5 10a3.5 3.5 0 0 1 2.5-6.5h9A3.5 3.5 0 0 1 19 10v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M9 9v3M12 8v3M15 9v3"/>' },
    "Sin gluten": { color: "#8a6bd1", icono: '<path d="M12 21V9"/><path d="M12 14c-2 0-4-1.5-4-4 2 0 4 1.5 4 4zM12 14c2 0 4-1.5 4-4-2 0-4 1.5-4 4zM12 9c-1.5 0-3-1.2-3-3.2 1.5 0 3 1.2 3 3.2zM12 9c1.5 0 3-1.2 3-3.2-1.5 0-3 1.2-3 3.2z"/><path d="M4 4l16 16"/>' },
    "Frutas": { color: "#e0445b", icono: '<path d="M12 7.5c-4 0-7 2.5-7 6 0 4 3.5 7.5 7 7.5s7-3.5 7-7.5c0-3.5-3-6-7-6z"/><path d="M12 7.5V3M9 4.5l3 3 3-3"/><path d="M10 12h.01M14 12h.01M12 15h.01M9.5 17h.01M14.5 17h.01"/>' },
    "Helados y postres": { color: "#d45fa0", icono: '<path d="M8 10a4 4 0 1 1 8 0"/><path d="M7 10h10l-5 11z"/><path d="m9.5 13 4 3"/>' },
    "Bebidas": { color: "#f08c1a", icono: '<path d="M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z"/><path d="M8 13h8"/>' },
};
const CATEGORIA_GENERICA = { color: "#1fa3dc", icono: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/>' };

const NOMBRE_CANAL = { minorista: "Minorista", mayorista: "Mayorista" };
const NOMBRE_VENTA = { empaquetado: "Empaquetado", granel: "A granel" };
const NOMBRE_CLIENTE = { nuevo: "Cliente nuevo", fijo: "Cliente fijo" };
const NOMBRE_UNIDAD = { unidad: "c/u", caja: "por caja", kg: "por kg" };

const formatoPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const pesos = (n) => formatoPesos.format(Math.round(n)).replace(/\s/g, "");

function escapar(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sinTildes(texto) {
    return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function iconoCategoria(categoria) {
    const datos = CATEGORIAS[categoria] || CATEGORIA_GENERICA;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${datos.icono}</svg>`;
}

// ---------- Cifrado ----------
// El panel guarda en el repositorio (que es público) la llave de GitHub y la lista de
// clientes fijos cifradas con la contraseña del administrador. Los links de los clientes
// fijos llevan un código al azar: en el repositorio solo queda su huella (SHA-256) y el
// nombre cifrado con ese mismo código, así nadie puede leer quiénes son.
const Cifrado = (() => {
    const texto = new TextEncoder();
    const lector = new TextDecoder();

    const aBase64 = (bytes) => {
        let binario = "";
        new Uint8Array(bytes).forEach((b) => { binario += String.fromCharCode(b); });
        return btoa(binario);
    };
    const deBase64 = (cadena) => Uint8Array.from(atob(cadena), (c) => c.charCodeAt(0));

    async function huella(cadena) {
        const resumen = await crypto.subtle.digest("SHA-256", texto.encode(cadena));
        return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    async function claveDeContrasena(contrasena, sal, vueltas) {
        const base = await crypto.subtle.importKey("raw", texto.encode(contrasena), "PBKDF2", false, ["deriveKey"]);
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: deBase64(sal), iterations: vueltas, hash: "SHA-256" },
            base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    }

    async function claveDeCodigo(codigo) {
        const bytes = await crypto.subtle.digest("SHA-256", texto.encode("enfrio-cliente|" + codigo));
        return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
    }

    async function cifrar(clave, valor) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, texto.encode(JSON.stringify(valor)));
        return { iv: aBase64(iv), datos: aBase64(datos) };
    }

    async function descifrar(clave, { iv, datos }) {
        const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64(iv) }, clave, deBase64(datos));
        return JSON.parse(lector.decode(plano));
    }

    function alAzar(largo) {
        // Sin letras que se confunden (0/O, 1/l/I).
        const letras = "abcdefghjkmnpqrstuvwxyz23456789";
        const limite = 256 - (256 % letras.length); // descarta los valores que harían unas letras más probables
        let resultado = "";
        while (resultado.length < largo) {
            for (const n of crypto.getRandomValues(new Uint8Array(largo))) {
                if (n < limite && resultado.length < largo) resultado += letras[n % letras.length];
            }
        }
        return resultado;
    }

    const nuevaSal = () => aBase64(crypto.getRandomValues(new Uint8Array(16)));

    return { huella, claveDeContrasena, claveDeCodigo, cifrar, descifrar, alAzar, nuevaSal, aBase64, deBase64 };
})();
