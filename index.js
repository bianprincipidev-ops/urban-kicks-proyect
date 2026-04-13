const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// --- CONFIGURACIONES ---
app.use(express.json()); 

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

app.use((req, res) => {
    res.status(404).send("Lo sentimos, no encontramos lo que buscas.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Urban Kicks encendido en puerto ${PORT}`);
});