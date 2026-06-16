const archSvc = require('../lib/archive');

const args = process.argv.slice(2);

function printUsage() {
  console.error('用法:');
  console.error('  node scripts/export-log.js <文档ID> [--csv] [--action <动作>] [--operator <操作人>] [--status <状态>]');
  console.error('');
  console.error('选项:');
  console.error('  --csv          导出 CSV 格式（默认 JSON）');
  console.error('  --action       按动作筛选: import, submit, publish, withdraw, draft_save, draft_delete');
  console.error('  --operator     按操作人筛选');
  console.error('  --status       按状态筛选: submitted, published, withdrawn, draft');
  console.error('');
  console.error('示例:');
  console.error('  node scripts/export-log.js <docId> --csv --operator 张编辑');
  console.error('  node scripts/export-log.js <docId> --status draft');
}

if (args.length < 1 || args[0] === '--help' || args[0] === '-h') {
  printUsage();
  process.exit(args[0] ? 0 : 1);
}

const docId = args[0];
const filters = {};
let format = 'json';

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--csv') {
    format = 'csv';
  } else if (args[i] === '--action' && args[i + 1]) {
    filters.action = args[i + 1];
    i++;
  } else if (args[i] === '--operator' && args[i + 1]) {
    filters.operator = args[i + 1];
    i++;
  } else if (args[i] === '--status' && args[i + 1]) {
    filters.status = args[i + 1];
    i++;
  }
}

if (format === 'csv') {
  const csv = archSvc.exportRevisionLogCSV(docId, filters);
  console.log(csv);
  const lines = csv.split('\n').filter(l => l.trim() !== '');
  console.error(`\n共导出 ${lines.length - 1} 条修订日志（CSV 格式）`);
} else {
  const logs = archSvc.exportRevisionLog(docId, filters);
  console.log(JSON.stringify(logs, null, 2));
  console.error(`\n共导出 ${logs.length} 条修订日志`);
}

