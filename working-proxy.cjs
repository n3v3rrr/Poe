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
// working-proxy.cjs
app.use('/api', async (req, res) => {
  const targetUrl = 'https://poe2scout.com' + req.originalUrl;
  console.log(`🔄 Proxying: ${req.method} ${targetUrl}`);
  
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'poe2-quickflip/1.0 (your_email@example.com)' // 🔥 Обязательно!
      },
      signal: AbortSignal.timeout(30000) // 30 сек таймаут
    });

    // 🔥 Читаем как текст СНАЧАЛА, чтобы увидеть реальную ошибку
    const rawText = await response.text();
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status);

    if (!response.ok) {
      console.error(`❌ API Error ${response.status}: ${rawText.substring(0, 300)}`);
      return res.send(rawText); // Отправляем сырой ответ (часто там подробная ошибка)
    }

    // Успех → парсим JSON
    try {
      const data = JSON.parse(rawText);
      console.log(`✅ ${response.status} for ${req.originalUrl}`);
      return res.json(data);
    } catch (parseErr) {
      console.error('❌ JSON parse error:', parseErr.message);
      return res.status(500).json({ error: 'Invalid JSON from upstream', details: parseErr.message });
    }

  } catch (error) {
    console.error(`💥 Proxy Crash: ${error.name} - ${error.message}`);
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'Gateway Timeout', details: 'Upstream API did not respond in time' });
    }
    res.status(502).json({ error: 'Proxy failed', details: error.message });
  }
});

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Запуск сервера
app.listen(PORT, () => {
  console.log(`\n✅ WORKING PROXY on http://localhost:${PORT}`);
  console.log(`📡 Test API: http://localhost:${PORT}/api/poe2/Leagues\n`);
});