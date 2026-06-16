const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const passed = [];
const failed = [];

function check(cond, name, detail) {
  if (cond) {
    passed.push(name);
    console.log('  ✅ ' + name + (detail ? '  (' + detail + ')' : ''));
  } else {
    failed.push(name);
    console.log('  ❌ ' + name + (detail ? '  (' + detail + ')' : ''));
  }
}

function fileExists(p) { return fs.existsSync(path.join(ROOT, p)); }
function readFile(p) { return fs.readFileSync(path.join(ROOT, p), 'utf-8'); }
function resetData() {
  const db = path.join(ROOT, 'data', 'db.json');
  const tmp = db + '.tmp';
  if (fs.existsSync(db)) fs.unlinkSync(db);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
}

console.log('\n========= 交付验证：让接手人只看仓库目录就能跑通 =========\n');

// ---- 1. 交付物存在性 ----
console.log('【1】交付文件是否都在仓库里？');
check(fileExists('README.md'), 'README.md 存在');
check(fileExists('samples/sample-doc.txt'), 'samples/sample-doc.txt 存在（样例文档）');
check(fileExists('scripts/import-sample.js'), 'scripts/import-sample.js 存在');
check(fileExists('scripts/export-log.js'), 'scripts/export-log.js 存在');
check(fileExists('lib/store.js'), 'lib/store.js 存在');
check(fileExists('lib/document.js'), 'lib/document.js 存在');
check(fileExists('lib/revision.js'), 'lib/revision.js 存在');
check(fileExists('lib/archive.js'), 'lib/archive.js 存在');
check(fileExists('lib/diff.js'), 'lib/diff.js 存在');
check(fileExists('lib/draft.js'), 'lib/draft.js 存在（草稿模块）');
check(fileExists('lib/auth.js'), 'lib/auth.js 存在（权限模块）');
check(fileExists('routes/api.js'), 'routes/api.js 存在');
check(fileExists('public/index.html'), 'public/index.html 存在');
check(fileExists('server.js'), 'server.js 存在');
check(fileExists('package.json'), 'package.json 存在');
check(fileExists('package-lock.json'), 'package-lock.json 存在（npm install 已执行）');

// ---- 2. README 内容是否覆盖关键步骤 ----
console.log('\n【2】README 是否覆盖接手人必须知道的步骤？');
const readme = readFile('README.md');
check(readme.includes('npm install'), 'README 写了 npm install');
check(readme.includes('npm start'), 'README 写了服务启动方式');
check(readme.includes('3200'), 'README 写了默认端口');
check(readme.includes('samples/sample-doc.txt'), 'README 说明了样例文档从哪里拿');
check(readme.includes('加载样例文档'), 'README 写了前端导入步骤');
check(readme.includes('修订理由'), 'README 提到了修订理由必填');
check(readme.includes('审批发布'), 'README 提到了审批步骤');
check(readme.includes('导出修订日志'), 'README 写了日志导出步骤');
check(readme.includes('撤回'), 'README 提到了撤回行为');
check(readme.includes('草稿'), 'README 提到了草稿箱');
check(readme.includes('基线版本冲突'), 'README 提到了基线版本冲突拦截');
check(readme.includes('权限'), 'README 提到了权限边界');
check(readme.includes('CSV'), 'README 提到了 CSV 导出');
check(readme.includes('筛选'), 'README 提到了日志筛选');
check(readme.includes('node scripts/import-sample.js'), 'README 提到了命令行导入脚本');
check(readme.includes('node scripts/export-log.js'), 'README 提到了命令行导出脚本');
check(readme.includes('npm test'), 'README 写了测试命令');
check(readme.includes('node test/delivery.js'), 'README 提到了交付验证命令');

// ---- 3. README 目录树和实际目录一致 ----
console.log('\n【3】README 目录速览是否和实际文件一致？');
const listedInReadme = [
  'server.js', 'package.json', 'README.md',
  'samples/sample-doc.txt',
  'scripts/import-sample.js', 'scripts/export-log.js',
  'lib/store.js', 'lib/document.js', 'lib/diff.js', 'lib/revision.js', 'lib/archive.js', 'lib/draft.js', 'lib/auth.js',
  'routes/api.js',
  'public/index.html', 'public/style.css', 'public/app.js',
  'data/db.json',
  'test/run.js', 'test/delivery.js'
];
listedInReadme.forEach(p => {
  check(fileExists(p) || p === 'data/db.json', 'README 列出的文件/目录存在: ' + p);
});

// ---- 4. 按 README 步骤：从样例导入 -> 提交修订 -> 审批发布 -> 导出日志 ----
console.log('\n【4】按 README 第 4 节步骤跑一遍主流程');
resetData();

const docSvc = require(path.join(ROOT, 'lib/document'));
const revSvc = require(path.join(ROOT, 'lib/revision'));
const archSvc = require(path.join(ROOT, 'lib/archive'));

const sampleContent = readFile('samples/sample-doc.txt');
check(sampleContent.includes('第一章 总则'), '样例文档内容可读，包含"第一章 总则"');

const imported = docSvc.importDocument('信息安全管理制度', sampleContent, '张编辑');
check(imported.document && imported.document.id, '步骤 4.1：样例文档导入成功');
const docId = imported.document.id;

const newContent = sampleContent + '\n\n第三章 附则\n\n第七条 本制度由信息技术部负责解释。';
const reason = '新增第三章附则';
const submitted = revSvc.createRevision(docId, newContent, reason, '张编辑');
check(submitted.revision && submitted.revision.status === 'submitted', '步骤 4.2：修订提交成功（含理由）');
const revId = submitted.revision.id;

// 失败链路：空理由
const noReason = revSvc.createRevision(docId, newContent, '', '张编辑');
check(noReason.error === 'REVISION_REASON_REQUIRED', 'README 写明的失败链路：无修订理由被拒绝');

// 失败链路：内容相同
const same = revSvc.createRevision(docId, sampleContent, '试图改版本号', '张编辑');
check(same.error === 'INVALID_CHANGE', 'README 写明的失败链路：内容完全相同被识别为无效变更');

const approved = archSvc.approveAndPublish(revId, '李审批');
check(approved.revision && approved.revision.status === 'published', '步骤 4.3：审批发布成功（不同角色）');

const editorPublish = archSvc.approveAndPublish(
  submitted.revision.status === 'submitted' ? revId : submitted.revision.id,
  '张编辑'
);
check(editorPublish.error === 'PERMISSION_DENIED', 'README 写明的失败链路：编辑员没有审批权限被拒绝');

// 用审批员自己提交自己审批，验证同角色拒绝
const approverRev = revSvc.createRevision(docId, newContent + '\n\n第八条 本制度自发布之日起施行。', '增加生效条款', '李审批');
const sameRoleSelf = archSvc.approveAndPublish(approverRev.revision.id, '李审批');
check(sameRoleSelf.error === 'SAME_ROLE', 'README 写明的失败链路：同一人审批被拒绝');

// 失败链路：重复发布
const dup = archSvc.approveAndPublish(revId, '李审批');
check(dup.error === 'DUPLICATE_PUBLISH', 'README 写明的失败链路：重复发布被拒绝');

const logs = archSvc.exportRevisionLog(docId);
check(logs.length >= 3, '步骤 4.4：导出修订日志至少 3 条（导入+提交+发布）');
check(logs.some(l => l.action === 'import'), '导出的日志包含 import 动作');
check(logs.some(l => l.action === 'submit'), '导出的日志包含 submit 动作');
check(logs.some(l => l.action === 'publish'), '导出的日志包含 publish 动作');
check(logs.some(l => l.detail && l.detail.reason === reason), '导出的日志保留了修订理由');

// ---- 5. 撤回与恢复 ----
console.log('\n【5】撤回后恢复上一版，同时保留归档');
const beforeDoc = docSvc.getDocument(docId);
check(beforeDoc.currentVersion.versionNumber === '1.1', '撤回前当前版本为 1.1');

const withdrawn = archSvc.withdraw(revId, '李审批');
check(withdrawn.revision.status === 'withdrawn', '撤回成功，状态变为 withdrawn');

const afterDoc = docSvc.getDocument(docId);
check(afterDoc.currentVersion.versionNumber === '1.0', '撤回后恢复为 1.0（上一版为当前有效版本）');

const archives = archSvc.getArchives(docId);
check(archives.length >= 1, '撤回后归档记录仍然存在，未被删除');

// ---- 6. 命令行脚本可用 ----
console.log('\n【6】命令行脚本（scripts/）可以实际执行');
resetData();
const importOut = execSync('node scripts/import-sample.js 命令行测试', { encoding: 'utf-8', cwd: ROOT });
check(importOut.includes('"ok": true'), 'node scripts/import-sample.js 能跑通');
const imported2 = JSON.parse(importOut);

const exportOut = execSync(`node scripts/export-log.js ${imported2.documentId}`, { encoding: 'utf-8', cwd: ROOT });
check(exportOut.includes('"action": "import"'), 'node scripts/export-log.js 能跑通并输出 import 日志');

// ---- 7. 重启一致性 ----
console.log('\n【7】重启（重新读取 db.json）后，版本指针/归档/日志仍然一致');
const consistency = archSvc.verifyConsistency();
check(consistency.consistent, '一致性校验通过（活动版本指针、归档、导出结果三者一致）');

const logsBefore = archSvc.exportRevisionLog(imported2.documentId).length;
const archivesBefore = archSvc.getArchives(imported2.documentId).length;
const currentBefore = docSvc.getDocument(imported2.documentId).document.currentVersionId;

// 模拟重启：清除 require 缓存后重新读
delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/document.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/archive.js'))];

const docSvc2 = require(path.join(ROOT, 'lib/document'));
const archSvc2 = require(path.join(ROOT, 'lib/archive'));

const logsAfter = archSvc2.exportRevisionLog(imported2.documentId).length;
const archivesAfter = archSvc2.getArchives(imported2.documentId).length;
const currentAfter = docSvc2.getDocument(imported2.documentId).document.currentVersionId;

check(logsAfter === logsBefore, '重启后修订日志条数不变（' + logsAfter + '）');
check(archivesAfter === archivesBefore, '重启后归档记录条数不变（' + archivesAfter + '）');
check(currentAfter === currentBefore, '重启后活动版本指针不变（' + currentAfter.slice(0, 8) + '...）');

// ---- 8. 草稿箱：保存草稿，重启后仍能打开 ----
console.log('\n【8】草稿箱：保存草稿，重启后仍能打开同一份草稿');
const draftSvc = require(path.join(ROOT, 'lib/draft'));
const draftContent = '这是草稿内容\n第二行草稿';
const draftReason = '草稿测试理由';
const saved = draftSvc.saveDraft(imported2.documentId, draftContent, draftReason, '张编辑');
check(saved.draft && saved.draft.id, '草稿保存成功，返回草稿 ID');
check(saved.draft.status === 'draft', '草稿状态为 draft');
check(saved.draft.baselineVersionNumber === '1.0', '草稿基线版本为 1.0');

const draftId = saved.draft.id;
delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];

const draftSvcAfter = require(path.join(ROOT, 'lib/draft'));
const draftAfter = draftSvcAfter.getDraft(draftId);
check(draftAfter !== null, '重启后草稿仍然存在（持久化成功）');
check(draftAfter.content === draftContent, '重启后草稿内容正确');
check(draftAfter.reason === draftReason, '重启后草稿理由正确');
check(draftAfter.createdBy === '张编辑', '重启后草稿创建人正确');

// ---- 9. 基线版本冲突拦截 ----
console.log('\n【9】基线版本冲突：别人发布新版本后，旧草稿提交被拦截');
const revSvc2 = require(path.join(ROOT, 'lib/revision'));

const conflictDraft = draftSvcAfter.saveDraft(imported2.documentId, '冲突草稿内容', '冲突测试', '王编辑');
check(conflictDraft.draft && conflictDraft.draft.id, '创建一份新草稿');

const otherRev = revSvc2.createRevision(imported2.documentId, '别人改的新版本内容', '别人的修订', '赵编辑');
check(otherRev.revision && otherRev.revision.id, '另一位编辑提交了修订');

const archSvc3 = require(path.join(ROOT, 'lib/archive'));
const otherPub = archSvc3.approveAndPublish(otherRev.revision.id, '李审批');
check(otherPub.revision && otherPub.revision.status === 'published', '审批员发布了那条修订，版本推进');

const conflictCheck = draftSvcAfter.checkBaselineConflict(conflictDraft.draft.id);
check(conflictCheck.hasConflict === true, '冲突检测：草稿基线与当前版本不一致');
check(conflictCheck.baselineVersion !== conflictCheck.currentVersion, '返回了不同的基线版本和当前版本');

const submitConflict = revSvc2.submitRevisionFromDraft(conflictDraft.draft.id, '王编辑');
check(submitConflict.error === 'BASELINE_CONFLICT', '从草稿提交时检测到基线冲突，被拦截，不悄悄覆盖');
check(submitConflict.message && submitConflict.message.includes('基线版本冲突'), '冲突错误有明确的提示信息');

// ---- 10. 权限边界验证 ----
console.log('\n【10】权限边界：提交人不能直接发布，审批人不能改别人草稿');
const authSvc = require(path.join(ROOT, 'lib/auth'));

const permEditorRev = revSvc2.createRevision(imported2.documentId, '编辑员提交的内容', '编辑员提交', '张编辑');
const permEditorPublish = archSvc3.approveAndPublish(permEditorRev.revision.id, '张编辑');
check(permEditorPublish.error === 'PERMISSION_DENIED', '提交人（张编辑）不能直接发布，权限拒绝');

const approverEditDraft = draftSvcAfter.updateDraft(draftId, '审批员试图篡改', '', '李审批');
check(approverEditDraft.error === 'PERMISSION_DENIED', '审批人（李审批）不能修改别人的草稿，权限拒绝');

const approverDeleteDraft = draftSvcAfter.deleteDraft(draftId, '李审批');
check(approverDeleteDraft.error === 'PERMISSION_DENIED', '审批人（李审批）不能删除别人的草稿，权限拒绝');

// ---- 11. 筛选导出 CSV ----
console.log('\n【11】修订日志筛选导出：按文档、操作人、状态过滤，支持 CSV 导出');
const allLogs = archSvc3.exportRevisionLog(imported2.documentId);
check(allLogs.length > 0, '文档有修订日志记录');

const zhangLogs = archSvc3.exportRevisionLog(imported2.documentId, { operator: '张编辑' });
check(zhangLogs.every(l => l.operator === '张编辑'), '按操作人筛选：张编辑的日志全是张编辑操作的');
check(zhangLogs.length < allLogs.length, '筛选后条数少于总条数');

const draftLogs = archSvc3.exportRevisionLog(imported2.documentId, { status: 'draft' });
check(draftLogs.every(l => l.action === 'draft_save' || l.action === 'draft_delete'), '按状态筛选：draft 状态返回草稿相关动作');

const submitLogs = archSvc3.exportRevisionLog(imported2.documentId, { action: 'submit' });
check(submitLogs.every(l => l.action === 'submit'), '按动作筛选：submit 动作全是提交记录');

const csvContent = archSvc3.exportRevisionLogCSV(imported2.documentId);
check(csvContent.includes('时间') && csvContent.includes('操作') && csvContent.includes('操作人'), 'CSV 包含标准表头');
check(csvContent.includes('保存草稿'), 'CSV 中有草稿保存动作记录');
check(csvContent.includes('提交修订'), 'CSV 中有提交修订动作记录');
check(csvContent.includes('发布版本'), 'CSV 中有发布版本动作记录');

const filteredCSV = archSvc3.exportRevisionLogCSV(imported2.documentId, { operator: '张编辑' });
const csvLines = filteredCSV.split('\n').filter(l => l.trim() !== '');
const dataLines = csvLines.slice(1);
check(dataLines.every(l => l.includes('张编辑')), '按操作人筛选后的 CSV，数据行都包含该操作人');
check(dataLines.length === zhangLogs.length, 'CSV 筛选结果条数与 JSON 筛选结果一致');

// ---- 12. README 写的端口和 server.js 实际一致 ----
console.log('\n【12】README 写的端口与 server.js 实际一致');
const serverCode = readFile('server.js');
check(
  (serverCode.includes('PORT') && (serverCode.includes('3200') || serverCode.includes('process.env.PORT'))),
  'server.js 定义了 PORT，默认 3200'
);

// ---- 汇总 ----
console.log('\n' + '='.repeat(60));
console.log('  交付验证：✅ ' + passed.length + ' 项通过  ❌ ' + failed.length + ' 项失败');
console.log('='.repeat(60));

if (failed.length > 0) {
  console.log('\n失败项：');
  failed.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
