const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();

// Configuración de Helmet para permitir scripts e imágenes inline
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

// Limitador de peticiones para prevenir fuerza bruta
const limonadorPeticiones = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: 429, message: 'Demasiadas solicitudes. Intenta en 15 minutos.' }
});

app.use('/api/', limonadorPeticiones);

app.use(express.json());
app.use(express.static(__dirname));

// Conexión a Clever Cloud MySQL
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

    // Tabla de clientes
    const createClientes = `
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    db.query(createClientes);

    // Tabla de productos
    const createProductos = `
      CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        precio DECIMAL(10,2) NOT NULL,
        stock INT NOT NULL,
        imagen_url TEXT
      );
    `;
    db.query(createProductos, (pErr) => {
      if (!pErr) {
        // Insertar productos por defecto si la tabla está vacía
        db.query('SELECT COUNT(*) as count FROM productos', (err, rows) => {
          if (rows && rows[0].count === 0) {
            const seedQuery = `
              INSERT INTO productos (nombre, precio, stock, imagen_url) VALUES 
              ('Laptop Gamer', 1200.00, 10, 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=500'),
              ('Audífonos Pro', 150.00, 20, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500');
            `;
            db.query(seedQuery);
          }
        });
      }
    });
  }
});

// Servir frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Obtener productos
app.get('/api/productos', (req, res) => {
  db.query('SELECT * FROM productos', (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al consultar productos' });
    res.json(results);
  });
});

// API: Registrar cliente con Bcrypt
app.post('/api/registro', async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos incompletos' });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    db.query('INSERT INTO clientes (nombre, email, password_hash) VALUES (?, ?, ?)', 
      [nombre, email, passwordHash], 
      (err) => {
        if (err) return res.status(500).json({ error: 'El correo ya existe o hubo un error' });
        res.json({ mensaje: 'Usuario registrado de forma segura' });
      }
    );
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
});

// API: Comprar producto (Descuenta Stock)
app.post('/api/comprar', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'ID de producto no enviado' });

  db.query('SELECT stock FROM productos WHERE id = ?', [id], (err, results) => {
    if (err || results.length === 0) return res.status(400).json({ error: 'Producto no encontrado' });
    if (results[0].stock <= 0) return res.status(400).json({ error: 'Producto agotado' });

    db.query('UPDATE productos SET stock = stock - 1 WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: 'Error al procesar compra' });
      res.json({ mensaje: 'Compra realizada con éxito' });
    });
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor de Tienda Segura PaaS activo en puerto ${PORT}`);
});