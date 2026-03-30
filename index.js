const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();

const app = express();

// Conexión a la base de datos usando las variables que cargamos en Hostinger
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// Esto sirve para que tu HTML y CSS (que están en la carpeta frontend) se vean en la web
app.use(express.static(path.join(__dirname, 'frontend')));

// RUTA API: Esta es la que va a buscar los productos para el frontend
app.get('/api/productos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        res.json(rows);
    } catch (error) {
        console.error("Error en la base de datos:", error);
        res.status(500).json({ error: 'No se pudieron cargar los productos' });
    }
});

// El puerto lo da Hostinger automáticamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Urban Kicks encendido en el puerto ${PORT}`);
});