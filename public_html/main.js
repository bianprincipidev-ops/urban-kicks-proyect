// === CONFIGURACIÓN GLOBAL (Se ejecuta en todas las páginas) ===
document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar Tema
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = document.getElementById('theme-icon');
    if(icon) icon.className = savedTheme === 'dark' ? 'ri-sun-line' : 'ri-moon-line';

    // 2. Verificar Sesión para el Header
    verificarSesion();
});

// --- 1. MODO OSCURO ---
function toggleTheme() {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    root.setAttribute('data-theme', newTheme);
    const icon = document.getElementById('theme-icon');
    if(icon) icon.className = newTheme === 'dark' ? 'ri-sun-line' : 'ri-moon-line';
    
    localStorage.setItem('theme', newTheme);
}

// --- 2. LÓGICA DE SESIÓN (HEADER) ---
function verificarSesion() {
    const token = localStorage.getItem('urban_token');
    const role = localStorage.getItem('urban_role');
    const userLink = document.getElementById('user-link');
    const btnLogout = document.getElementById('btn-logout');
    const headerIcons = document.querySelector('.header-icons');

    if (token) {
        if(userLink) {
            userLink.href = '/perfil';
            userLink.title = 'Mi Perfil';
        }
        if(btnLogout) btnLogout.style.display = 'inline-block';

        if (role === 'admin' && !document.getElementById('admin-btn')) {
            const adminBtn = document.createElement('a');
            adminBtn.id = 'admin-btn';
            adminBtn.href = '/admin';
            adminBtn.className = 'admin-badge-link';
            adminBtn.innerHTML = '<i class="ri-shield-user-fill"></i><span>Admin</span>';
            if(headerIcons && userLink) headerIcons.insertBefore(adminBtn, userLink);
        }
    } else {
        if(userLink) userLink.href = '/login';
        if(btnLogout) btnLogout.style.display = 'none';
    }
}

function logout() {
    if(confirm("¿Estás seguro de que quieres cerrar sesión?")) {
        localStorage.clear();
        window.location.replace('/');
    }
}

// --- 3. LOGIN & REGISTRO ---
async function ejecutarLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('urban_token', data.token);
            localStorage.setItem('urban_role', data.role); 

            if (data.role === 'admin') {
                alert("¡Bienvenida, Admin de Urban Kicks!");
                window.location.href = '/admin';
            } else {
                const redirectTo = localStorage.getItem('redirect_after_login');
                if (redirectTo) {
                    localStorage.removeItem('redirect_after_login');
                    window.location.href = redirectTo; 
                } else {
                    window.location.href = '/tienda';
                }
            }
        } else {
            alert(data.error);
        }
    } catch (err) { alert("Error de conexión con el servidor."); }
}

async function ejecutarRegistro(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) return alert("Las contraseñas no coinciden");

    try {
        const res = await fetch('/api/registro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (res.ok) {
            alert("¡Cuenta creada! Ya podés iniciar sesión.");
            window.location.href = '/login';
        } else {
            alert("Error: " + data.error);
        }
    } catch (error) { alert("No se pudo conectar con el servidor."); }
}

// --- 4. RECUPERACIÓN DE PASSWORD ---
function mostrarModalRecuperacion() {
    const modal = document.getElementById('modalRecuperar');
    if(modal) modal.style.display = 'block';
}

function cerrarModalRecuperar() {
    const modal = document.getElementById('modalRecuperar');
    if(modal) modal.style.display = 'none';
}

async function enviarCodigoRecuperacion() {
    const emailInput = document.getElementById('emailRecuperar');
    if(!emailInput || !emailInput.value) return alert("Ingresa tu email.");

    try {
        const res = await fetch('/api/usuario/recuperar-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInput.value })
        });
        const data = await res.json();
        if(data.success) {
            alert("¡Código enviado!");
            // Validamos que los pasos existan antes de intentar ocultarlos
            const paso1 = document.getElementById('paso1');
            const paso2 = document.getElementById('paso2');
            if(paso1) paso1.style.display = 'none';
            if(paso2) paso2.style.display = 'block';
        } else { alert(data.error); }
    } catch (err) { alert("Error de conexión."); }
}

async function cambiarPasswordRecuperacion() {
    const email = document.getElementById('emailRecuperar').value;
    const codigo = document.getElementById('codigoVerificacion').value;
    const nuevaPassword = document.getElementById('nuevaPassword').value;

    if(!codigo || !nuevaPassword) return alert("Completa todos los campos.");

    try {
        const res = await fetch('/api/usuario/restablecer-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, codigo, nuevaPassword })
        });
        const data = await res.json();
        if(data.success) {
            alert("¡Contraseña actualizada!");
            location.reload();
        } else { alert(data.error); }
    } catch (err) { alert("Error de conexión."); }
}

// --- 5. MODAL DE TALLES ---
async function abrirModalTalles() {
    const modal = document.getElementById('modalTalles');
    if (!modal) return;
    modal.style.display = 'block';
    try {
        const res = await fetch('/api/talles');
        const data = await res.json();
        const select = document.getElementById('selectMarcaTalle');
        if(!select) return;
        select.innerHTML = '<option value="">-- Seleccioná una marca --</option>';
        data.marcas.forEach(marca => {
            select.innerHTML += `<option value="${marca}">${marca.charAt(0).toUpperCase() + marca.slice(1)}</option>`;
        });
    } catch (e) { console.error(e); }
}

function cerrarModalTalles() {
    const modal = document.getElementById('modalTalles');
    if(modal) modal.style.display = 'none';
}

async function cargarTablaTalle() {
    const select = document.getElementById('selectMarcaTalle');
    const contenedor = document.getElementById('contenedor-tabla-talle');
    if (!select || !contenedor || !select.value) return;
    
    contenedor.innerHTML = 'Cargando...';
    try {
        const res = await fetch(`/api/talles/${select.value}`);
        const data = await res.json();
        if (data.success) {
            contenedor.innerHTML = `<img src="${data.imagen_url}" style="max-width:100%; border-radius:8px;">`;
        }
    } catch { contenedor.innerHTML = 'Error al cargar.'; }
}