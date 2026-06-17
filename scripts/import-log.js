const fs = require('fs');
const path = require('path');
const auditSvc = require('../lib/audit-playback');
const batchSvc = require('../lib/batch-trace');
const vaultSvc = require('../lib/playback-vault');

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
  console.error('  --batch-list         查看所有批次追溯批次（importBatches）');
  console.error('  --batch-detail <ID>  查看批次追溯详情');
  console.error('  --export-audit <ID>  导出批次审计摘要');
  console.error('  --duplicate-check    检查文件是否与已有批次重复（需搭配文件参数）');
  console.error('  --conflict-strategy  批次导入冲突策略: reject | skip | merge');
  console.error('');
  console.error('===== 回放授权保险箱 =====');
  console.error('  --vault-create <batchId> <operator>       创建保险箱批次（仅审批员）');
  console.error('  --vault-list                              查看所有保险箱批次');
  console.error('  --vault-detail <vaultBatchId> <viewer>    查看保险箱批次详情');
  console.error('  --vault-logs <vaultBatchId> <viewer>      查看保险箱批次日志');
  console.error('  --vault-playbacks <vaultBatchId> <viewer> 查看保险箱批次回放记录');
  console.error('  --vault-playback <vaultBatchId> <operator> 执行保险箱批次回放');
  console.error('  --vault-notes <vaultBatchId> <viewer>     查看保险箱备注');
  console.error('  --vault-update-notes <vaultBatchId> <operator> <notes> 更新保险箱备注');
  console.error('  --vault-trail <vaultBatchId> <viewer>     查看保险箱操作轨迹');
  console.error('  --vault-export <vaultBatchId> <viewer>    导出保险箱审计包');
  console.error('  --vault-import <packageFile> <operator>   导入保险箱审计包');
  console.error('  --vault-import-list                       查看所有导入/导出的审计包');
  console.error('');
  console.error('示例:');
  console.error('  node scripts/import-log.js logs.json 张编辑 --source "备份恢复"');
  console.error('  node scripts/import-log.js logs.json 李审批 --strategy overwrite');
  console.error('  node scripts/import-log.js --list');
  console.error('  node scripts/import-log.js --playback <batchId> 李审批');
  console.error('  node scripts/import-log.js --batch-list');
  console.error('  node scripts/import-log.js --batch-detail <batchId>');
  console.error('  node scripts/import-log.js --export-audit <batchId>');
  console.error('  node scripts/import-log.js --vault-create <batchId> 李审批 --notes "审计专用"');
  console.error('  node scripts/import-log.js --vault-detail <vaultBatchId> 李审批');
  console.error('  node scripts/import-log.js --vault-export <vaultBatchId> 李审批 > audit-package.json');
  console.error('  node scripts/import-log.js --vault-import audit-package.json 李审批');
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

if (args.includes('--batch-list')) {
  const batches = batchSvc.getBatches();
  if (batches.length === 0) {
    console.log('暂无批次追溯记录');
  } else {
    console.log(`\n共 ${batches.length} 个批次追溯记录:\n`);
    batches.forEach(b => {
      console.log(`  批次: ${b.batchId}`);
      console.log(`    导入时间: ${b.importedAt}`);
      console.log(`    操作人: ${b.importedBy}`);
      console.log(`    总计: ${b.recordCount} | 成功: ${b.insertedCount} | 冲突: ${b.conflictCount} | 无效: ${b.invalidCount}`);
      console.log(`    来源: ${b.sourceFile || '-'}`);
      console.log(`    指纹: ${b.contentFingerprint || '-'}`);
      if (b.conflictCount > 0) console.log(`    ⚠ 有 ${b.conflictCount} 条冲突记录`);
      if (b.mergedFrom) console.log(`    合并自: ${b.mergedFrom}`);
      console.log('');
    });
  }
  process.exit(0);
}

const batchDetailIdx = args.indexOf('--batch-detail');
if (batchDetailIdx >= 0) {
  const batchId = args[batchDetailIdx + 1];
  if (!batchId) {
    console.error('错误: --batch-detail 需要批次ID');
    process.exit(1);
  }
  const batch = batchSvc.getBatch(batchId, null);
  if (!batch) {
    console.error('错误: 批次不存在');
    process.exit(1);
  }
  console.log('\n===== 批次详情 =====');
  console.log(JSON.stringify(batch, null, 2));
  process.exit(0);
}

const exportAuditIdx = args.indexOf('--export-audit');
if (exportAuditIdx >= 0) {
  const batchId = args[exportAuditIdx + 1];
  const viewer = args[exportAuditIdx + 2];
  if (!batchId || !viewer) {
    console.error('错误: --export-audit 需要批次ID和操作人');
    process.exit(1);
  }
  const summary = batchSvc.exportBatchAuditSummary(batchId, viewer);
  if (summary.error) {
    console.error('导出失败:', summary.message || summary.error);
    process.exit(1);
  }
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const duplicateCheckIdx = args.indexOf('--duplicate-check');
if (duplicateCheckIdx >= 0) {
  const checkFilePath = args[duplicateCheckIdx + 1];
  if (!checkFilePath) {
    console.error('错误: --duplicate-check 需要文件路径');
    process.exit(1);
  }
  if (!fs.existsSync(checkFilePath)) {
    console.error('错误: 文件不存在:', checkFilePath);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(checkFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    let checkLogs = [];
    if (Array.isArray(parsed)) checkLogs = parsed;
    else if (parsed.revisionLogs) checkLogs = parsed.revisionLogs;
    else if (parsed.logs) checkLogs = parsed.logs;
    const sourceDigest = batchSvc.computeSourceDigest(checkLogs);
    const contentFingerprint = batchSvc.computeFingerprint(checkLogs);
    const result = batchSvc.checkDuplicateImport(sourceDigest, contentFingerprint);
    if (result.isDuplicate) {
      console.log(`⛔ 检测到重复导入！与批次 ${result.existingBatchId} (导入人: ${result.existingBatchImportedBy}, 时间: ${result.existingBatchImportedAt}) 内容相同`);
    } else {
      console.log('✅ 未检测到重复导入，可以安全导入');
    }
    console.log(`来源摘要: ${sourceDigest}`);
    console.log(`内容指纹: ${contentFingerprint}`);
  } catch (e) {
    console.error('错误: 读取或解析文件失败:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

// ========== 保险箱 CLI 命令 ==========

const vaultCreateIdx = args.indexOf('--vault-create');
if (vaultCreateIdx >= 0) {
  const batchId = args[vaultCreateIdx + 1];
  const operator = args[vaultCreateIdx + 2];
  const notesIdx = args.indexOf('--notes');
  const notes = notesIdx >= 0 ? args[notesIdx + 1] : '';
  if (!batchId || !operator) {
    console.error('错误: --vault-create 需要批次ID和操作人');
    process.exit(1);
  }
  const result = vaultSvc.createVaultBatch(batchId, operator, { notes });
  if (result.error) {
    console.error('创建保险箱批次失败:', result.message || result.error);
    process.exit(1);
  }
  console.log('\n===== 保险箱批次创建成功 =====');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (args.includes('--vault-list')) {
  const batches = vaultSvc.getVaultBatches({}, null);
  if (batches.length === 0) {
    console.log('暂无保险箱批次');
  } else {
    console.log(`\n共 ${batches.length} 个保险箱批次:\n`);
    batches.forEach(b => {
      console.log(`  保险箱批次: ${b.vaultBatchId}`);
      console.log(`    源批次ID: ${b.sourceBatchId}`);
      console.log(`    所有者: ${b.ownerId}`);
      console.log(`    创建时间: ${b.createdAt}`);
      console.log(`    状态: ${b.status}`);
      console.log(`    访问次数: ${b.accessCount} | 回放次数: ${b.playbackCount} | 导出次数: ${b.exportCount}`);
      if (b._redacted) console.log('    ⚠  已脱敏（非所有者/非审批员）');
      console.log('');
    });
  }
  process.exit(0);
}

const vaultDetailIdx = args.indexOf('--vault-detail');
if (vaultDetailIdx >= 0) {
  const vaultBatchId = args[vaultDetailIdx + 1];
  const viewer = args[vaultDetailIdx + 2];
  if (!vaultBatchId || !viewer) {
    console.error('错误: --vault-detail 需要保险箱批次ID和查看人');
    process.exit(1);
  }
  const result = vaultSvc.getVaultBatch(vaultBatchId, viewer);
  if (!result) {
    console.error('错误: 保险箱批次不存在');
    process.exit(1);
  }
  console.log('\n===== 保险箱批次详情 =====');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const vaultLogsIdx = args.indexOf('--vault-logs');
if (vaultLogsIdx >= 0) {
  const vaultBatchId = args[vaultLogsIdx + 1];
  const viewer = args[vaultLogsIdx + 2];
  if (!vaultBatchId || !viewer) {
    console.error('错误: --vault-logs 需要保险箱批次ID和查看人');
    process.exit(1);
  }
  const result = vaultSvc.getVaultLogs(vaultBatchId, viewer);
  if (result.error) {
    console.error('获取日志失败:', result.message || result.error);
    process.exit(1);
  }
  console.log(`\n共 ${result.length} 条日志:\n`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const vaultPlaybacksIdx = args.indexOf('--vault-playbacks');
if (vaultPlaybacksIdx >= 0) {
  const vaultBatchId = args[vaultPlaybacksIdx + 1];
  const viewer = args[vaultPlaybacksIdx + 2];
  if (!vaultBatchId || !viewer) {
    console.error('错误: --vault-playbacks 需要保险箱批次ID和查看人');
    process.exit(1);
  }
  const result = vaultSvc.getVaultPlaybacks(vaultBatchId, viewer);
  if (result.error) {
    console.error('获取回放记录失败:', result.message || result.error);
    process.exit(1);
  }
  console.log(`\n共 ${result.length} 条回放记录:\n`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const vaultPlaybackIdx = args.indexOf('--vault-playback');
if (vaultPlaybackIdx >= 0) {
  const vaultBatchId = args[vaultPlaybackIdx + 1];
  const operator = args[vaultPlaybackIdx + 2];
  const notesIdx = args.indexOf('--notes');
  const notes = notesIdx >= 0 ? args[notesIdx + 1] : '';
  if (!vaultBatchId || !operator) {
    console.error('错误: --vault-playback 需要保险箱批次ID和操作人');
    process.exit(1);
  }
  const result = vaultSvc.playbackVaultBatch(vaultBatchId, operator, { notes });
  if (result.error) {
    console.error('回放失败:', result.message || result.error);
    process.exit(1);
  }
  console.log('\n===== 回放完成 =====');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const vaultNotesIdx = args.indexOf('--vault-notes');
if (vaultNotesIdx >= 0) {
  const vaultBatchId = args[vaultNotesIdx + 1];
  const viewer = args[vaultNotesIdx + 2];
  if (!vaultBatchId || !viewer) {
    console.error('错误: --vault-notes 需要保险箱批次ID和查看人');
    process.exit(1);
  }
  const result = vaultSvc.getVaultNotes(vaultBatchId, viewer);
  if (result.error) {
    console.error('获取备注失败:', result.message || result.error);
    process.exit(1);
  }
  console.log('\n===== 保险箱备注 =====');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const vaultUpdateNotesIdx = args.indexOf('--vault-update-notes');
if (vaultUpdateNotesIdx >= 0) {
  const vaultBatchId = args[vaultUpdateNotesIdx + 1];
  const operator = args[vaultUpdateNotesIdx + 2];
  const notes = args.slice(vaultUpdateNotesIdx + 3).join(' ');
  if (!vaultBatchId || !operator) {
    console.error('错误: --vault-update-notes 需要保险箱批次ID、操作人和备注内容');
    process.exit(1);
  }
  const result = vaultSvc.updateVaultNotes(vaultBatchId, operator, notes);
  if (result.error) {
    console.error('更新备注失败:', result.message || result.error);
    process.exit(1);
  }
  console.log('\n===== 备注更新成功 =====');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const vaultTrailIdx = args.indexOf('--vault-trail');
if (vaultTrailIdx >= 0) {
  const vaultBatchId = args[vaultTrailIdx + 1];
  const viewer = args[vaultTrailIdx + 2];
  if (!vaultBatchId || !viewer) {
    console.error('错误: --vault-trail 需要保险箱批次ID和查看人');
    process.exit(1);
  }
  const result = vaultSvc.getVaultAccessTrail(vaultBatchId, viewer);
  if (result.error) {
    console.error('获取操作轨迹失败:', result.message || result.error);
    process.exit(1);
  }
  console.log('\n===== 保险箱操作轨迹 =====');
  console.log(`访问次数: ${result.accessCount}`);
  console.log(`回放次数: ${result.playbackCount}`);
  console.log(`导出次数: ${result.exportCount}`);
  console.log(`\n操作轨迹 (${result.trail.length} 条):\n`);
  result.trail.slice(0, 10).forEach(t => {
    console.log(`  [${t.accessedAt}] ${t.viewer} - ${t.action} - ${t.granted ? '✅ 已授权' : '⛔ 已拒绝'}`);
    if (t.details && Object.keys(t.details).length > 0) {
      console.log(`    详情: ${JSON.stringify(t.details)}`);
    }
  });
  process.exit(0);
}

const vaultExportIdx = args.indexOf('--vault-export');
if (vaultExportIdx >= 0) {
  const vaultBatchId = args[vaultExportIdx + 1];
  const viewer = args[vaultExportIdx + 2];
  if (!vaultBatchId || !viewer) {
    console.error('错误: --vault-export 需要保险箱批次ID和操作人');
    process.exit(1);
  }
  const result = vaultSvc.exportVaultAuditPackage(vaultBatchId, viewer);
  if (result.error) {
    console.error('导出失败:', result.message || result.error);
    process.exit(1);
  }
  console.log(JSON.stringify(result.packageData, null, 2));
  process.exit(0);
}

const vaultImportIdx = args.indexOf('--vault-import');
if (vaultImportIdx >= 0) {
  const packageFile = args[vaultImportIdx + 1];
  const operator = args[vaultImportIdx + 2];
  const strategyIdx = args.indexOf('--strategy');
  const conflictStrategy = strategyIdx >= 0 ? args[strategyIdx + 1] : 'reject';
  if (!packageFile || !operator) {
    console.error('错误: --vault-import 需要审计包文件路径和操作人');
    process.exit(1);
  }
  if (!fs.existsSync(packageFile)) {
    console.error('错误: 文件不存在:', packageFile);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(packageFile, 'utf-8');
    const packageData = JSON.parse(raw);
    const result = vaultSvc.importVaultAuditPackage(packageData, operator, { conflictStrategy });
    if (result.error) {
      console.error('导入失败:', result.message || result.error);
      process.exit(1);
    }
    console.log('\n===== 审计包导入结果 =====');
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'conflict') {
      console.log('\n提示: 检测到冲突，可使用 --strategy skip 或 --strategy force 处理');
    }
  } catch (e) {
    console.error('错误: 读取或解析文件失败:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

if (args.includes('--vault-import-list')) {
  const packages = vaultSvc.getImportedPackages({});
  if (packages.length === 0) {
    console.log('暂无审计包导入/导出记录');
  } else {
    console.log(`\n共 ${packages.length} 条审计包记录:\n`);
    packages.forEach(p => {
      console.log(`  ${p.type.toUpperCase()} - ${p.id.slice(0, 8)}...`);
      console.log(`    指纹: ${p.fingerprint.slice(0, 16)}...`);
      console.log(`    保险箱批次: ${p.vaultBatchId.slice(0, 8)}...`);
      console.log(`    导出人: ${p.exportedBy} @ ${p.exportedAt}`);
      if (p.importer) console.log(`    导入人: ${p.importer} @ ${p.importedAt}`);
      console.log(`    状态: ${p.status}`);
      if (p.conflictCount > 0) console.log(`    冲突: ${p.conflictCount} 条`);
      if (p.force) console.log('    ⚠  强制导入');
      console.log('');
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
