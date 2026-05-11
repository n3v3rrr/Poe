const express = require('express');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

// ✅ Убираем /api из target, так как запросы уже содержат /api
const TARGET = 'https://poe2scout.com';
const PORT = process.env.PORT || 8787;

const app = express();
app.use(morgan('dev'));

// ✅ Прокси должен быть ПЕРЕД статическими файлами
app.use('/api', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  logger: console,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`🔄 ${req.method} ${req.url} -> ${TARGET}${req.url}`);
  },
  onError: (err, req, res) => {
    console.error(`❌ Proxy Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}));

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Для всех остальных запросов - отдаем index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Proxy running on http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/poe2/Leagues`);
});