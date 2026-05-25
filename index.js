const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const nodemailer = require('nodemailer');
const app = express();

// --- CONFIGURACIONES ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// ✅ CONFIGURACION PROFESIONAL (HOSTINGER)
const transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true, 
    auth: {
        user: 'soporte@urbankicks.com.ar', 
        pass: 'Carpeta_123' // Reemplaza por tu contraseña real
    },
    tls: {
        rejectUnauthorized: false // evita bloqueos por certificados no verificados
    }
});

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Carpetas Estáticas
app.use(express.static(path.join(__dirname, 'public_html')));
app.use('/uploads', express.static('/home/u981899354/imagenes_urban'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Usamos la ruta absoluta para que no se borren
        cb(null, '/home/u981899354/imagenes_urban'); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Redirección automática de .html a ruta limpia
app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        const newPath = req.path.slice(0, -5); // Quita el '.html'
        return res.redirect(301, newPath);
    }
    next();
});

// --- RUTAS DE NAVEGACIÓN ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'tienda.html')));
app.get('/tienda', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'tienda.html')));
app.get('/detalle', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'detalle.html')));
app.get('/carrito', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'carrito.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'admin.html')));
app.get('/perfil', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'perfil.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'login.html')));
app.get('/registro', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'registro.html')));
app.get('/ropa', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'ropa.html')));
app.get('/detalle-ropa', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'detalle-ropa.html')));

// --- RUTAS DE API ---
// 1. CONTROLADOR UNIFICADO INTELIGENTE (TIENE QUE IR PRIMERO SÍ O SÍ)
const manejarConfirmarVenta = async (req, res) => {
    const { product_id, size } = req.body;

    if (!product_id || !size) {
        return res.status(400).json({ error: "Faltan parámetros requeridos (product_id o size)." });
    }

    const idLimpio = parseInt(product_id, 10);
    const talleLimpio = size.toString().trim(); 

    const esRopa = /[a-zA-Z]/.test(talleLimpio) && talleLimpio.length < 3;

    try {
        if (esRopa) {
            const [rows] = await pool.query(
                'SELECT stock FROM clothing_sizes WHERE product_id = ? AND size = ?',
                [idLimpio, talleLimpio]
            );

            if (rows.length === 0) {
                return res.status(400).json({ error: `No se encontró talle Ropa '${talleLimpio}' para ID ${idLimpio}` });
            }
            if (rows[0].stock <= 0) return res.status(400).json({ error: "No hay stock en ropa." });

            await pool.query(
                'UPDATE clothing_sizes SET stock = stock - 1 WHERE product_id = ? AND size = ?',
                [idLimpio, talleLimpio]
            );
            return res.json({ success: true, message: "Stock de ROPA actualizado con éxito" });

        } else {
            const [rows] = await pool.query(
                'SELECT stock, size FROM product_sizes WHERE product_id = ? AND (size = ? OR size = ?)',
                [idLimpio, talleLimpio, `T${talleLimpio}`]
            );

            if (rows.length === 0) {
                return res.status(400).json({ error: `No se encontró talle Zapatilla '${talleLimpio}' para ID ${idLimpio}` });
            }
            if (rows[0].stock <= 0) return res.status(400).json({ error: "No hay stock en zapatillas." });

            const talleExactoBD = rows[0].size; 

            await pool.query(
                'UPDATE product_sizes SET stock = stock - 1 WHERE product_id = ? AND size = ?',
                [idLimpio, talleExactoBD]
            );
            return res.json({ success: true, message: "Stock de ZAPATILLAS actualizado con éxito" });
        }
    } catch (err) {
        console.error("Error global en confirmación:", err);
        return res.status(500).json({ error: "Error interno del servidor", detalle: err.message });
    }
};

// Enganches fijos mapeados antes de los parámetros dinámicos
app.post('/api/productos/confirmar-venta', manejarConfirmarVenta);
app.put('/api/productos/confirmar-venta', manejarConfirmarVenta);
app.post('/api/ropa/confirmar-venta', manejarConfirmarVenta);
app.put('/api/ropa/confirmar-venta', manejarConfirmarVenta);

// 1. OBTENER PRODUCTO POR ID (CON SOPORTE MULTICATEGORÍA)
app.get('/api/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: "No encontrado" });

        const producto = rows[0];
        
        // CORRECCIÓN: Traer todas las categorías asociadas al producto desde la tabla intermedia
        const [cats] = await pool.query('SELECT category_id FROM product_categories_map WHERE product_id = ?', [id]);
        producto.categories = cats.map(c => c.category_id); // Devolvemos un array plano: [1, 3]

        const [talles] = await pool.query('SELECT size, stock FROM product_sizes WHERE product_id = ? AND stock > 0', [id]);
        producto.sizes = talles;

        const [colores] = await pool.query('SELECT color_name FROM product_colors WHERE product_id = ?', [id]);
        producto.colors = colores;

        res.json(producto);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. OBTENER TODOS LOS PRODUCTOS (CON SOPORTE MULTICATEGORÍA)
app.get('/api/productos', async (req, res) => {
    try {
        const [productos] = await pool.query('SELECT * FROM products ORDER BY id DESC');
        for (let i = 0; i < productos.length; i++) {
            // CORRECCIÓN: Adjuntar el array de categorías correspondientes a cada ítem
            const [cats] = await pool.query('SELECT category_id FROM product_categories_map WHERE product_id = ?', [productos[i].id]);
            productos[i].categories = cats.map(c => c.category_id);

            const [talles] = await pool.query('SELECT size, stock FROM product_sizes WHERE product_id = ?', [productos[i].id]);
            productos[i].sizes = talles;

            const [colores] = await pool.query('SELECT color_name FROM product_colors WHERE product_id = ?', [productos[i].id]);
            productos[i].colors = colores;
        }
        res.json(productos);
    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN GET PRODUCTOS:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- SUBIR NUEVA PROMOCIÓN ---
app.post('/api/promociones/nuevo', upload.single('imagen'), async (req, res) => {
    const { title, subtitle, tipo } = req.body;
    if (!req.file) return res.status(400).json({ error: "Debes subir una imagen" });
    const image_url = `/uploads/${req.file.filename}`;
    try {
        await pool.query(
            'INSERT INTO promotions (title, subtitle, image_url, tipo) VALUES (?, ?, ?, ?)',
            [title, subtitle, image_url, tipo || 'texto_imagen']
        );
        res.json({ success: true, message: "Promoción guardada correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- OBTENER TODAS LAS PROMOS ---
app.get('/api/promociones', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM promotions ORDER BY id DESC');
        res.json(rows);
    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN PROMOS:", error);
        res.status(500).json({ error: error.message });
    }
});

// Borrar Productos
app.delete('/api/productos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM product_colors WHERE product_id = ?', [id]);
        await pool.query('DELETE FROM product_sizes WHERE product_id = ?', [id]);
        await pool.query('DELETE FROM products WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. EDITAR PRODUCTO (CON MULTICATEGORÍA)
app.put('/api/productos/:id', upload.array('images'), async (req, res) => {
    const { id } = req.params;
    // Recibimos 'categories' que vendrá mapeado como un JSON stringificado
    const { name, description, price, categories, sizes, colors } = req.body;
    try {
        if (!name) return res.status(400).json({ error: "Faltan datos (name)" });
        
        // Mantenemos la actualización base (seteamos un valor fallback en category_id por retrocompatibilidad)
        const primerCat = categories ? (typeof categories === 'string' ? JSON.parse(categories)[0] : categories[0]) : null;
        await pool.query("UPDATE products SET name = ?, description = ?, price = ?, category_id = ? WHERE id = ?", [name, description, price, primerCat, id]);

        if (req.files && req.files.length > 0) {
            const nuevasImagenes = req.files.map(f => `/uploads/${f.filename}`).join(',');
            await pool.query("UPDATE products SET image_url = ? WHERE id = ?", [nuevasImagenes, id]);
        }

        // CORRECCIÓN MULTICATEGORÍA: Borrar asociaciones viejas e insertar los nuevos mapeos
        if (categories) {
            await pool.query("DELETE FROM product_categories_map WHERE product_id = ?", [id]);
            const parsedCategories = typeof categories === 'string' ? JSON.parse(categories) : categories;
            for (let catId of parsedCategories) {
                await pool.query('INSERT INTO product_categories_map (product_id, category_id) VALUES (?, ?)', [id, catId]);
            }
        }

        if (sizes) {
            await pool.query("DELETE FROM product_sizes WHERE product_id = ?", [id]);
            const parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
            for (let item of parsedSizes) {
                await pool.query('INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)', [id, item.size, item.stock]);
            }
        }

        if (colors) {
            await pool.query("DELETE FROM product_colors WHERE product_id = ?", [id]);
            const parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
            for (let colorName of parsedColors) {
                await pool.query('INSERT INTO product_colors (product_id, color_name) VALUES (?, ?)', [id, colorName]);
            }
        }
        res.json({ success: true, message: "Producto actualizado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- EDITAR PRENDA (ROPA) ---
app.put('/api/ropa/:id', upload.array('images'), async (req, res) => {
    const { id } = req.params;
    
    // Ahora req.body SÍ tendrá los datos porque Multer los extrajo del FormData
    const { name, description, price, category_id, sizes } = req.body;

    try {
        // 1. Actualizar datos básicos
        await pool.query(
            "UPDATE clothing_products SET name = ?, description = ?, price = ?, category_id = ? WHERE id = ?",
            [name, description, price, category_id, id]
        );

        // 2. Manejo de imagen (Opcional: por si subieron una foto nueva al editar)
        if (req.files && req.files.length > 0) {
            const nuevaImagen = `/uploads/${req.files[0].filename}`;
            await pool.query("UPDATE clothing_products SET image_url = ? WHERE id = ?", [nuevaImagen, id]);
        }

        // 3. Actualizar Talles (Borrar e insertar nuevos)
        if (sizes) {
            await pool.query("DELETE FROM clothing_sizes WHERE product_id = ?", [id]);
            
            // Multer a veces manda el JSON como string, lo parseamos si es necesario
            const parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
            
            for (let item of parsedSizes) {
                await pool.query(
                    'INSERT INTO clothing_sizes (product_id, size, stock) VALUES (?, ?, ?)',
                    [id, item.size, item.stock]
                );
            }
        }

        res.json({ success: true, message: "Prenda actualizada con éxito" });
    } catch (error) {
        console.error("Error en edición de ropa:", error);
        res.status(500).json({ error: "Error interno al actualizar ropa" });
    }
});

// Borrar Promociones 
app.delete('/api/promociones/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM promotions WHERE id = ?', [id]);
        
        if (result.affectedRows > 0) {
            res.json({ success: true, message: "Promoción eliminada" });
        } else {
            res.status(404).json({ error: "Promoción no encontrada" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// 4. CREAR NUEVO PRODUCTO (CON MULTICATEGORÍA)
app.post('/api/productos', upload.array('images', 5), async (req, res) => {
    const { name, description, price, categories, sizes, colors } = req.body;
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "Debes subir al menos una imagen." });
    const image_url = req.files.map(f => `/uploads/${f.filename}`).join(',');
    
    try {
        const parsedCategories = categories ? JSON.parse(categories) : [];
        const primerCat = parsedCategories.length > 0 ? parsedCategories[0] : null;

        const [result] = await pool.query(
            'INSERT INTO products (name, description, price, image_url, category_id) VALUES (?, ?, ?, ?, ?)',
            [name, description, price, image_url, primerCat]
        );
        const newProductId = result.insertId;

        // CORRECCIÓN MULTICATEGORÍA: Insertar cada ID en la tabla intermedia
        for (let catId of parsedCategories) {
            await pool.query('INSERT INTO product_categories_map (product_id, category_id) VALUES (?, ?)', [newProductId, catId]);
        }

        if (sizes && sizes !== "[]") {
            const parsedSizes = JSON.parse(sizes); 
            for (let item of parsedSizes) {
                await pool.query('INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)', [newProductId, item.size, item.stock]);
            }
        }

        if (colors && colors !== "[]") {
            const parsedColors = JSON.parse(colors);
            for (let colorName of parsedColors) {
                await pool.query('INSERT INTO product_colors (product_id, color_name) VALUES (?, ?)', [newProductId, colorName]);
            }
        }
        res.json({ success: true, id: newProductId });
    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN POST PRODUCTOS:", error);
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (email === 'admin_urban@gmail.com' && password === 'Administrador2026') {
            const token = jwt.sign({ id: 999, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
            return res.json({ message: "Bienvenida, Admin!", token, role: 'admin' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ error: "Usuario no registrado." });
        
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: "Credenciales inválidas." });

        const userRole = user.role || (user.is_admin === 1 ? 'admin' : 'user');
        const token = jwt.sign({ id: user.id, role: userRole }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({ message: "Login exitoso", token, role: userRole });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registro
app.post('/api/registro', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [name || 'Nuevo Usuario', email, hashedPassword, 'user']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "El email ya existe." });
    }
});

// Perfil de Usuario
app.get('/api/usuario/perfil', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No autorizado" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.id === 999 || decoded.role === 'admin') {
            return res.json({ 
                id: 999, username: 'AdminUrban', role: 'admin', full_name: 'Administrador Urban Kicks',
                dni: '00000000', email: 'admin_urban@gmail.com', phone: '1100000000', address: 'Panel',
                postal_code: '1000', city: 'CABA', province: 'Buenos Aires', avatar_url: ''
            });
        }

        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
        if (rows.length === 0) return res.status(404).json({ error: "No encontrado" });
        const u = rows[0];
        res.json({ 
            id: u.id, username: u.username || 'Usuario', role: u.role || (u.is_admin === 1 ? 'admin' : 'user'),
            full_name: u.full_name || '', dni: u.dni || '', email: u.email || '', phone: u.phone || '',
            address: u.address || '', postal_code: u.postal_code || '', city: u.city || '', province: u.province || '', avatar_url: u.avatar_url || ''
        });
    } catch (error) {
        res.status(401).json({ error: "Sesión inválida" });
    }
});

// ✅ RUTA DE RECUPERACIÓN (CORREGIDA Y LIMPIA)
app.post('/api/usuario/recuperar-password', async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ success: false, error: "Correo no registrado" });

        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        const expiracion = new Date();
        expiracion.setMinutes(expiracion.getMinutes() + 15);

        await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);
        await pool.query('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)', [email, codigo, expiracion]);

        const mailOptions = {
            from: '"Urban Kicks 👟" <soporte@urbankicks.com.ar>', // ✅ DEBE SER EL DE HOSTINGER
            to: email,
            subject: 'Código de Recuperación - Urban Kicks',
            html: `
                <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #000;">Recuperación de Contraseña</h2>
                    <p>Tu código de verificación es:</p>
                    <div style="background: #f4f4f4; padding: 10px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px;">
                        ${codigo}
                    </div>
                    <p>Este código expirará en 15 minutos.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Código enviado" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Error al enviar el mail" });
    }
});

// Restablecer contraseña
app.post('/api/usuario/restablecer-password', async (req, res) => {
    const { email, codigo, nuevaPassword } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM password_resets WHERE email = ? AND token = ? AND expires_at > NOW()', [email, codigo]);
        if (rows.length === 0) return res.status(400).json({ error: "Código inválido o expirado." });

        const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
        await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
        await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al restablecer" });
    }
});

// --- ACTUALIZAR PERFIL DE USUARIO ---
app.post('/api/usuario/actualizar', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No autorizado" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        const { full_name, dni, username, email, phone, address, postal_code, city, province, password, avatar_url } = req.body;

        // 1. Preparamos la consulta básica
        let query = `
            UPDATE users SET 
            full_name = ?, dni = ?, username = ?, email = ?, 
            phone = ?, address = ?, postal_code = ?, city = ?, province = ?
        `;
        let params = [full_name, dni, username, email, phone, address, postal_code, city, province];

        // 2. Si envió una nueva contraseña, la hasheamos y la agregamos
        if (password && password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += `, password = ?`;
            params.push(hashedPassword);
        }

        // 3. Si envió un nuevo avatar (base64 comprimido que envías desde el front)
        if (avatar_url) {
            query += `, avatar_url = ?`;
            params.push(avatar_url);
        }

        // 4. Cerramos la consulta con el ID del usuario
        query += ` WHERE id = ?`;
        params.push(decoded.id);

        await pool.query(query, params);

        const [rows] = await pool.query('SELECT id, full_name, dni, username, email, phone, address, postal_code, city, province, avatar_url FROM users WHERE id = ?', [decoded.id]);
        res.json({ success: true, message: "Perfil actualizado correctamente", user: rows[0] });

    } catch (error) {
        console.error("Error al actualizar perfil:", error);
        res.status(500).json({ success: false, error: "Error interno al guardar" });
    }
});

// OBTENER TODAS LAS MARCAS (sin parámetro - va PRIMERO)
app.get('/api/talles', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT marca FROM tabla_talles ORDER BY marca ASC");
        res.json({ success: true, marcas: results.map(r => r.marca) });
    } catch (err) {
        res.json({ success: false, marcas: [] });
    }
});

// OBTENER TABLA DE TALLE POR MARCA (con parámetro - va DESPUÉS)
app.get('/api/talles/:marca', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT imagen_url FROM tabla_talles WHERE marca = ?", [req.params.marca.toLowerCase()]);
        if (results.length === 0) return res.json({ success: false });
        res.json({ success: true, imagen_url: results[0].imagen_url });
    } catch (err) {
        res.json({ success: false });
    }
});

// SUBIR O ACTUALIZAR TABLA DE TALLE (ADMIN)
app.post('/api/admin/talles', upload.single('imagen_talle'), async (req, res) => {
    const { marca } = req.body;
    const imagen_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!marca || !imagen_url) return res.status(400).json({ success: false, message: "Datos incompletos" });

    const query = `
        INSERT INTO tabla_talles (marca, imagen_url)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE imagen_url = VALUES(imagen_url)
    `;

    try {
        await pool.query(query, [marca.toLowerCase(), imagen_url]);
        res.json({ success: true, message: "Tabla de talles actualizada" });
    } catch (err) {
        res.status(500).json({ success: false, err });
    }
});

// --- API PARA ROPA ---

// --- API PARA ROPA ---
app.get('/api/ropa/categorias', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM clothing_categories ORDER BY nombre ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// OBTENER TODOS LOS PRODUCTOS DE ROPA (con filtro opcional)
app.get('/api/ropa', async (req, res) => {
    try {
        const { categoria } = req.query;
        let query = 'SELECT * FROM clothing_products ORDER BY id DESC';
        let params = [];
        if (categoria) {
            query = 'SELECT * FROM clothing_products WHERE category_id = ? ORDER BY id DESC';
            params = [categoria];
        }
        const [productos] = await pool.query(query, params);
        for (let p of productos) {
            const [sizes] = await pool.query('SELECT size, stock FROM clothing_sizes WHERE product_id = ? AND stock > 0', [p.id]);
            const [colors] = await pool.query('SELECT color_name FROM clothing_colors WHERE product_id = ?', [p.id]);
            p.sizes = sizes;
            p.colors = colors;
        }
        res.json(productos);
    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN ROPA:", error);
        res.status(500).json({ error: error.message });
    }
});

// OBTENER PRODUCTO DE ROPA POR ID
app.get('/api/ropa/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM clothing_products WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
        const producto = rows[0];
        const [sizes] = await pool.query('SELECT size, stock FROM clothing_sizes WHERE product_id = ? AND stock > 0', [producto.id]);
        const [colors] = await pool.query('SELECT color_name FROM clothing_colors WHERE product_id = ?', [producto.id]);
        producto.sizes = sizes;
        producto.colors = colors;
        res.json(producto);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// SUBIR PRODUCTO DE ROPA
app.post('/api/ropa', upload.array('images', 5), async (req, res) => {
    const { name, description, price, category_id, sizes, colors } = req.body;
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Subí al menos una imagen' });
    const image_url = req.files.map(f => `/uploads/${f.filename}`).join(',');
    try {
        const [result] = await pool.query(
            'INSERT INTO clothing_products (name, description, price, image_url, category_id) VALUES (?, ?, ?, ?, ?)',
            [name, description, price, image_url, category_id]
        );
        const newId = result.insertId;
        if (sizes && sizes !== '[]') {
            for (let item of JSON.parse(sizes)) {
                await pool.query('INSERT INTO clothing_sizes (product_id, size, stock) VALUES (?, ?, ?)', [newId, item.size, item.stock]);
            }
        }
        if (colors && colors !== '[]') {
            for (let color of JSON.parse(colors)) {
                await pool.query('INSERT INTO clothing_colors (product_id, color_name) VALUES (?, ?)', [newId, color]);
            }
        }
        res.json({ success: true, id: newId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ELIMINAR PRODUCTO DE ROPA
app.delete('/api/ropa/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM clothing_products WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREAR CATEGORÍA DE ROPA
app.post('/api/ropa/categorias', async (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    try {
        const [result] = await pool.query('INSERT INTO clothing_categories (nombre) VALUES (?)', [nombre]);
        res.json({ success: true, id: result.insertId, nombre });
    } catch (err) {
        res.status(500).json({ error: 'Error al crear categoría' });
    }
});


app.use((req, res) => res.status(404).send("No encontrado"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Urban Kicks encendido en puerto ${PORT}`));