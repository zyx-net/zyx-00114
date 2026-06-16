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
check(readme.includes('快照'), 'README 提到了草稿快照历史');
check(readme.includes('基线版本冲突'), 'README 提到了基线版本冲突拦截');
check(readme.includes('导入'), 'README 提到了数据导入');
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

// ---- 12. 草稿快照：多次保存自动建快照、恢复、冲突拦截 ----
console.log('\n【12】草稿快照：保存建快照、恢复内容、版本前进时冲突被拦下');
delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/revision.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/archive.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/document.js'))];

const snapDocSvc = require(path.join(ROOT, 'lib/document'));
const snapRevSvc = require(path.join(ROOT, 'lib/revision'));
const snapArchSvc = require(path.join(ROOT, 'lib/archive'));
const snapSvc = require(path.join(ROOT, 'lib/draft'));

const freshSnapDoc = snapDocSvc.importDocument('快照专属测试文档', '快照初始内容', '张编辑');
const snapDocId = freshSnapDoc.document.id;

const snapSaved1 = snapSvc.saveDraft(snapDocId, '快照草稿 v1', '快照理由 v1', '张编辑');
check(snapSaved1.draft && snapSaved1.draft.id, '首次保存草稿成功');
const snapDraftId = snapSaved1.draft.id;
check(snapSvc.getSnapshotsByDraft(snapDraftId).length === 0, '首次保存无历史快照（无旧内容）');

const snapSaved2 = snapSvc.updateDraft(snapDraftId, '快照草稿 v2', '快照理由 v2', '张编辑');
check(snapSaved2.draft, '第一次更新草稿成功');
const snapsAfter1 = snapSvc.getSnapshotsByDraft(snapDraftId);
check(snapsAfter1.length === 1, '更新后自动生成 1 个快照');
check(snapsAfter1[0].content === '快照草稿 v1', '快照保留了更新前的内容');
check(snapsAfter1[0].reason === '快照理由 v1', '快照保留了更新前的理由');
check(snapsAfter1[0].baselineVersionNumber === '1.0', '快照记录了基线版本号');
check(snapsAfter1[0].createdAt && snapsAfter1[0].createdBy === '张编辑', '快照记录了时间和操作人');

snapSvc.updateDraft(snapDraftId, '快照草稿 v3', '快照理由 v3', '张编辑');
snapSvc.updateDraft(snapDraftId, '快照草稿 v4', '快照理由 v4', '张编辑');
const snapsAfter3 = snapSvc.getSnapshotsByDraft(snapDraftId);
check(snapsAfter3.length === 3, '3 次更新后有 3 个快照（按时间倒序）');

const restored = snapSvc.restoreSnapshot(snapsAfter3[1].id, '张编辑');
check(!restored.error, '恢复快照无错误：' + (restored.error || 'ok') + ' ' + (restored.message || ''));
check(restored.draft && restored.draft.content === '快照草稿 v2', '恢复指定快照，草稿内容回到 v2');
check(restored.draft && restored.draft.reason === '快照理由 v2', '恢复后草稿理由也回到 v2');
check(snapSvc.getSnapshotsByDraft(snapDraftId).length >= 4, '恢复前自动把当前内容再存一份快照');

// 冲突场景：别人把正式版本发出去，再恢复快照要被拦下
const snapRev = snapRevSvc.createRevision(snapDocId, '别人推进的正式内容', '别人推进版本', '王编辑');
snapArchSvc.approveAndPublish(snapRev.revision.id, '李审批');
const blockedSnapRestore = snapSvc.restoreSnapshot(snapsAfter3[0].id, '张编辑');
check(blockedSnapRestore.error === 'BASELINE_CONFLICT', '正式版本前进后，快照恢复被 BASELINE_CONFLICT 拦下');
check(blockedSnapRestore.message && blockedSnapRestore.message.includes('拦截'), '冲突错误信息明确告知"拦截"');
check(blockedSnapRestore.detail && blockedSnapRestore.detail.snapshotBaselineVersion !== blockedSnapRestore.detail.currentVersion, '冲突错误返回了基线版本与当前版本的差异');

const conflictInterceptLogs = snapArchSvc.exportRevisionLog(snapDocId, { action: 'draft_snapshot_restore_conflict' });
check(conflictInterceptLogs.length === 1, '冲突拦截写入了修订日志，可追溯');

const approverRestoreSnap = snapSvc.restoreSnapshot(snapsAfter3[0].id, '李审批');
check(approverRestoreSnap.error === 'PERMISSION_DENIED', '审批人（李审批）不能恢复张编辑的快照');

const approverDeleteSnap = snapSvc.deleteSnapshot(snapsAfter3[0].id, '李审批');
check(approverDeleteSnap.error === 'PERMISSION_DENIED', '审批人（李审批）不能删除张编辑的快照');

const ownerDeleteSnap = snapSvc.deleteSnapshot(snapsAfter3[0].id, '张编辑');
check(ownerDeleteSnap.success === true, '草稿 owner（张编辑）可以删除自己的快照');

const csvWithSnap = snapArchSvc.exportRevisionLogCSV(snapDocId);
check(csvWithSnap.includes('快照ID'), 'CSV 导出包含"快照ID"列');
check(csvWithSnap.includes('恢复草稿快照'), 'CSV 包含"恢复草稿快照"动作标签');
check(csvWithSnap.includes('草稿快照恢复冲突拦截'), 'CSV 包含"草稿快照恢复冲突拦截"动作标签');
check(csvWithSnap.includes('删除草稿快照'), 'CSV 包含"删除草稿快照"动作标签');

// ---- 12.5 草稿快照：重启后快照还在，还能再恢复 ----
console.log('\n【12.5】草稿快照：重启持久化验证（重启后快照仍存在且可恢复）');
delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/document.js'))];

const persistDocSvc = require(path.join(ROOT, 'lib/document'));
const persistSvc = require(path.join(ROOT, 'lib/draft'));
const persistDoc = persistDocSvc.importDocument('重启快照持久化文档', '初始内容', '张编辑');
check(persistDoc && persistDoc.document, '12.5 文档创建成功');
const persistSaved1 = persistSvc.saveDraft(persistDoc.document.id, '持久化草稿 A', '持久化理由 A', '张编辑');
check(persistSaved1 && persistSaved1.draft, '12.5 草稿保存成功：' + (persistSaved1 && persistSaved1.error ? persistSaved1.error : 'ok'));
const persistDraftId = persistSaved1.draft.id;
persistSvc.updateDraft(persistDraftId, '持久化草稿 B', '持久化理由 B', '张编辑');
persistSvc.updateDraft(persistDraftId, '持久化草稿 C', '持久化理由 C', '张编辑');
const persistSnapsBefore = persistSvc.getSnapshotsByDraft(persistDraftId);
check(persistSnapsBefore.length === 2, '重启前创建了 2 个快照');

delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];

const snapSvcAfter = require(path.join(ROOT, 'lib/draft'));
const snapsAfterReboot = snapSvcAfter.getSnapshotsByDraft(persistDraftId);
check(snapsAfterReboot.length === 2, '重启后快照仍然存在，数量未丢失');
check(snapsAfterReboot[0].content === '持久化草稿 B', '重启后快照内容可读（最新）');
check(snapsAfterReboot[1].content === '持久化草稿 A', '重启后快照内容可读（最早）');
check(snapsAfterReboot[0].createdBy === '张编辑', '重启后快照创建人正确——不会和别的操作人串线');

const rebootRestored = snapSvcAfter.restoreSnapshot(snapsAfterReboot[0].id, '张编辑');
check(!rebootRestored.error, '重启后恢复快照无错误：' + (rebootRestored.error || 'ok'));
check(rebootRestored.draft, '重启后仍然可以正常恢复快照');
check(rebootRestored.draft.content === '持久化草稿 B', '重启后恢复的快照内容正确');

// ---- 12.6 快照读取权限：非 owner 不能拿到内容/理由/创建人 ----
console.log('\n【12.6】快照读取权限：非 owner 被脱敏');
const permViewDoc = persistDocSvc.importDocument('快照读取权限文档', '初始', '张编辑');
const permViewDraft = persistSvc.saveDraft(permViewDoc.document.id, '权限草稿内容', '权限草稿理由', '张编辑');
persistSvc.updateDraft(permViewDraft.draft.id, '权限草稿更新', '权限更新理由', '张编辑');

const ownerViewSnaps = persistSvc.getSnapshotsByDraft(permViewDraft.draft.id, '张编辑');
check(ownerViewSnaps.length >= 1, 'owner 能看到快照列表');
check(ownerViewSnaps[0].content === '权限草稿内容', 'owner 能看到快照内容');
check(ownerViewSnaps[0].reason === '权限草稿理由', 'owner 能看到快照理由');
check(ownerViewSnaps[0].createdBy === '张编辑', 'owner 能看到快照创建人');
check(!ownerViewSnaps[0]._redacted, 'owner 的快照无 _redacted 标记');

const otherViewSnaps = persistSvc.getSnapshotsByDraft(permViewDraft.draft.id, '李审批');
check(otherViewSnaps.length >= 1, '非 owner 也能看到快照条目数量');
check(otherViewSnaps[0]._redacted === true, '非 owner 的快照有 _redacted 标记');
check(otherViewSnaps[0].content === undefined, '非 owner 不能看到快照内容');
check(otherViewSnaps[0].reason === undefined, '非 owner 不能看到快照理由');
check(otherViewSnaps[0].createdBy === undefined, '非 owner 不能看到快照创建人');

const otherSingleSnap = persistSvc.getSnapshot(ownerViewSnaps[0].id, '李审批');
check(otherSingleSnap._redacted === true, '非 owner 通过 getSnapshot 返回 _redacted');
check(otherSingleSnap.content === undefined, '非 owner 通过 getSnapshot 不能看到内容');

// ---- 12.7 导出再导入：草稿和快照不串线 ----
console.log('\n【12.7】导出再导入：草稿和快照不串线');
const storeForExport = require(path.join(ROOT, 'lib/store'));
const exportDoc1 = persistDocSvc.importDocument('导出文档 A', '内容 A', '张编辑');
persistSvc.saveDraft(exportDoc1.document.id, '张编辑导出草稿', '导出理由 A', '张编辑');
const exportDraftAId = Object.values(storeForExport.read().drafts).find(d => d.documentId === exportDoc1.document.id).id;
persistSvc.updateDraft(exportDraftAId, '张编辑导出草稿更新', '导出理由 A2', '张编辑');

const exportDoc2 = persistDocSvc.importDocument('导出文档 B', '内容 B', '王编辑');
persistSvc.saveDraft(exportDoc2.document.id, '王编辑导出草稿', '导出理由 B', '王编辑');

const fullExport = storeForExport.exportAll();
const expDraftA = Object.values(fullExport.drafts).find(d => d.createdBy === '张编辑' && d.documentId === exportDoc1.document.id);
const expDraftB = Object.values(fullExport.drafts).find(d => d.createdBy === '王编辑' && d.documentId === exportDoc2.document.id);
check(expDraftA && expDraftA.content === '张编辑导出草稿更新', '导出中张编辑草稿内容正确');
check(expDraftB && expDraftB.content === '王编辑导出草稿', '导出中王编辑草稿内容正确');

const expSnapA = Object.values(fullExport.draftSnapshots).find(s => s.createdBy === '张编辑' && s.documentId === exportDoc1.document.id);
check(expSnapA && expSnapA.content === '张编辑导出草稿', '导出中张编辑快照内容正确');
check(expSnapA && expSnapA.draftId === exportDraftAId, '导出中快照与草稿关联正确');

resetData();
const importResult = storeForExport.importData(fullExport);
check(importResult.success === true, '导入成功');

const importedData = storeForExport.read();
const impDraftA = Object.values(importedData.drafts).find(d => d.createdBy === '张编辑' && d.documentId === exportDoc1.document.id);
const impDraftB = Object.values(importedData.drafts).find(d => d.createdBy === '王编辑' && d.documentId === exportDoc2.document.id);
check(impDraftA && impDraftA.content === '张编辑导出草稿更新', '导入后张编辑草稿内容正确');
check(impDraftB && impDraftB.content === '王编辑导出草稿', '导入后王编辑草稿内容正确');

const impSnapA = Object.values(importedData.draftSnapshots).find(s => s.createdBy === '张编辑' && s.documentId === exportDoc1.document.id);
check(impSnapA && impSnapA.content === '张编辑导出草稿', '导入后快照归属不串线');
check(impSnapA && impSnapA.draftId === impDraftA.id, '导入后快照与草稿关联正确');

// ---- 12.8 重启后导入结果仍正确 ----
console.log('\n【12.8】重启后导入结果仍正确');
delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];

const rebootImportStore = require(path.join(ROOT, 'lib/store'));
const rebootImportDraft = require(path.join(ROOT, 'lib/draft'));
const rebootImportData = rebootImportStore.read();
const rebootImpDraftA = Object.values(rebootImportData.drafts).find(d => d.createdBy === '张编辑' && d.documentId === exportDoc1.document.id);
check(rebootImpDraftA && rebootImpDraftA.content === '张编辑导出草稿更新', '重启后导入的草稿内容正确');
check(rebootImpDraftA && rebootImpDraftA.reason === '导出理由 A2', '重启后导入的草稿理由正确');

const rebootImpSnaps = rebootImportDraft.getSnapshotsByDraft(rebootImpDraftA.id, '张编辑');
check(rebootImpSnaps.length >= 1, '重启后导入的快照数量正确');
check(rebootImpSnaps[0].content === '张编辑导出草稿', '重启后导入的快照内容正确');

// ---- 13. README 写的端口和 server.js 实际一致 ----
console.log('\n【13】README 写的端口与 server.js 实际一致');
const serverCode = readFile('server.js');
check(
  (serverCode.includes('PORT') && (serverCode.includes('3200') || serverCode.includes('process.env.PORT'))),
  'server.js 定义了 PORT，默认 3200'
);

// ---- 14. 前端入口可见性：页面包含草稿箱、筛选、CSV导出入口 ----
console.log('\n【14】前端入口可见性：页面包含草稿箱、筛选、CSV导出入口');
const indexHtml = readFile('public/index.html');
check(indexHtml.includes('data-tab="drafts"'), 'index.html 有草稿箱标签页入口');
check(indexHtml.includes('tab-drafts'), 'index.html 有草稿箱内容区');
check(indexHtml.includes('saveDraftBtn'), 'index.html 修订区有保存草稿按钮');
check(indexHtml.includes('draftConflictWarning'), 'index.html 有冲突警告区域');
check(indexHtml.includes('draftSubmitBtn'), 'index.html 有从草稿提交按钮');
check(indexHtml.includes('snapshotList'), 'index.html 有快照列表容器');
check(indexHtml.includes('refreshSnapshotsBtn'), 'index.html 有刷新快照按钮');
check(indexHtml.includes('snapshotConflictWarning'), 'index.html 有快照恢复冲突警告区域');
check(indexHtml.includes('logFilterOperator'), 'index.html 日志区有操作人筛选输入');
check(indexHtml.includes('logFilterAction'), 'index.html 日志区有动作筛选下拉');
check(indexHtml.includes('logFilterStatus'), 'index.html 日志区有状态筛选下拉');
check(indexHtml.includes('exportCsvBtn'), 'index.html 有 CSV 导出按钮');
check(indexHtml.includes('exportDataBtn'), 'index.html 有数据导出按钮');
check(indexHtml.includes('importDataFile'), 'index.html 有数据导入文件输入');
check(indexHtml.includes('importDataResult'), 'index.html 有数据导入结果区域');

// ---- 15. 前端逻辑链路：app.js 接通了草稿/冲突/筛选/权限 ----
console.log('\n【15】前端逻辑链路：app.js 接通了草稿/冲突/筛选/权限');
const appJs = readFile('public/app.js');
check(appJs.includes('/drafts'), 'app.js 调用草稿 API');
check(appJs.includes('/conflict'), 'app.js 调用冲突检测 API');
check(appJs.includes('/submit'), 'app.js 调用从草稿提交 API');
check(appJs.includes('409'), 'app.js 处理基线版本冲突 HTTP 409 响应');
check(appJs.includes('draftConflictWarning'), 'app.js 显示冲突警告到界面');
check(appJs.includes('/snapshots'), 'app.js 调用快照 API');
check(appJs.includes('restoreSnapshot'), 'app.js 包含快照恢复函数');
check(appJs.includes('loadSnapshots'), 'app.js 包含快照列表加载函数');
check(appJs.includes('deleteSnapshot'), 'app.js 包含快照删除函数');
check(appJs.includes('snapshotConflictWarning'), 'app.js 显示快照恢复冲突警告');
check(appJs.includes('logFilterAction'), 'app.js 读取动作筛选参数');
check(appJs.includes('logFilterStatus'), 'app.js 读取状态筛选参数');
check(appJs.includes('logFilterOperator'), 'app.js 读取操作人筛选参数');
check(appJs.includes('export.csv'), 'app.js 构造 CSV 下载链接');
check(appJs.includes('isOwner') || appJs.includes('createdBy'), 'app.js 判断草稿归属控制编辑权限');
check(appJs.includes("role === 'approver'"), 'app.js 根据角色控制审批按钮');
check(appJs.includes('/export'), 'app.js 调用数据导出 API');
check(appJs.includes('/import'), 'app.js 调用数据导入 API');
check(appJs.includes('importDataFile'), 'app.js 处理数据导入文件选择');
check(appJs.includes('_redacted'), 'app.js 处理快照脱敏标记');

// ---- 16. 前端样式：style.css 有草稿/冲突/筛选相关样式 ----
console.log('\n【16】前端样式：style.css 有草稿/冲突/筛选相关样式');
const cssContent = readFile('public/style.css');
check(cssContent.includes('.draft-card'), 'style.css 有草稿卡片样式');
check(cssContent.includes('.conflict-warning'), 'style.css 有冲突警告样式');
check(cssContent.includes('.filter-bar'), 'style.css 有筛选栏样式');
check(cssContent.includes('.draft-edit-area'), 'style.css 有草稿编辑区样式');
check(cssContent.includes('.action-draft_save'), 'style.css 有草稿日志颜色');
check(cssContent.includes('.snapshot-card'), 'style.css 有快照卡片样式');
check(cssContent.includes('.snapshot-list'), 'style.css 有快照列表样式');
check(cssContent.includes('.action-draft_snapshot_restore'), 'style.css 有快照恢复日志颜色');
check(cssContent.includes('.action-draft_snapshot_restore_conflict'), 'style.css 有快照冲突拦截日志颜色');
check(cssContent.includes('.action-draft_snapshot_delete'), 'style.css 有快照删除日志颜色');

// ---- 17. 路由无重复：api.js 不存在同路径无筛选旧路由 ----
console.log('\n【17】路由无重复：api.js 不存在同路径无筛选旧路由');
const apiCode = readFile('routes/api.js');
const routeOccurrences = (apiCode.match(/get\('\/documents\/:docId\/revision-log'/g) || []).length;
check(routeOccurrences === 1, 'GET /documents/:docId/revision-log 只定义一次（当前 ' + routeOccurrences + ' 次）');

const docLogFilterPresent = apiCode.includes("filters.action = action") && apiCode.includes("filters.operator = operator") && apiCode.includes("filters.status = status");
check(docLogFilterPresent, '剩余的 /documents/:docId/revision-log 路由读取了 action/operator/status 筛选参数');

// ---- 18. HTTP 端点级筛选验证 ----
console.log('\n【18】HTTP 端点级筛选验证：页面查询和 CSV 导出结果一致');

(async () => {
  const http = require('http');
  const DELIVERY_PORT = 3298;

  function httpGetJson(urlPath) {
    return new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:' + DELIVERY_PORT + urlPath, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
          catch (e) { resolve({ status: res.statusCode, data: body }); }
        });
      }).on('error', reject);
    });
  }

  function httpGetRaw(urlPath) {
    return new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:' + DELIVERY_PORT + urlPath, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: body }));
      }).on('error', reject);
    });
  }

  function httpPost(urlPath, payload, method) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload || {});
      const req = http.request({ hostname: '127.0.0.1', port: DELIVERY_PORT, path: urlPath, method: method || 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve({ status: res.statusCode, ...JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: body }); } });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  resetData();
  const appModule = require(path.join(ROOT, 'server'));
  const deliveryServer = require('http').createServer(appModule);

  await new Promise((resolve, reject) => {
    deliveryServer.listen(DELIVERY_PORT, resolve);
    deliveryServer.on('error', reject);
  });

  try {
    const created = await httpPost('/api/documents', { title: '交付筛选验证文档', content: '初始内容', operator: '张编辑' });
    check(created.document && created.document.id, '通过 HTTP 创建文档成功');
    const httpDocId = created.document.id;

    const revCreated = await httpPost('/api/documents/' + httpDocId + '/revisions', { content: '修改后内容', reason: '交付筛选测试', operator: '张编辑' });
    check(revCreated.revision && revCreated.revision.id, '通过 HTTP 提交修订成功');
    const httpRevId = revCreated.revision.id;

    const approved = await httpPost('/api/revisions/' + httpRevId + '/approve', { approver: '李审批' });
    check(approved.revision && approved.revision.status === 'published', '通过 HTTP 审批发布成功');

    await httpPost('/api/drafts', { documentId: httpDocId, content: '草稿内容', reason: '交付筛选草稿', operator: '张编辑' });

    const allLogsRes = await httpGetJson('/api/documents/' + httpDocId + '/revision-log');
    check(allLogsRes.data.length >= 4, '无筛选时返回全部日志（>=4条）');

    const draftFilterRes = await httpGetJson('/api/documents/' + httpDocId + '/revision-log?status=draft');
    const draftFilterLogs = draftFilterRes.data;
    check(draftFilterLogs.length > 0, 'status=draft 筛选返回结果');
    check(draftFilterLogs.every(l => l.action === 'draft_save' || l.action === 'draft_delete'), 'status=draft 筛选不混入 import/submit/publish');
    check(!draftFilterLogs.some(l => l.action === 'import' || l.action === 'submit' || l.action === 'publish'), 'draft 筛选无任何非草稿动作');

    const submitFilterRes = await httpGetJson('/api/documents/' + httpDocId + '/revision-log?action=submit');
    check(submitFilterRes.data.every(l => l.action === 'submit'), 'action=submit 筛选只有 submit');
    check(!submitFilterRes.data.some(l => l.action === 'import' || l.action === 'publish'), 'submit 筛选不混入 import/publish');

    const csvRes = await httpGetRaw('/api/documents/' + httpDocId + '/revision-log/export.csv?status=draft');
    const csvBody = csvRes.data;
    const csvDataLines = csvBody.split('\n').filter(l => l.trim() !== '').slice(1);
    check(csvDataLines.length === draftFilterLogs.length, 'CSV 数据行数与 JSON 筛选一致（' + csvDataLines.length + ' vs ' + draftFilterLogs.length + '）');

    const csvSubmitRes = await httpGetRaw('/api/documents/' + httpDocId + '/revision-log/export.csv?action=submit');
    const csvSubmitLines = csvSubmitRes.data.split('\n').filter(l => l.trim() !== '').slice(1);
    check(csvSubmitLines.length === submitFilterRes.data.length, 'CSV submit 行数与 JSON 一致');

    const httpSnapDocCreated = await httpPost('/api/documents', { title: 'HTTP快照专属文档', content: 'HTTP快照初始', operator: '张编辑' });
    const httpSnapDocId = httpSnapDocCreated.document.id;

    await httpPost('/api/drafts', { documentId: httpSnapDocId, content: '交付快照草稿 A', reason: '交付快照理由 A', operator: '张编辑' });
    const snapDraftList = await httpGetJson('/api/drafts?documentId=' + httpSnapDocId);
    const httpSnapDraftId = snapDraftList.data[0].id;

    const putUpdateRes = await httpPost('/api/drafts/' + httpSnapDraftId, { content: '交付快照草稿 B', reason: '交付快照理由 B', operator: '张编辑' }, 'PUT');
    check(putUpdateRes.draft !== undefined || putUpdateRes.status === 200, 'HTTP: PUT 更新草稿成功');

    const snapListRes = await httpGetJson('/api/drafts/' + httpSnapDraftId + '/snapshots');
    check(snapListRes.data.length === 1, 'HTTP: 更新草稿后快照列表有 1 条（实际 ' + snapListRes.data.length + '）');
    check(snapListRes.data[0].content === '交付快照草稿 A', 'HTTP: 快照内容正确（保留更新前内容）');
    const httpSnapId = snapListRes.data[0].id;

    const approverSnapRestore = await httpPost('/api/snapshots/' + httpSnapId + '/restore', { operator: '李审批' });
    check(approverSnapRestore.error === 'PERMISSION_DENIED' || approverSnapRestore.status === 403, 'HTTP: 审批人恢复别人快照被 403 拒绝');

    const approverSnapDelete = await httpPost('/api/snapshots/' + httpSnapId, { operator: '李审批' }, 'DELETE');
    check(approverSnapDelete.error === 'PERMISSION_DENIED' || approverSnapDelete.status === 403, 'HTTP: 审批人删除别人快照被 403 拒绝');

    const ownerSnapDelete = await httpPost('/api/snapshots/' + httpSnapId, { operator: '张编辑' }, 'DELETE');
    check(ownerSnapDelete.success === true || ownerSnapDelete.status === 200, 'HTTP: 草稿 owner 删除自己的快照成功');
    const snapAfterDelete = await httpGetJson('/api/drafts/' + httpSnapDraftId + '/snapshots');
    check(snapAfterDelete.data.length === 0, 'HTTP: 删除后快照列表为空（实际 ' + snapAfterDelete.data.length + '）');

    await httpPost('/api/drafts/' + httpSnapDraftId, { content: '交付快照草稿 C', reason: '交付快照理由 C', operator: '张编辑' }, 'PUT');
    const snapList2 = await httpGetJson('/api/drafts/' + httpSnapDraftId + '/snapshots');
    const httpSnapId2 = snapList2.data[0].id;
    const snapRestoreRes = await httpPost('/api/snapshots/' + httpSnapId2 + '/restore', { operator: '张编辑' });
    check(snapRestoreRes.draft && snapRestoreRes.draft.content === '交付快照草稿 B', 'HTTP: 恢复快照成功，草稿内容回退到 B');
  } finally {
    deliveryServer.close();
  }

  // ---- 汇总 ----
  console.log('\n' + '='.repeat(60));
  console.log('  交付验证：✅ ' + passed.length + ' 项通过  ❌ ' + failed.length + ' 项失败');
  console.log('='.repeat(60));

  if (failed.length > 0) {
    console.log('\n失败项：');
    failed.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
})();
