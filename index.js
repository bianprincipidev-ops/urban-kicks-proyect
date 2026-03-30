const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt'); // FALTA ESTE
const jwt = require('jsonwebtoken'); // FALTA ESTE
require('dotenv').config();

const app = express();

// --- CONFIGURACIONES ---

app.use(express.json()); 

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const uploadDir = path.join(__dirname, 'frontend/uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage });

// --- RUTAS ---

// Subir producto
app.post('/api/productos/nuevo', upload.single('imagen'), async (req, res) => {
    const { name, description, price, category_id } = req.body;
    const image_url = `/uploads/${req.file.filename}`;
    try {
        await pool.query(
            'INSERT INTO products (name, description, price, image_url, category_id) VALUES (?, ?, ?, ?, ?)',
            [name, description, price, image_url, category_id]
        );
        res.json({ message: "Producto cargado con éxito", image: image_url });
    } catch (error) {
        res.status(500).json({ error: "Error al guardar el producto" });
    }
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'frontend')));

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ? ', [email]);
        if (users.length === 0) return res.status(404).json({ error: "Usuario no encontrado." });

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: "Contraseña incorrecta." });

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ message: "Bienvenido", token, role: user.role });
    } catch (error) {
        res.status(500).json({ error: "Error en el inicio de sesión." });
    }
});

// Obtener productos
app.get('/api/productos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        res.json(rows);
    } catch (error) {
        console.error("Error en la base de datos:", error);
        res.status(500).json({ error: 'No se pudieron cargar los productos' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Urban Kicks encendido en el puerto ${PORT}`);
});