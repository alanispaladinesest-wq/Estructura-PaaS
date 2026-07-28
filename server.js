const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();

app.use(helmet());
app.use(cors());

const limonadorPeticiones = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: 429, message: 'Demasiadas solicitudes. Intenta en 15 minutos.' }
});
app.use('/api/', limonadorPeticiones);

app.use(express.json());
app.use(express.static(__dirname));

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

app.get('/api/productos', (req, res) => {
  db.query('SELECT id, nombre, precio, stock, imagen_url FROM productos', (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al consultar catálogo' });
    res.json(results);
  });
});

app.post('/api/registro', async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Campos incompletos' });

  try {
    const passwordCifrada = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)';
    db.query(sql, [nombre, email, passwordCifrada], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El correo ya está registrado' });
        return res.status(500).json({ message: 'Error interno del servidor' });
      }
      res.json({ status: 'OK', message: 'Usuario registrado de forma segura' });
    });
  } catch (e) {
    res.status(500).json({ message: 'Error procesando datos de seguridad' });
  }
});

app.post('/api/comprar', (req, res) => {
  const { usuario_id, producto_id, precio } = req.body;
  const sqlPedido = 'INSERT INTO pedidos (usuario_id, total) VALUES (?, ?)';
  db.query(sqlPedido, [usuario_id || 1, precio], (err, result) => {
    if (err) return res.status(500).json({ message: 'Error al procesar pedido' });
    db.query('UPDATE productos SET stock = stock - 1 WHERE id = ? AND stock > 0', [producto_id]);
    res.json({ message: '¡Compra completada con éxito!', pedidoId: result.insertId });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Tienda Segura PaaS activo en puerto ${PORT}`);
});