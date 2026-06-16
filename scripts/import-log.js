const fs = require('fs');
const path = require('path');
const auditSvc = require('../lib/audit-playback');

const args = process.argv.slice(2);

function printUsage() {
  console.error('用法:');
  console.error('  node scripts/import-log.js <日志JSON文件路径> <操作者> [--source <来源>] [--notes <备注>] [--strategy <冲突策略>]');
  console.error('');
  console.error('参数:');
  console.error('  日志JSON文件路径     导出的修订日志 JSON 文件（数组或含 revisionLogs 的对象）');
  console.error('  操作者               执行导入的操作人姓名（必填，用于审计和权限校验）');
  console.error('');
  console.error('选项:');
  console.error('  --source             导入来源说明，如"导出备份2024-01-01"');
  console.error('  --notes              导入备注');
  console.error('  --strategy           冲突处理策略: skip | overwrite | force_new_id（仅审批员可用）');
  console.error('  --list               查看所有导入批次（不需要文件参数）');
  console.error('  --playback <批次ID>  按批次执行审计回放（需要操作者是审批员）');
  console.error('');
  console.error('示例:');
  console.error('  node scripts/import-log.js logs.json 张编辑 --source "备份恢复"');
  console.error('  node scripts/import-log.js logs.json 李审批 --strategy overwrite');
  console.error('  node scripts/import-log.js --list');
  console.error('  node scripts/import-log.js --playback <batchId> 李审批');
}

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

if (args.includes('--list')) {
  const batches = auditSvc.getImportedBatches();
  if (batches.length === 0) {
    console.log('暂无导入批次');
  } else {
    console.log(`\n共 ${batches.length} 个导入批次:\n`);
    batches.forEach(b => {
      console.log(`  批次: ${b.importBatchId}`);
      console.log(`    导入时间: ${b.importedAt}`);
      console.log(`    操作人: ${b.importedBy}`);
      console.log(`    总计: ${b.totalCount} | 成功: ${b.insertedCount} | 冲突: ${b.conflictCount} | 无效: ${b.invalidCount}`);
      if (b.source) console.log(`    来源: ${b.source}`);
      if (b.conflictCount > 0) console.log(`    ⚠ 有 ${b.conflictCount} 条冲突记录`);
      console.log('');
    });
  }
  process.exit(0);
}

const playbackIdx = args.indexOf('--playback');
if (playbackIdx >= 0) {
  const batchId = args[playbackIdx + 1];
  const operator = args[playbackIdx + 2];
  if (!batchId || !operator) {
    console.error('错误: --playback 需要批次ID和操作人');
    process.exit(1);
  }
  const batch = auditSvc.getImportedBatch(batchId);
  if (!batch) {
    console.error('错误: 导入批次不存在');
    process.exit(1);
  }
  const logs = auditSvc.getImportedLogsByBatch(batchId);
  const logIds = logs.map(l => l.id);
  const result = auditSvc.playbackRevisionLogs(logIds, operator, { notes: '命令行回放', mode: 'cli' });
  if (result.error) {
    console.error('回放失败:', result.message || result.error);
    process.exit(1);
  }
  console.log('\n===== 审计回放结果 =====');
  console.log(`记录ID: ${result.recordId}`);
  console.log(`回放时间: ${result.playbackAt}`);
  console.log(`回放日志: ${result.logCount} 条，缺失: ${result.missingCount} 条`);
  if (result.summary) {
    console.log('动作分布:', JSON.stringify(result.summary.actionBreakdown, null, 2));
    console.log('操作人分布:', JSON.stringify(result.summary.operatorBreakdown, null, 2));
  }
  const snapItems = (result.items || []).filter(i => i.snapshotId);
  if (snapItems.length > 0) {
    console.log('\n快照权限验证:');
    snapItems.slice(0, 5).forEach(i => {
      console.log(`  快照${i.snapshotId.slice(0, 8)}...: ${i.snapshotAccessible ? '✅ 已授权' : '⛔ 已拦截（非草稿owner）'}`);
    });
  }
  process.exit(0);
}

const filePath = args[0];
const operator = args[1];

if (!filePath || !operator) {
  console.error('错误: 必须指定日志文件路径和操作人');
  printUsage();
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error('错误: 文件不存在:', filePath);
  process.exit(1);
}

let logs = [];
try {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    logs = parsed;
  } else if (parsed && parsed.revisionLogs && Array.isArray(parsed.revisionLogs)) {
    logs = parsed.revisionLogs;
  } else if (parsed && parsed.logs && Array.isArray(parsed.logs)) {
    logs = parsed.logs;
  } else {
    console.error('错误: 无法识别日志数组结构');
    process.exit(1);
  }
} catch (e) {
  console.error('错误: 读取或解析文件失败:', e.message);
  process.exit(1);
}

const options = {};
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--source' && args[i + 1]) { options.source = args[i + 1]; i++; }
  else if (args[i] === '--notes' && args[i + 1]) { options.notes = args[i + 1]; i++; }
}

console.log(`解析到 ${logs.length} 条日志，开始导入...`);

const result = auditSvc.importRevisionLogs(logs, operator, options);
if (result.error) {
  console.error('导入失败:', result.message || result.error);
  process.exit(1);
}

console.log('\n===== 导入完成 =====');
console.log(`批次ID: ${result.batchId}`);
console.log(`导入时间: ${result.importedAt}`);
console.log(`总计: ${result.totalCount} | 有效: ${result.validCount} | 无效: ${result.invalidCount}`);
console.log(`✅ 成功导入: ${result.insertedCount} 条`);
console.log(`⚠ 冲突跳过: ${result.conflictCount} 条`);

if (result.invalidLogs && result.invalidLogs.length > 0) {
  console.log('\n无效日志:');
  result.invalidLogs.slice(0, 5).forEach(l => {
    console.log(`  第 ${l.index} 条: ${l.reason}`);
  });
}

if (result.conflictCount > 0) {
  console.log('\n冲突日志（前5条）:');
  result.conflicts.slice(0, 5).forEach(c => {
    console.log(`  ${c.logId.slice(0, 8)}...: ${c.reason}`);
  });
  const stratIdx = args.indexOf('--strategy');
  if (stratIdx >= 0) {
    const strategy = args[stratIdx + 1];
    console.log(`\n使用策略 ${strategy} 重新处理冲突...`);
    const re = auditSvc.reimportWithStrategy(result.batchId, strategy, operator);
    if (re.error) {
      console.error('重导入失败:', re.message || re.error);
    } else {
      console.log('重导入结果:', re.message);
      console.log(`  处理: ${re.processed} | 跳过: ${re.skipped} | 覆盖: ${re.overwritten} | 新ID插入: ${re.newIds ? re.newIds.length : 0}`);
    }
  } else {
    console.log('\n提示: 如需处理冲突，重新执行加上 --strategy overwrite 或 --strategy force_new_id');
  }
}

if (result.warnings && result.warnings.length > 0) {
  console.log('\n警告:');
  result.warnings.forEach(w => console.log('  ' + w));
}
