// CommonJS Local CORS proxy for poe2scout.com/api
// Run: npm install && node proxy.cjs (default: http://localhost:8787/api)

const express = require('express');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const TARGET = 'https://poe2scout.com/api';
const PORT = process.env.PORT || 8787;

const app = express();
app.use(morgan('dev'));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Proxy /api/* -> poe2scout.com/api/*
app.use('/api', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // remove /api prefix when forwarding to target if target expects it directly?
                 // Wait, the original code appended /api to TARGET + req.url.
                 // TARGET is https://poe2scout.com/api
                 // so /api/foo -> https://poe2scout.com/api/api/foo ?
                 // No, original code: const url = TARGET + req.url;
                 // req.url includes /api. e.g. /api/items...
                 // so url = https://poe2scout.com/api/api/items...
                 // Let's check original proxy.
  },
  onProxyRes: function (proxyRes, req, res) {
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
  }
}));

// Original logic check:
// app.use('/api', async (req, res) => {
//   const url = TARGET + req.url;
//   ...
// TARGET = 'https://poe2scout.com/api';
// So if I request /api/currency/currency, req.url is /currency/currency (because app.use('/api', ...))?
// Express `app.use('/path', callback)` strips the prefix from req.url in the callback.
// So if I request /api/foo, req.url is /foo.
// So original code: url = 'https://poe2scout.com/api' + '/foo' = 'https://poe2scout.com/api/foo'.
// Correct.

// Now with http-proxy-middleware:
// app.use('/api', createProxyMiddleware({...}))
// If I request /api/foo, the middleware receives it.
// I want to proxy to https://poe2scout.com/api/foo
// target: 'https://poe2scout.com/api'
// If I don't use pathRewrite, it appends req.url (which is /foo relative to the mount point? or full path?)
// http-proxy-middleware behavior depends.
// If mounted at /api, req.url passed to middleware is /foo (in express).
// So target + req.url = https://poe2scout.com/api/foo.
// So I don't need pathRewrite if I set target to https://poe2scout.com/api.

// Let's verify this assumption.
// But wait, express behavior on sub-app mounting strips the path.
// If I use `app.use('/api', createProxyMiddleware({ target: 'https://poe2scout.com/api' }))`
// When I request `/api/foo`, express strips `/api`, `req.url` becomes `/foo`.
// The middleware sees `/foo`. It proxies to `target` + `/foo` => `https://poe2scout.com/api/foo`.
// This seems correct matching the original behavior.

app.listen(PORT, () => console.log(`Local CORS proxy on http://localhost:${PORT}/ (API at /api)`));
