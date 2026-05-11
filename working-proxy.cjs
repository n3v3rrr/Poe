const express = require('express');
const path = require('path');
const app = express();
const PORT = 8787;

// Логируем все запросы
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ✅ Прокси для API - ДО статических файлов
app.use('/api', async (req, res) => {
  // Полный URL для API
  const targetUrl = 'https://poe2scout.com' + req.originalUrl;
  console.log(`🔄 Proxying to: ${targetUrl}`);
  
  try {
    // Используем fetch (Node.js 18+)
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'poe2-quickflip/1.0'
      }
    });
    
    const data = await response.json();
    
    // Добавляем CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).json(data);
    
    console.log(`✅ Response: ${response.status} for ${req.originalUrl}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Запуск сервера
app.listen(PORT, () => {
  console.log(`\n✅ WORKING PROXY on http://localhost:${PORT}`);
  console.log(`📡 Test API: http://localhost:${PORT}/api/poe2/Leagues\n`);
});