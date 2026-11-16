const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database setup ─────────────────────────────────────────────────────────
// If DATABASE_URL is set (Railway PostgreSQL), use pg.
// Otherwise fall back to local JSON file for development.

let db;

if (process.env.DATABASE_URL) {
  // ── PostgreSQL (Railway) ───────────────────────────────────────────────
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Create table if it doesn't exist
  pool.query(`
    CREATE TABLE IF NOT EXISTS potholes (
      id BIGINT PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      description TEXT,
      severity VARCHAR(10),
      reported_at TIMESTAMPTZ
    )
  `).catch(err => console.error('Table creation error:', err));

  db = {
    getAll: async () => {
      const { rows } = await pool.query('SELECT * FROM potholes ORDER BY reported_at DESC');
      return rows.map(r => ({
        id: Number(r.id),
        lat: r.lat,
        lng: r.lng,
        description: r.description,
        severity: r.severity,
        reportedAt: r.reported_at
      }));
    },
    insert: async (entry) => {
      await pool.query(
        'INSERT INTO potholes (id, lat, lng, description, severity, reported_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [entry.id, entry.lat, entry.lng, entry.description, entry.severity, entry.reportedAt]
      );
    },
    delete: async (id) => {
      await pool.query('DELETE FROM potholes WHERE id=$1', [id]);
    }
  };

  console.log('Using PostgreSQL database');

} else {
  // ── JSON file (local dev) ──────────────────────────────────────────────
  const fs = require('fs');
  const DB_FILE = path.join(__dirname, 'potholes.json');
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');

  db = {
    getAll: async () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8')),
    insert: async (entry) => {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      data.push(entry);
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    },
    delete: async (id) => {
      let data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      data = data.filter(p => p.id !== id);
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    }
  };

  console.log('Using local JSON file database');
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET all potholes
app.get('/api/potholes', async (req, res) => {
  try {
    res.json(await db.getAll());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch potholes' });
  }
});

// POST a new pothole
app.post('/api/potholes', async (req, res) => {
  const { lat, lng, description, severity } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  const entry = {
    id: Date.now(),
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    description: description || '',
    severity: severity || 'medium',
    reportedAt: new Date().toISOString()
  };

  try {
    await db.insert(entry);
    res.status(201).json(entry);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save pothole' });
  }
});

// DELETE a pothole
app.delete('/api/potholes/:id', async (req, res) => {
  try {
    await db.delete(parseInt(req.params.id));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete pothole' });
  }
});

app.listen(PORT, () => {
  console.log(`Pothole Portal running at http://localhost:${PORT}`);
});
