const archSvc = require('../lib/archive');

const docId = process.argv[2];
if (!docId) {
  console.error('用法: node scripts/export-log.js <文档ID>');
  process.exit(1);
}

const logs = archSvc.exportRevisionLog(docId);
console.log(JSON.stringify(logs, null, 2));
console.error(`\n共导出 ${logs.length} 条修订日志`);
