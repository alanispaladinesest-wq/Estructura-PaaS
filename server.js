const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();

// Configuración de Helmet ajustada para permitir scripts e imágenes inline
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      },
    },
  })
);

app.use(cors());

// Limitador de peticiones para prevenir ataques de fuerza bruta
const limonadorPeticiones = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Límite de 100 solicitudes por IP
  message: { status: 429, message: 'Demasiadas solicitudes. Intenta en 15 minutos.' }
});

app.use('/api/', limonadorPeticiones);

app.use(express.json());
app.use(express.static(__dirname));

// Conexión a la base de datos Clever Cloud usando variables de entorno
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306
});

db.connect((err) => {
  if (err) {
    console.error('Error al conectar a Clever Cloud MySQL:', err);
  } else {
    console.log('Conexión exitosa a la base de datos en Clever Cloud');

    // Crear la tabla de clientes automáticamente si no existe
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    db.query(createTableQuery, (tableErr) => {
      if (tableErr) {
        console.error('Error al verificar/crear tabla clientes:', tableErr);
      } else {
        console.log('Tabla "clientes" lista en Clever Cloud.');
      }
    });
  }
});

// Ruta principal para servir la página de la tienda
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Obtener productos
app.get('/api/productos', (req, res) => {
  const query = 'SELECT * FROM productos';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error al consultar productos:', err);
      return res.status(500).json({ error: 'Error en el servidor al obtener productos' });
    }
    res.json(results);
  });
});

// API: Registrar cliente con contraseña encriptada (Bcrypt)
app.post('/api/registro', async (req, res) => {
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const query = 'INSERT INTO clientes (nombre, email, password_hash) VALUES (?, ?, ?)';
    db.query(query, [nombre, email, passwordHash], (err, result) => {
      if (err) {
        console.error('Error al registrar usuario:', err);
        return res.status(500).json({ error: 'Error al registrar el cliente (posible email duplicado)' });
      }
      res.json({ mensaje: 'Usuario registrado de forma segura' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar la contraseña' });
  }
});

// API: Comprar producto (Reduce el stock)
app.post('/api/comprar', (req, res) => {
  const { id } = req.body;

  const queryCheck = 'SELECT stock FROM productos WHERE id = ?';
  db.query(queryCheck, [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(400).json({ error: 'Producto no encontrado' });
    }

    if (results[0].stock <= 0) {
      return res.status(400).json({ error: 'Producto agotado' });
    }

    const queryUpdate = 'UPDATE productos SET stock = stock - 1 WHERE id = ?';
    db.query(queryUpdate, [id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Error al realizar la compra' });
      }
      res.json({ mensaje: 'Compra realizada con éxito' });
    });
  });
});

// Puerto de ejecución del servidor PaaS
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor de Tienda Segura PaaS activo en puerto ${PORT}`);
});