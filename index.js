const express = require('express');
const mysql = require('mysql2/promise'); // Necesitas instalar mysql2
const path = require('path');
require('dotenv').config();

const app = express();

// Configuración de la conexión a la base de datos
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// Middleware para servir los archivos del frontend (las fotos, css, etc)
app.use(express.static(path.join(__dirname, 'frontend')));

// RUTA PARA OBTENER LOS PRODUCTOS
app.get('/api/productos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Urban Kicks marchando en puerto ${PORT}`);
});