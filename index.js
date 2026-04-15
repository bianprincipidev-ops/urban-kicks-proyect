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

// CONFIGURACION DEL TRANSPORTADOR DE CORREO (Nodemailer)
const transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true, 
    auth: {
        user: 'soporte@urbankicks.com.ar', 
        pass: 'Carpeta_123' // La que usaste para crear el mail recién
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- RUTAS DE NAVEGACIÓN (Vistas .html) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public_html', 'index.html')); // Próximamente
});

app.get('/tienda', (req, res) => {
    res.sendFile(path.join(__dirname, 'public_html', 'tienda.html'));
});

app.get('/detalle', (req, res) => {
    res.sendFile(path.join(__dirname, 'public_html', 'detalle.html'));
});

app.get('/carrito', (req, res) => {
    res.sendFile(path.join(__dirname, 'public_html', 'carrito.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public_html', 'admin.html'));
});


// --- RUTAS DE API ---

// 1. OBTENER UN SOLO PRODUCTO POR ID (Para detalle.html)
app.get('/api/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error("❌ Error al obtener producto:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 2. Obtener todos los productos
app.get('/api/productos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products ORDER BY id DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar los productos' });
    }
});

// 3. Subir producto nuevo
app.post('/api/productos/nuevo', upload.single('imagen'), async (req, res) => {
    const { name, description, price, category_id } = req.body;
    if (!req.file) return res.status(400).json({ error: "Debes subir una imagen" });
    const image_url = `/uploads/${req.file.filename}`;
    try {
        await pool.query(
            'INSERT INTO products (name, description, price, image_url, category_id) VALUES (?, ?, ?, ?, ?)',
            [name, description, price, image_url, category_id]
        );
        res.json({ success: true, message: "Producto cargado con éxito" });
    } catch (error) {
        res.status(500).json({ error: "Error al guardar el producto" });
    }
});

// 4. Obtener promociones
app.get('/api/promociones', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM promotions ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Error al traer promociones" });
    }
});

// 5. Guardar nueva promoción
app.post('/api/promociones/nuevo', upload.single('imagen'), async (req, res) => {
    try {
        const { title, subtitle } = req.body;
        const image_url = req.file ? `/uploads/${req.file.filename}` : null;
        await pool.query(
            'INSERT INTO promotions (title, subtitle, image_url) VALUES (?, ?, ?)',
            [title, subtitle, image_url]
        );
        res.status(200).json({ message: "Promoción guardada correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al guardar promo" });
    }
});

// 6. Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ error: "Usuario no registrado." });
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: "Credenciales inválidas." });
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '24h' });
        res.json({ message: "Login exitoso", token, role: user.role });
    } catch (error) {
        console.error("❌ Error en Login:", error);
        res.status(500).json({ error: "Error interno." });
    }
});

// Ruta para registrar usuarios nuevos
app.post('/api/registro', async (req, res) => {
    const { name, email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son obligatorios" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // CORRECCIÓN: Usamos 'username' que es el nombre de tu columna en MySQL
        await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [name || 'Nuevo Usuario', email, hashedPassword, 'user']
        );
        
        res.json({ success: true, message: "Usuario creado" });
    } catch (error) {
        console.error("❌ ERROR EN REGISTRO:", error); 
        res.status(500).json({ error: "El email ya existe o error en la base de datos." });
    }
});

// RUTA PERFIL USUARIO
app.get('/api/usuario/perfil', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No autorizado" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        const [rows] = await pool.query(
            'SELECT username, email, full_name, dni, address, phone, postal_code, city, province, avatar_url FROM users WHERE id = ?', 
            [decoded.id]
        );
        res.json(rows[0]);
    } catch (error) {
        res.status(401).json({ error: "Sesión inválida" });
    }
});

// RUTA ACTUALIZAR PERFIL USUARIO
app.post('/api/usuario/actualizar', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { full_name, dni, username, email, phone, address, postal_code, city, province, password, avatar_url } = req.body;

    if (!token) return res.status(401).json({ error: "No autorizado" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');

        let updateFields = [];
        let updateValues = [];

        if (full_name !== undefined) { updateFields.push('full_name = ?'); updateValues.push(full_name); }
        if (dni !== undefined) { updateFields.push('dni = ?'); updateValues.push(dni); }
        if (username !== undefined) { updateFields.push('username = ?'); updateValues.push(username); }
        if (email !== undefined) { updateFields.push('email = ?'); updateValues.push(email); }
        if (phone !== undefined) { updateFields.push('phone = ?'); updateValues.push(phone); }
        if (address !== undefined) { updateFields.push('address = ?'); updateValues.push(address); }
        if (postal_code !== undefined) { updateFields.push('postal_code = ?'); updateValues.push(postal_code); }
        if (city !== undefined) { updateFields.push('city = ?'); updateValues.push(city); }
        if (province !== undefined) { updateFields.push('province = ?'); updateValues.push(province); }
        if (avatar_url !== undefined) { updateFields.push('avatar_url = ?'); updateValues.push(avatar_url); }

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateFields.push('password = ?');
            updateValues.push(hashedPassword);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: "No hay campos para actualizar" });
        }

        updateValues.push(decoded.id);

        const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

        await pool.query(query, updateValues);
        res.json({ success: true, message: "Datos actualizados correctamente" });
    } catch (error) {
        console.error("Error al actualizar:", error);
        res.status(500).json({ error: "Error al actualizar la base de datos" });
    }
});

// NUEVA RUTA: SUBIR FOTO DE PERFIL (AVATAR)
app.post('/api/usuario/upload-avatar', upload.single('avatar'), async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: "No autorizado" });
    if (!req.file) return res.status(400).json({ error: "No se subió ninguna imagen" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        
        // Creamos la URL pública de la imagen
        const avatarUrl = `/uploads/${req.file.filename}`;

        // Guardamos la URL en la base de datos
        await pool.query(
            'UPDATE users SET avatar_url = ? WHERE id = ?',
            [avatarUrl, decoded.id]
        );

        res.json({ success: true, avatarUrl });
    } catch (error) {
        console.error("❌ Error al subir avatar:", error);
        res.status(500).json({ error: "Error interno del servidor al procesar la imagen" });
    }
});

// RUTA PARA RECUPERAR CONTRASEÑA (ENVIAR EMAIL)
app.post('/api/usuario/recuperar-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        // 1. Verificar si el usuario existe
        const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, error: "El correo no está registrado" });
        }

        // 2. Generar código de 6 dígitos
        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 3. Definir expiración (Ejemplo: en 15 minutos)
        const expiracion = new Date();
        expiracion.setMinutes(expiracion.getMinutes() + 15);

        // 4. Guardar en la nueva tabla password_resets
        // Primero borramos si había algún pedido viejo de este mismo mail para no acumular basura
        await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);
        
        await pool.query(
            'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
            [email, codigo, expiracion]
        );

        // 5. Enviar el Mail
        const mailOptions = {
            from: '"Urban Kicks 👟" <soporte@urbankicks.com.ar>',
            to: email,
            subject: 'Código de Recuperación - Urban Kicks',
            html: `
                <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #ff4d4d;">Recuperación de Contraseña</h2>
                    <p>Hola, has solicitado restablecer tu contraseña en <b>Urban Kicks</b>.</p>
                    <p>Tu código de verificación es:</p>
                    <div style="background: #f4f4f4; padding: 10px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px;">
                        ${codigo}
                    </div>
                    <p>Este código expirará en 15 minutos.</p>
                    <p>Si no solicitaste esto, puedes ignorar este correo.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Código enviado con éxito" });

    } catch (error) {
        console.error("Error en recuperación:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
});

// RUTA RESTABLECER CONTRASEÑA CON CÓDIGO
app.post('/api/usuario/restablecer-password', async (req, res) => {
    const { email, codigo, nuevaPassword } = req.body;

    try {
        // 1. Verificar si el código existe y no expiró
        const [rows] = await pool.query(
            'SELECT * FROM password_resets WHERE email = ? AND token = ? AND expires_at > NOW()',
            [email, codigo]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, error: "Código inválido o expirado." });
        }

        // 2. Encriptar la nueva contraseña
        const hashedPassword = await bcrypt.hash(nuevaPassword, 10);

        // 3. Actualizar la contraseña del usuario
        await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        // 4. Borrar el código usado para que no se use de nuevo
        await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);

        res.json({ success: true, message: "Contraseña actualizada correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Error al restablecer la contraseña" });
    }
});

app.use((req, res) => {
    res.status(404).send("Lo sentimos, no encontramos lo que buscas.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Urban Kicks encendido en puerto ${PORT}`);
});