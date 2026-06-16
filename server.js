const express = require('express');
const path = require('path');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3200;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`制度文档修订对比与发布台已启动: http://localhost:${PORT}`);
  });
}

module.exports = app;
