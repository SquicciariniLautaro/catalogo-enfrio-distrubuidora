// Datos que el negocio puede cambiar sin tocar el resto del código.
window.CONFIG = {
    // Número de WhatsApp que recibe los pedidos (código de país + área, sin + ni espacios).
    whatsapp: "5493885310784",

    // Repositorio de GitHub donde el panel guarda los cambios (usuario/repositorio y rama).
    repositorio: "SquicciariniLautaro/catalogo-enfrio-distrubuidora",
    rama: "main",

    // Fotos de los productos: cuenta de Cloudinary (nombre de la nube) y perfil de subida
    // "sin firmar" (unsigned upload preset). No va ninguna clave secreta acá.
    cloudinary: {
        nube: "ikzhq00e",
        perfil: "enfrio-catalogo",
    },
};
