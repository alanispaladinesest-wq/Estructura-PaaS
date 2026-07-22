const express = require('express');
const mysql = require('mysql2');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Hardening de seguridad en Node.js (remueve X-Powered-By y añade cabeceras seguras)
app.use(helmet());
app.use(express.json());
app.use(express.static(__dirname));

// Configuración de la base de datos mediante Variables de Entorno (PaaS)
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vulncheck_db',
  port: process.env.DB_PORT || 3306
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint de prueba de conexión a la BD
app.get('/api/status', (req, res) => {
  db.ping((err) => {
    if (err) {
      return res.status(500).json({ status: 'Error', message: 'No hay conexión con la BD en PaaS' });
    }
    res.json({ status: 'OK', message: 'Conectado exitosamente a la BD gestionada' });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor PaaS corriendo en el puerto ${PORT}`);
});