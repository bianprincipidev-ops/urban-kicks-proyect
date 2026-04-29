const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const nodemailer = require('nodemailer');
const app = express();

// --- CONFIGURACIONES ---
app.use(express.json()); 

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

// --- RUTAS DE NAVEGACIÓN ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'index.html')));
app.get('/tienda', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'tienda.html')));
app.get('/detalle', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'detalle.html')));
app.get('/carrito', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'carrito.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public_html', 'admin.html')));

// --- RUTAS DE API ---

// Obtener producto por ID (Actualizado para incluir talles)
app.get('/api/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscamos los datos básicos del producto
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        const producto = rows[0];

        // 2. Buscamos los talles asociados a este producto en la tabla product_sizes
        // Solo traemos los que tengan stock mayor a 0
        const [talles] = await pool.query(
            'SELECT size, stock FROM product_sizes WHERE product_id = ? AND stock > 0', 
            [id]
        );

        // 3. Metemos los talles dentro del objeto producto
        producto.sizes = talles;

        // 4. Enviamos todo junto al detalle.html
        res.json(producto);

    } catch (error) {
        console.error("Error al obtener producto:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/productos', async (req, res) => {
    try{
        //1. Traemos los productos básicos
        const [productos] = await pool.query('SELECT * FROM products ORDER BY id DESC');

        //2. Vincular los talles a cada producto antes de enviarlos
        for (let i = 0; i < productos.length; i++) {
            const [talles] = await pool.query('SELECT size, stock FROM product_sizes WHERE product_id = ?',
                [productos[i].id]
            );
            // Agg la propiedad 'sizes' para que el front la reconozca
            productos[i].sizes = talles;
        }

        res.json(productos);
    } catch (error) {
        console.error("Error al obtener productos:", error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Subir producto nuevo
app.post('/api/productos/nuevo', upload.single('imagen'), async (req, res) => {
    const { name, description, price, category_id } = req.body;
    if (!req.file) return res.status(400).json({ error: "Debes subir una imagen" });
    const image_url = `/uploads/${req.file.filename}`;
    try {
        await pool.query(
            'INSERT INTO products (name, description, price, image_url, category_id) VALUES (?, ?, ?, ?, ?)',
            [name, description, price, image_url, category_id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al guardar" });
    }
});

// --- SUBIR NUEVA PROMOCIÓN ---
app.post('/api/promociones/nuevo', upload.single('imagen'), async (req, res) => {
    const { title, subtitle } = req.body;
    
    if (!req.file) return res.status(400).json({ error: "Debes subir una imagen para la promo" });
    
    const image_url = `/uploads/${req.file.filename}`;
    
    try {
        await pool.query(
            'INSERT INTO promotions (title, subtitle, image_url) VALUES (?, ?, ?)',
            [title, subtitle, image_url]
        );
        res.json({ success: true, message: "Promoción guardada correctamente" });
    } catch (error) {
        console.error("Error al guardar promo:", error);
        res.status(500).json({ error: "Error al guardar la promoción en la base de datos" });
    }
});

// --- OBTENER TODAS LAS PROMOS ---
app.get('/api/promociones', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM promotions ORDER BY id DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar promociones' });
    }
});

// Borrar Productos
app.delete('/api/productos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        
        const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
        
        if (result.affectedRows > 0) {
            res.json({ success: true, message: "Producto eliminado" });
        } else {
            res.status(404).json({ error: "Producto no encontrado" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "No se puede eliminar el producto porque tiene registros asociados (ej: en carritos o pedidos)." });
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

app.post('/api/productos', upload.single('image'), async (req, res) => {
    // 1. Agregamos 'sizes' a la desestructuración
    const { name, description, price, category_id, color, sizes } = req.body;
    const image_url = `/uploads/${req.file.filename}`;
    
    try {
        // 2. Realizamos la inserción del producto
        const [result] = await pool.query(
            'INSERT INTO products (name, description, price, image_url, category_id, color) VALUES (?, ?, ?, ?, ?, ?)',
            [name, description, price, image_url, category_id, color]
        );

        // 3. Obtenemos el ID del producto que se acaba de crear
        const newProductId = result.insertId;

        // 4. Si el admin envió talles, los procesamos e insertamos
        if (sizes) {
            // El frontend los envía como un string JSON, hay que convertirlos a Array
            const parsedSizes = JSON.parse(sizes); 
            
            // Usamos un bucle para insertar cada talle uno por uno
            for (let item of parsedSizes) {
                await pool.query(
                    'INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)',
                    [newProductId, item.size, item.stock]
                );
            }
        }

        res.json({ success: true, id: newProductId });
    } catch (err) {
        console.error("Error al cargar producto:", err);
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) return res.status(404).json({ error: "Usuario no registrado." });
        
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) return res.status(401).json({ error: "Credenciales inválidas." });

        // rol DIRECTO de la base de datos
        const userRole = user.role || (user.is_admin === 1 ? 'admin' : 'user');

        const token = jwt.sign(
            { id: user.id, role: userRole }, 
            process.env.JWT_SECRET || 'secret_key', 
            { expiresIn: '24h' }
        );

        // Enviamos el token y el rol al frontend
        res.json({ 
            message: "Login exitoso", 
            token, 
            role: userRole 
        });

    } catch (error) {
        console.error("Error en Login:", error);
        res.status(500).json({ error: "Error interno." });
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
        const u = rows[0];
        res.json({ 
            id: u.id, 
            username: u.username, 
            role: u.role || (u.is_admin === 1 ? 'admin' : 'user'),
            // Agregás todos los campos que usa el formulario
            full_name: u.full_name || '',
            dni: u.dni || '',
            email: u.email || '',
            phone: u.phone || '',
            address: u.address || '',
            postal_code: u.postal_code || '',
            city: u.city || '',
            province: u.province || '',
            avatar_url: u.avatar_url || ''
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

// Ruta para descontar stock manualmente desde el Admin
app.put('/api/productos/confirmar-venta', async (req, res) => {
    const { product_id, size } = req.body;

    try {
        // 1. Verificamos si hay stock antes de descontar
        const [rows] = await pool.query(
            'SELECT stock FROM product_sizes WHERE product_id = ? AND size = ?',
            [product_id, size]
        );

        if (rows.length === 0 || rows[0].stock <= 0) {
            return res.status(400).json({ error: "No hay stock disponible para descontar" });
        }

        // 2. Restamos 1 unidad
        await pool.query(
            'UPDATE product_sizes SET stock = stock - 1 WHERE product_id = ? AND size = ?',
            [product_id, size]
        );

        res.json({ success: true, message: "Stock actualizado" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al actualizar stock" });
    }
});

// SUBIR O ACTUALIZAR TABLA DE TALLE (ADMIN)
app.post('/api/admin/talles', authMiddleware, upload.single('imagen_talle'), (req, res) => {
    const { marca } = req.body;
    const imagen_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!marca || !imagen_url) return res.status(400).json({ success: false, message: "Datos incompletos" });

    const query = `
        INSERT INTO tabla_talles (marca, imagen_url)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE imagen_url = VALUES(imagen_url)
    `;

    pool.query(query, [marca.toLowerCase(), imagen_url], (err) => {
        if (err) return res.status(500).json({ success: false, err });
        res.json({ success: true, message: "Tabla de talles actualizada" });
    });
});

// OBTENER TABLA DE TALLE (CLIENTE)
app.get('/api/talles/:marca', (req, res) => {
    const query = "SELECT imagen_url FROM tabla_talles WHERE marca = ?";
    db.query(query, [req.params.marca.toLowerCase()], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false });
        res.json({ success: true, imagen_url: results[0].imagen_url });
    });
});

app.use((req, res) => res.status(404).send("No encontrado"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Urban Kicks encendido en puerto ${PORT}`));