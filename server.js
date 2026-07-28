const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'students.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// Arabic search normalization helper
function normalizeArabic(text) {
  if (!text) return '';
  return text
    .trim()
    .replace(/[أإآآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u0652]/g, ''); // Remove tashkeel
}

// API: Search students by seating_no or arabic_name
app.get('/api/search', (req, res) => {
  try {
    const database = getDb();
    const queryStr = (req.query.q || '').trim();
    const searchType = req.query.type || 'seat'; // 'seat' or 'name'
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    if (!queryStr) {
      return res.json({ success: true, data: [], total: 0, page, totalPages: 0 });
    }

    if (searchType === 'seat') {
      const seatNum = parseInt(queryStr, 10);
      if (isNaN(seatNum)) {
        return res.json({ success: true, data: [], total: 0, page, totalPages: 0 });
      }

      // Check exact seating number first, or seating number starting with prefix
      const countStmt = database.prepare("SELECT COUNT(*) AS total FROM students WHERE seating_no = ? OR seating_no LIKE ?");
      const countRes = countStmt.get(seatNum, `${queryStr}%`);
      const total = countRes ? countRes.total : 0;

      const dataStmt = database.prepare(`
        SELECT seating_no, arabic_name, total_degree, student_case_desc
        FROM students
        WHERE seating_no = ? OR seating_no LIKE ?
        ORDER BY CASE WHEN seating_no = ? THEN 0 ELSE 1 END, seating_no ASC
        LIMIT ? OFFSET ?
      `);
      const rows = dataStmt.all(seatNum, `${queryStr}%`, seatNum, limit, offset);

      return res.json({
        success: true,
        data: rows,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });

    } else {
      // Search by Name
      const words = queryStr.split(/\s+/).filter(w => w.length > 0);
      
      if (words.length === 0) {
        return res.json({ success: true, data: [], total: 0, page, totalPages: 0 });
      }

      // Build dynamic SQL for multiple name parts
      const conditions = words.map(() => `arabic_name LIKE ?`).join(' AND ');
      const params = words.map(w => `%${w}%`);

      const countStmt = database.prepare(`SELECT COUNT(*) AS total FROM students WHERE ${conditions}`);
      const countRes = countStmt.get(...params);
      const total = countRes ? countRes.total : 0;

      const dataStmt = database.prepare(`
        SELECT seating_no, arabic_name, total_degree, student_case_desc
        FROM students
        WHERE ${conditions}
        ORDER BY seating_no ASC
        LIMIT ? OFFSET ?
      `);

      const rows = dataStmt.all(...params, limit, offset);

      return res.json({
        success: true,
        data: rows,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    }

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Database search error: ' + error.message });
  }
});

// API: Dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const database = getDb();
    const totalStmt = database.prepare("SELECT COUNT(*) AS totalCount, MAX(total_degree) as maxDegree, AVG(total_degree) as avgDegree FROM students");
    const stats = totalStmt.get();

    res.json({
      success: true,
      stats: {
        totalStudents: stats.totalCount || 0,
        maxDegree: stats.maxDegree || 0,
        avgDegree: stats.avgDegree ? stats.avgDegree.toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fallback to frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Thanaweya Search server running on http://localhost:${PORT}`);
  console.log(`====================================================`);
});
