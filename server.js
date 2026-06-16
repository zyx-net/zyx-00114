const express = require('express');
const path = require('path');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3200;

app.use((req, res, next) => {
  if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch (e) {
        req.body = {};
      }
      next();
    });
  } else {
    req.body = req.body || {};
    next();
  }
});
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`制度文档修订对比与发布台已启动: http://localhost:${PORT}`);
  });
}

module.exports = app;
