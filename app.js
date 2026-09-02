// 1. Configuración Inicial
const urlCSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRChXR7V5zh5yfAL3Q9guT7_RkUQMt4XJpVFFSz8iqIVjW2rm9fPM2lxzJU9OD55q5dwBLFaBK_tDDp/pub?output=csv";
const numeroWhatsApp = "5493885310784";

// Variables del DOM
const contenedorProductos = document.getElementById("contenedor-productos");
const pantallaCarga = document.getElementById("pantalla-carga");
const contenedorCarrito = document.getElementById("contenedor-carrito");
const btnEnviarWhatsapp = document.getElementById("btn-enviar-whatsapp");
const contadorCarrito = document.getElementById("contador-carrito");
const inputBuscador = document.getElementById("buscador");

// Variables para el Modo Oscuro
const switchModo = document.getElementById("switch-modo-oscuro");
const logoPrincipal = document.getElementById("logo-principal");
const textoModo = document.getElementById("texto-modo");

// Estado de la aplicación
let carrito = []; 
let todosLosProductos = []; // Guardamos el catálogo completo en memoria

// 2. Lógica del Modo Oscuro
switchModo.addEventListener("change", () => {
    if (switchModo.checked) {
        document.body.classList.add("dark-mode");
        logoPrincipal.src = "img/logo-blanco.png";
        textoModo.textContent = "Modo Claro";
        textoModo.classList.add("text-light");
    } else {
        document.body.classList.remove("dark-mode");
        logoPrincipal.src = "img/logo-negro.png";
        textoModo.textContent = "Modo Oscuro";
        textoModo.classList.remove("text-light");
    }
});

// 3. Carga Inicial
async function cargarCatalogo() {
    try {
        const respuesta = await fetch(urlCSV);
        const datosCSV = await respuesta.text();
        
        // Guardamos los productos en la variable global
        todosLosProductos = procesarCSV(datosCSV);

        pantallaCarga.style.display = "none";
        
        // Renderizamos todos los productos por primera vez
        renderizarProductos(todosLosProductos);

    } catch (error) {
        console.error("Error al cargar el catálogo:", error);
        pantallaCarga.style.display = "none";
        contenedorProductos.innerHTML = "<p class='text-center text-danger'>Hubo un error al cargar los productos.</p>";
    }
}

// 4. Función para dibujar las tarjetas en pantalla
function renderizarProductos(productosARenderizar) {
    contenedorProductos.innerHTML = "";

    // Si la búsqueda no arroja resultados
    if (productosARenderizar.length === 0) {
        contenedorProductos.innerHTML = "<p class='text-center w-100 text-muted mt-5'>No se encontraron productos con esa búsqueda.</p>";
        return;
    }

    productosARenderizar.forEach((producto, index) => {
        if (!producto.nombre) return; 

        const imagenFinal = producto.imagen || 'https://placehold.co/400x250/eeeeee/999999?text=Sin+Imagen';
        
        // Verificar si el producto actual ya está en el carrito para pintar el botón correctamente
        const estaEnCarrito = carrito.includes(producto.nombre);
        const claseBoton = estaEnCarrito ? "btn-primary" : "btn-outline-primary";
        const textoBoton = estaEnCarrito ? "Quitar selección" : "Seleccionar";
        
        const tarjetaHTML = `
            <div class="col">
                <div class="card h-100 shadow-sm border-0" id="card-${index}">
                    <img src="${imagenFinal}" class="card-img-top" alt="${producto.nombre}">
                    <div class="card-body">
                        <h6 class="text-uppercase text-muted mb-1" style="font-size: 0.8rem;">${producto.categoria}</h6>
                        <h5 class="card-title fw-bold">${producto.nombre}</h5>
                        <p class="card-text text-secondary small">${producto.descripcion}</p>
                        <h4 class="text-primary mb-0" style="min-height: 28px;">${producto.precio ? '$' + producto.precio : ''}</h4>
                    </div>
                    <div class="card-footer bg-white border-top-0 pt-0">
                        <button id="btn-prod-${index}" class="btn ${claseBoton} w-100" onclick="manejarSeleccion('${producto.nombre}', ${index})">
                            ${textoBoton}
                        </button>
                    </div>
                </div>
            </div>
        `;
        contenedorProductos.innerHTML += tarjetaHTML;
    });
}

// 5. Lógica del Buscador en tiempo real (Optimizado con Debounce)
let timeoutBusqueda; // Variable para guardar el temporizador

inputBuscador.addEventListener("input", (e) => {
    // Si el usuario escribe otra letra rápidamente, cancelamos la cuenta regresiva anterior
    clearTimeout(timeoutBusqueda);
    
    // Iniciamos una nueva cuenta regresiva de 300 milisegundos
    timeoutBusqueda = setTimeout(() => {
        const textoBusqueda = e.target.value.toLowerCase();
        
        // Filtramos el array global según lo que escribió el usuario
        const productosFiltrados = todosLosProductos.filter(producto => {
            return producto.nombre.toLowerCase().includes(textoBusqueda) || 
                producto.categoria.toLowerCase().includes(textoBusqueda);
        });

        // Volvemos a dibujar la pantalla una sola vez
        renderizarProductos(productosFiltrados);
    }, 250); // 300ms es el tiempo promedio ideal para que el humano termine de teclear
});

// 6. Lógica de Selección de Productos (El Carrito)
window.manejarSeleccion = function(nombreProducto, index) {
    const boton = document.getElementById(`btn-prod-${index}`);
    const indiceEnCarrito = carrito.indexOf(nombreProducto);

    if (indiceEnCarrito === -1) {
        carrito.push(nombreProducto);
        boton.classList.remove("btn-outline-primary");
        boton.classList.add("btn-primary");
        boton.textContent = "Quitar selección";
    } else {
        carrito.splice(indiceEnCarrito, 1);
        boton.classList.remove("btn-primary");
        boton.classList.add("btn-outline-primary");
        boton.textContent = "Seleccionar";
    }
    actualizarInterfazCarrito();
}

// 7. Actualizar el botón flotante
function actualizarInterfazCarrito() {
    contadorCarrito.textContent = carrito.length;
    if (carrito.length > 0) {
        contenedorCarrito.style.display = "block";
    } else {
        contenedorCarrito.style.display = "none";
    }
}

// 8. Enviar a WhatsApp
btnEnviarWhatsapp.addEventListener("click", () => {
    if (carrito.length === 0) return;
    let mensaje = "Hola EnFrío, me gustaría consultar por los siguientes productos:\n\n";
    carrito.forEach(prod => {
        mensaje += `- ${prod}\n`;
    });
    const enlaceWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
    window.open(enlaceWhatsApp, '_blank');
});

// Función auxiliar para leer el CSV
function procesarCSV(texto) {
    const filas = texto.split('\n');
    const resultado = [];
    for (let i = 1; i < filas.length; i++) {
        const filaActual = filas[i];
        if (filaActual.trim() === "") continue;
        const valores = filaActual.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        resultado.push({
            categoria: valores[0] ? valores[0].replace(/"/g, '').trim() : '',
            nombre: valores[1] ? valores[1].replace(/"/g, '').trim() : '',
            descripcion: valores[2] ? valores[2].replace(/"/g, '').trim() : '',
            precio: valores[3] ? valores[3].replace(/"/g, '').trim() : '',
            imagen: valores[4] ? valores[4].replace(/"/g, '').trim() : ''
        });
    }
    return resultado;
}

// Inicializar
cargarCatalogo();