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
  function tryUnlink(file) {
    if (!fs.existsSync(file)) return;
    for (let i = 0; i < 8; i++) {
      try { fs.unlinkSync(file); return; }
      catch (e) {
        const wait = (i + 1) * 50;
        const start = Date.now();
        while (Date.now() - start < wait) { /* spin */ }
      }
    }
  }
  tryUnlink(db);
  tryUnlink(tmp);
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
  'scripts/import-sample.js', 'scripts/export-log.js', 'scripts/import-log.js',
  'lib/store.js', 'lib/document.js', 'lib/diff.js', 'lib/revision.js', 'lib/archive.js', 'lib/draft.js', 'lib/auth.js', 'lib/audit-playback.js',
  'routes/api.js',
  'public/index.html', 'public/style.css', 'public/app.js',
  'data/db.json',
  'test/run.js', 'test/delivery.js'
];
listedInReadme.forEach(p => {
  check(fileExists(p) || p === 'data/db.json', 'README 列出的文件/目录存在: ' + p);
});

// 审计回放相关 README 描述
check(readme.includes('审计回放'), 'README 描述了审计回放标签页');
check(readme.includes('快照审计回放'), 'README 描述了快照审计回放能力');
check(readme.includes('revision-log/import'), 'README 记录了修订日志独立导入接口');
check(readme.includes('playback-records'), 'README 记录了回放记录查询接口');
check(readme.includes('DUPLICATE_ID'), 'README 记录了 ID 冲突检测');
check(readme.includes('DUPLICATE_SIGNATURE'), 'README 记录了签名冲突检测');
check(readme.includes('_redacted'), 'README 描述了快照脱敏标记');
check(readme.includes('snapshotAccessible'), 'README 描述了回放中的快照可见性标记');
check(readme.includes('canViewAllDrafts'), 'README 描述了审批员跨用户查看快照的权限');
check(readme.includes('force_new_id'), 'README 记录了冲突重导入策略 force_new_id');
check(readme.includes('importedLogs'), 'README 记录了导入批次持久化字段');
check(readme.includes('playbackRecords'), 'README 记录了回放记录持久化字段');
check(readme.includes('OPERATOR_REQUIRED'), 'README 记录了未带操作者身份的报错');
check(readme.includes('PERMISSION_DENIED'), 'README 记录了陌生人/无权限用户的报错');
check(readme.includes('import-log.js'), 'README 记录了命令行审计工具 import-log.js');

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
const draftAfter = draftSvcAfter.getDraft(draftId, '张编辑');
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
check(snapSvc.getSnapshotsByDraft(snapDraftId, '张编辑').length === 0, '首次保存无历史快照（无旧内容）');

const snapSaved2 = snapSvc.updateDraft(snapDraftId, '快照草稿 v2', '快照理由 v2', '张编辑');
check(snapSaved2.draft, '第一次更新草稿成功');
const snapsAfter1 = snapSvc.getSnapshotsByDraft(snapDraftId, '张编辑');
check(snapsAfter1.length === 1, '更新后自动生成 1 个快照');
check(snapsAfter1[0].content === '快照草稿 v1', '快照保留了更新前的内容');
check(snapsAfter1[0].reason === '快照理由 v1', '快照保留了更新前的理由');
check(snapsAfter1[0].baselineVersionNumber === '1.0', '快照记录了基线版本号');
check(snapsAfter1[0].createdAt && snapsAfter1[0].createdBy === '张编辑', '快照记录了时间和操作人');

snapSvc.updateDraft(snapDraftId, '快照草稿 v3', '快照理由 v3', '张编辑');
snapSvc.updateDraft(snapDraftId, '快照草稿 v4', '快照理由 v4', '张编辑');
const snapsAfter3 = snapSvc.getSnapshotsByDraft(snapDraftId, '张编辑');
check(snapsAfter3.length === 3, '3 次更新后有 3 个快照（按时间倒序）');

const restored = snapSvc.restoreSnapshot(snapsAfter3[1].id, '张编辑');
check(!restored.error, '恢复快照无错误：' + (restored.error || 'ok') + ' ' + (restored.message || ''));
check(restored.draft && restored.draft.content === '快照草稿 v2', '恢复指定快照，草稿内容回到 v2');
check(restored.draft && restored.draft.reason === '快照理由 v2', '恢复后草稿理由也回到 v2');
check(snapSvc.getSnapshotsByDraft(snapDraftId, '张编辑').length >= 4, '恢复前自动把当前内容再存一份快照');

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
const persistSnapsBefore = persistSvc.getSnapshotsByDraft(persistDraftId, '张编辑');
check(persistSnapsBefore.length === 2, '重启前创建了 2 个快照');

delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];

const snapSvcAfter = require(path.join(ROOT, 'lib/draft'));
const snapsAfterReboot = snapSvcAfter.getSnapshotsByDraft(persistDraftId, '张编辑');
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

const otherViewSnaps = persistSvc.getSnapshotsByDraft(permViewDraft.draft.id, '李编辑');
check(otherViewSnaps.length >= 1, '非 owner 也能看到快照条目数量');
check(otherViewSnaps[0]._redacted === true, '非 owner 的快照有 _redacted 标记');
check(otherViewSnaps[0].content === undefined, '非 owner 不能看到快照内容');
check(otherViewSnaps[0].reason === undefined, '非 owner 不能看到快照理由');
check(otherViewSnaps[0].createdBy === undefined, '非 owner 不能看到快照创建人');

const otherSingleSnap = persistSvc.getSnapshot(ownerViewSnaps[0].id, '李编辑');
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
  check(indexHtml.includes('data-tab="audit"'), 'index.html 有审计回放标签页入口');
  check(indexHtml.includes('tab-audit'), 'index.html 有审计回放内容区');
  check(indexHtml.includes('auditImportFile'), 'index.html 有审计日志导入文件选择');
  check(indexHtml.includes('auditImportBtn'), 'index.html 有审计日志导入按钮');
  check(indexHtml.includes('auditConflictArea'), 'index.html 有审计冲突处理区域');
  check(indexHtml.includes('auditConflictStrategy'), 'index.html 有冲突策略选择下拉');
  check(indexHtml.includes('auditPlaybackBtn'), 'index.html 有审计回放执行按钮');
  check(indexHtml.includes('auditPlaybackSource'), 'index.html 有回放来源选择');
  check(indexHtml.includes('auditBatchSelect'), 'index.html 有导入批次选择');
  check(indexHtml.includes('auditRefreshBatches'), 'index.html 有刷新导入批次按钮');
  check(indexHtml.includes('auditRefreshPlaybacks'), 'index.html 有刷新回放记录按钮');
  check(indexHtml.includes('auditBatchesList'), 'index.html 有导入批次列表容器');
  check(indexHtml.includes('auditPlaybacksList'), 'index.html 有回放记录列表容器');
  check(indexHtml.includes('快照权限'), 'index.html 审计回放说明包含快照权限相关文案');
  check(indexHtml.includes('冲突处理'), 'index.html 审计回放有冲突处理相关说明');
  check(indexHtml.includes('持久化'), 'index.html 审计回放有持久化说明');

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
  check(appJs.includes('/revision-log/import'), 'app.js 调用审计日志导入 API');
  check(appJs.includes('/revision-log/imported'), 'app.js 调用导入批次查询 API');
  check(appJs.includes('/revision-log/playback'), 'app.js 调用审计回放 API');
  check(appJs.includes('/revision-log/playback-records'), 'app.js 调用回放记录查询 API');
  check(appJs.includes('auditImportBtn'), 'app.js 处理审计导入按钮');
  check(appJs.includes('auditPlaybackBtn'), 'app.js 处理审计回放按钮');
  check(appJs.includes('auditConflictStrategy'), 'app.js 处理冲突策略选择');
  check(appJs.includes('auditReimportBtn'), 'app.js 处理重导入按钮');
  check(appJs.includes('refreshAuditBatches'), 'app.js 刷新导入批次列表');
  check(appJs.includes('refreshAuditPlaybacks'), 'app.js 刷回放记录列表');
  check(appJs.includes('currentAuditBatchId'), 'app.js 维护当前批次状态');
  check(appJs.includes('snapshotAccessible'), 'app.js 展示回放中快照权限检查结果');

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

    const snapListRes = await httpGetJson('/api/drafts/' + httpSnapDraftId + '/snapshots?operator=张编辑');
    check(snapListRes.data.length === 1, 'HTTP: 更新草稿后快照列表有 1 条（实际 ' + snapListRes.data.length + '）');
    check(snapListRes.data[0].content === '交付快照草稿 A', 'HTTP: 快照内容正确（保留更新前内容）');
    const httpSnapId = snapListRes.data[0].id;

    const approverSnapRestore = await httpPost('/api/snapshots/' + httpSnapId + '/restore', { operator: '李审批' });
    check(approverSnapRestore.error === 'PERMISSION_DENIED' || approverSnapRestore.status === 403, 'HTTP: 审批人恢复别人快照被 403 拒绝');

    const approverSnapDelete = await httpPost('/api/snapshots/' + httpSnapId, { operator: '李审批' }, 'DELETE');
    check(approverSnapDelete.error === 'PERMISSION_DENIED' || approverSnapDelete.status === 403, 'HTTP: 审批人删除别人快照被 403 拒绝');

    const ownerSnapDelete = await httpPost('/api/snapshots/' + httpSnapId, { operator: '张编辑' }, 'DELETE');
    check(ownerSnapDelete.success === true || ownerSnapDelete.status === 200, 'HTTP: 草稿 owner 删除自己的快照成功');
    const snapAfterDelete = await httpGetJson('/api/drafts/' + httpSnapDraftId + '/snapshots?operator=张编辑');
    check(snapAfterDelete.data.length === 0, 'HTTP: 删除后快照列表为空（实际 ' + snapAfterDelete.data.length + '）');

    await httpPost('/api/drafts/' + httpSnapDraftId, { content: '交付快照草稿 C', reason: '交付快照理由 C', operator: '张编辑' }, 'PUT');
    const snapList2 = await httpGetJson('/api/drafts/' + httpSnapDraftId + '/snapshots?operator=张编辑');
    const httpSnapId2 = snapList2.data[0].id;
    const snapRestoreRes = await httpPost('/api/snapshots/' + httpSnapId2 + '/restore', { operator: '张编辑' });
    check(snapRestoreRes.draft && snapRestoreRes.draft.content === '交付快照草稿 B', 'HTTP: 恢复快照成功，草稿内容回退到 B');

    // ---- 18.x 审计回放 HTTP 端点验证 ----
    console.log('\n  [18.x 审计回放 HTTP 端点验证]');

    const auditDoc = await httpPost('/api/documents', { title: 'HTTP审计回放文档', content: 'HTTP初始内容', operator: '张编辑' });
    check(auditDoc.document && auditDoc.document.id, 'HTTP: 创建审计测试文档成功');
    const auditDocId = auditDoc.document.id;

    await httpPost('/api/documents/' + auditDocId + '/revisions', { content: 'HTTP修改内容', reason: 'HTTP审计测试修订', operator: '张编辑' });
    await httpPost('/api/drafts', { documentId: auditDocId, content: 'HTTP审计草稿', reason: 'HTTP草稿理由', operator: '李编辑' });

    const exportRes = await httpGetJson('/api/documents/' + auditDocId + '/revision-log');
    const logsForImport = exportRes.data || [];
    check(logsForImport.length >= 3, 'HTTP: 导出了 ' + logsForImport.length + ' 条日志用于导入测试');

    // 不重置数据，而是给日志加前缀避免和原生 ID 冲突
    const freshDoc = await httpPost('/api/documents', { title: 'HTTP审计新环境', content: '新环境初始', operator: '张编辑' });
    const freshLogs = logsForImport.map(l => ({ ...l, id: 'http-imp-' + l.id.slice(0, 10), documentId: freshDoc.document.id }));

    const noOpImp = await httpPost('/api/revision-log/import', { logs: freshLogs, operator: null });
    check(noOpImp.status === 403 || noOpImp.error === 'OPERATOR_REQUIRED', 'HTTP: 无操作人导入被 403 拒绝');

    const strangerImp = await httpPost('/api/revision-log/import', { logs: freshLogs, operator: '陌生人' });
    check(strangerImp.status === 403 || strangerImp.error === 'PERMISSION_DENIED', 'HTTP: 陌生人导入被 403/PERMISSION_DENIED 拒绝');

    const approverImp = await httpPost('/api/revision-log/import', { logs: freshLogs, operator: '李审批', source: 'HTTP测试', notes: 'HTTP导入测试' });
    check(approverImp.status === 201 || approverImp.insertedCount === freshLogs.length, 'HTTP: 审批员导入成功，状态201');
    check(approverImp.batchId !== undefined, 'HTTP: 导入返回批次ID');
    const httpBatchId = approverImp.batchId;

    const dupImp = await httpPost('/api/revision-log/import', { logs: freshLogs, operator: '李审批' });
    check(dupImp.status === 202 && dupImp.conflictCount === freshLogs.length, 'HTTP: 重复导入返回 202 状态码，冲突数=' + freshLogs.length);
    check(dupImp.conflicts && dupImp.conflicts.length > 0, 'HTTP: 重复导入返回 conflicts 冲突详情');
    check(dupImp.conflicts.every(c => c.reason && c.existingLog), 'HTTP: 每条冲突含 reason 和 existingLog 信息');

    const batchList = await httpGetJson('/api/revision-log/imported');
    check(Array.isArray(batchList.data) && batchList.data.length >= 1, 'HTTP: GET /imported 返回批次列表');
    check(batchList.data[0].importedBy === '李审批', 'HTTP: 批次记录操作人=李审批');

    const batchDetail = await httpGetJson('/api/revision-log/imported/' + httpBatchId);
    check(batchDetail.data && batchDetail.data.importBatchId === httpBatchId, 'HTTP: GET /imported/:id 返回批次详情');

    const batchLogs = await httpGetJson('/api/revision-log/imported/' + httpBatchId + '/logs');
    check(Array.isArray(batchLogs.data) && batchLogs.data.length === freshLogs.length, 'HTTP: GET /imported/:id/logs 返回该批次日志');

    const editorReimp = await httpPost('/api/revision-log/imported/' + dupImp.batchId + '/reimport', { strategy: 'overwrite', operator: '张编辑' });
    check(editorReimp.status === 403, 'HTTP: 编辑员重导入被 403 拒绝');

    const allLogsForPlayback = (await httpGetJson('/api/documents/' + freshDoc.document.id + '/revision-log')).data;
    const playIds = allLogsForPlayback.slice(0, 3).map(l => l.id);

    const editorPlay = await httpPost('/api/revision-log/playback', { logIds: playIds, operator: '张编辑' });
    check(editorPlay.status === 403, 'HTTP: 编辑员回放被 403 拒绝');

    const approverPlay = await httpPost('/api/revision-log/playback', { logIds: playIds, operator: '李审批', notes: 'HTTP回放测试' });
    check(approverPlay.status === 201 && approverPlay.recordId, 'HTTP: 审批员回放成功，返回201和recordId');
    check(approverPlay.summary && approverPlay.summary.actionBreakdown, 'HTTP: 回放摘要包含动作分布');
    check(approverPlay.items && approverPlay.items.length === playIds.length, 'HTTP: 回放 items 长度正确');
    const snapItems = approverPlay.items.filter(i => i.snapshotId);
    if (snapItems.length > 0) {
      check(snapItems.every(i => 'snapshotAccessible' in i), 'HTTP: 回放中每条含 snapshotId 的条目都有 snapshotAccessible 权限标记');
    }

    const playRecords = await httpGetJson('/api/revision-log/playback-records');
    check(Array.isArray(playRecords.data) && playRecords.data.length >= 1, 'HTTP: GET /playback-records 返回回放记录列表');
    check(playRecords.data[0].playbackBy === '李审批', 'HTTP: 回放记录标记了操作人=李审批');

    const redactedView = await httpGetJson('/api/revision-log/playback-records/' + approverPlay.recordId);
    check(redactedView.data && redactedView.data._redacted === true, 'HTTP: 无 viewer 参数查看回放记录被 _redacted');

    const ownerView = await httpGetJson('/api/revision-log/playback-records/' + approverPlay.recordId + '?viewer=李审批');
    check(ownerView.data && !ownerView.data._redacted && ownerView.data.items, 'HTTP: viewer=李审批查看回放记录得完整明细');

    const otherApproverView = await httpGetJson('/api/revision-log/playback-records/' + approverPlay.recordId + '?viewer=赵审批');
    check(otherApproverView.data && !otherApproverView.data._redacted, 'HTTP: 其他审批员(赵审批)也能看回放明细');
  } finally {
    if (deliveryServer.listening) deliveryServer.close();
  }

  // ---- 19. 快照读取权限增强：无 operator / 非草稿 owner 脱敏 ----
  console.log('\n【19】快照读取权限增强：无 operator 或非 owner 时正文/理由/创建人被脱敏');
  resetData();
  delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/auth.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/document.js'))];

  const perm19DocSvc = require(path.join(ROOT, 'lib/document'));
  const perm19DraftSvc = require(path.join(ROOT, 'lib/draft'));

  const perm19Doc = perm19DocSvc.importDocument('权限19测试文档', '初始内容', '张编辑');
  check(perm19Doc.document && perm19Doc.document.id, '19 文档创建成功');
  const perm19DocId = perm19Doc.document.id;

  const perm19Draft = perm19DraftSvc.saveDraft(perm19DocId, '张编辑的草稿内容A', '张编辑的理由A', '张编辑');
  check(perm19Draft.draft, '19 张编辑保存草稿成功');
  const perm19DraftId = perm19Draft.draft.id;

  perm19DraftSvc.updateDraft(perm19DraftId, '张编辑的草稿内容B', '张编辑的理由B', '张编辑');
  const perm19SnapsOwner = perm19DraftSvc.getSnapshotsByDraft(perm19DraftId, '张编辑');
  check(perm19SnapsOwner.length === 1, '19 owner 查看有 1 个快照');
  check(perm19SnapsOwner[0].content === '张编辑的草稿内容A', '19 owner 能看到快照正文');
  check(perm19SnapsOwner[0].reason === '张编辑的理由A', '19 owner 能看到快照理由');
  check(perm19SnapsOwner[0].createdBy === '张编辑', '19 owner 能看到快照创建人');
  check(!perm19SnapsOwner[0]._redacted, '19 owner 快照无 _redacted 标记');

  const perm19SnapId = perm19SnapsOwner[0].id;
  const perm19SingleOwner = perm19DraftSvc.getSnapshot(perm19SnapId, '张编辑');
  check(perm19SingleOwner && perm19SingleOwner.content, '19 owner 通过 getSnapshot 能看到内容');

  const perm19SnapsNoOp = perm19DraftSvc.getSnapshotsByDraft(perm19DraftId, null);
  check(perm19SnapsNoOp.length === 1, '19 无 operator 时仍返回快照条目（数量一致）');
  check(perm19SnapsNoOp[0]._redacted === true, '19 无 operator 时快照标记 _redacted');
  check(perm19SnapsNoOp[0].content === undefined, '19 无 operator 时不能拿到快照正文（content 字段不存在）');
  check(perm19SnapsNoOp[0].reason === undefined, '19 无 operator 时不能拿到保存理由（reason 字段不存在）');
  check(perm19SnapsNoOp[0].createdBy === undefined, '19 无 operator 时不能拿到创建人信息（createdBy 不存在）');
  check(perm19SnapsNoOp[0].id !== undefined && perm19SnapsNoOp[0].baselineVersionNumber !== undefined, '19 无 operator 时仍可看到快照摘要字段（id/基线/时间）');

  const perm19SingleNoOp = perm19DraftSvc.getSnapshot(perm19SnapId, null);
  check(perm19SingleNoOp && perm19SingleNoOp._redacted === true, '19 无 operator 时 getSnapshot 返回 _redacted');
  check(perm19SingleNoOp.content === undefined, '19 无 operator 时 getSnapshot 拿不到正文');
  check(perm19SingleNoOp.reason === undefined, '19 无 operator 时 getSnapshot 拿不到理由');
  check(perm19SingleNoOp.createdBy === undefined, '19 无 operator 时 getSnapshot 拿不到创建人');

  const perm19SnapsOther = perm19DraftSvc.getSnapshotsByDraft(perm19DraftId, '李编辑');
  check(perm19SnapsOther.length === 1, '19 非 owner（李编辑）能看到快照条目数量');
  check(perm19SnapsOther[0]._redacted === true, '19 非 owner 快照标记 _redacted');
  check(perm19SnapsOther[0].content === undefined, '19 非 owner 看不到快照正文');
  check(perm19SnapsOther[0].reason === undefined, '19 非 owner 看不到保存理由');
  check(perm19SnapsOther[0].createdBy === undefined, '19 非 owner 看不到创建人信息');

  const perm19SingleOther = perm19DraftSvc.getSnapshot(perm19SnapId, '李编辑');
  check(perm19SingleOther && perm19SingleOther._redacted === true, '19 非 owner getSnapshot 返回 _redacted');
  check(perm19SingleOther.content === undefined && perm19SingleOther.reason === undefined, '19 非 owner getSnapshot 正文理由均脱敏');

  const perm19SnapsApprover = perm19DraftSvc.getSnapshotsByDraft(perm19DraftId, '李审批');
  check(perm19SnapsApprover.length === 1, '19 审批员（李审批）能看到快照条目');
  check(perm19SnapsApprover[0]._redacted === true, '19 审批员（approver角色）也不能跨用户读快照原文——权限收紧');
  check(perm19SnapsApprover[0].content === undefined, '19 审批员看不到快照正文');
  check(perm19SnapsApprover[0].reason === undefined, '19 审批员看不到快照理由');
  check(perm19SnapsApprover[0].createdBy === undefined, '19 审批员看不到快照创建人');

  // ---- 20. 修订日志导入：导出后再导入、重复导入冲突提示 ----
  console.log('\n【20】修订日志导入：导出再导入 + 重复导入冲突提示（不静默覆盖）');
  resetData();
  delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/document.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/revision.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/archive.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/audit-playback.js'))];

  const doc20 = require(path.join(ROOT, 'lib/document'));
  const rev20 = require(path.join(ROOT, 'lib/revision'));
  const arch20 = require(path.join(ROOT, 'lib/archive'));
  const audit20 = require(path.join(ROOT, 'lib/audit-playback'));

  const impDoc = doc20.importDocument('导入20测试文档', '导入初始内容', '张编辑');
  check(impDoc.document, '20 文档创建成功');
  const doc20Id = impDoc.document.id;

  const revA = rev20.createRevision(doc20Id, '修改内容A', '修订A理由', '张编辑');
  const revB = rev20.createRevision(doc20Id, '修改内容B', '修订B理由', '李编辑');
  arch20.approveAndPublish(revA.revision.id, '李审批');
  check(revA.revision && revB.revision, '20 提交两条修订并发布一条');

  const exportedLogs = arch20.exportRevisionLog(doc20Id);
  check(exportedLogs.length >= 4, '20 导出日志条数 >= 4（导入 + 2次提交 + 1次发布）');
  const origLogIds = exportedLogs.map(l => l.id);
  const origLogCount = exportedLogs.length;

  // 给 ID 加前缀模拟从另一个仓库导入，同时给 timestamp 加偏移避免和原生日志签名（DUPLICATE_SIGNATURE）冲突
  const simulatedLogs = exportedLogs.map((l, idx) => ({ 
    ...l, 
    id: 'sim20-' + l.id.slice(0, 12),
    timestamp: new Date(new Date(l.timestamp).getTime() + idx + 1).toISOString()
  }));

  const noOperatorImport = audit20.importRevisionLogs(exportedLogs, null, {});
  check(noOperatorImport.error === 'OPERATOR_REQUIRED', '20 不带操作者身份导入直接拒绝（OPERATOR_REQUIRED）');

  const validImport = audit20.importRevisionLogs(simulatedLogs, '李审批', { source: '导出备份 2026-01', notes: '20 测试导入' });
  check(validImport.error === undefined, '20 正常导入无错误返回');
  check(validImport.insertedCount === origLogCount && validImport.conflictCount === 0,
    '20 全新环境导入成功 ' + validImport.insertedCount + ' 条，冲突 0 条');
  check(validImport.batchId && validImport.importedAt, '20 导入返回批次ID和时间');
  const batch20 = validImport.batchId;

  // simulatedLogs 和 exportedLogs 的 documentId 相同，所以日志量 = 原生 + 导入
  const logsAfterFirst = arch20.exportRevisionLog(doc20Id);
  check(logsAfterFirst.length === origLogCount * 2, '20 成功导入后日志数量 = 原生 ' + origLogCount + ' + 导入 ' + origLogCount);

  const dupImport = audit20.importRevisionLogs(simulatedLogs, '李审批', { source: '重复导入测试' });
  check(dupImport.conflictCount === origLogCount,
    '20 重复导入同一批日志：冲突 ' + dupImport.conflictCount + ' 条，全部识别');
  check(dupImport.insertedCount === 0, '20 重复导入：新插入 0 条（全部冲突被跳过，未静默覆盖）');
  check(dupImport.conflicts && dupImport.conflicts.length === origLogCount, '20 重复导入返回 conflicts 数组，包含每条冲突详情');
  check(dupImport.conflicts.every(c => c.conflictType === 'DUPLICATE_ID'), '20 冲突类型标记为 DUPLICATE_ID');
  check(dupImport.conflicts.every(c => c.reason && c.reason.includes('已存在')), '20 每条冲突都有可读说明（含"已存在"字样）');

  const logsAfterDup = arch20.exportRevisionLog(doc20Id);
  check(logsAfterDup.length === origLogCount * 2, '20 重复导入后日志条数仍不变——没有串线没有覆盖');

  const modifiedLogs = exportedLogs.map(l => ({ ...l, id: origLogIds.includes(l.id) ? l.id : l.id, timestamp: l.timestamp }));
  const sigImport = audit20.importRevisionLogs(
    modifiedLogs.map(l => ({ ...l, id: 'sig-test-' + l.id.slice(0, 8) })),
    '李审批'
  );
  check(sigImport.conflicts.some(c => c.conflictType === 'DUPLICATE_SIGNATURE'),
    '20 改ID但相同签名（文档+动作+操作人+时间戳）也能识别为 DUPLICATE_SIGNATURE 冲突');

  const batchDetail = audit20.getImportedBatch(batch20);
  check(batchDetail && batchDetail.importBatchId === batch20, '20 通过 getImportedBatch 能查询到批次详情');
  check(batchDetail.importedBy === '李审批', '20 批次记录了导入操作人——能分清谁导入的');
  check(batchDetail.insertedCount === origLogCount, '20 批次记录了成功插入数量');

  const batchLogs = audit20.getImportedLogsByBatch(batch20);
  check(batchLogs.length === origLogCount, '20 getImportedLogsByBatch 返回 ' + origLogCount + ' 条该批次导入的实际日志');
  check(batchLogs.every(l => l._importBatchId === batch20), '20 导入日志均带 _importBatchId 标记，可追溯来源');

  const noPermImport = audit20.importRevisionLogs(exportedLogs, '陌生人', {});
  check(noPermImport.error === 'PERMISSION_DENIED', '20 无权限陌生人导入被 PERMISSION_DENIED 拒绝');

  const stratSkip = audit20.reimportWithStrategy(dupImport.batchId, 'skip', '李审批');
  check(stratSkip.skipped === origLogCount, '20 skip 策略跳过全部冲突（数量正确）');

  const stratOverwrite = audit20.reimportWithStrategy(dupImport.batchId, 'overwrite', '李审批');
  check(stratOverwrite.overwritten === origLogCount, '20 overwrite 策略覆盖了冲突条数');

  const stratEditor = audit20.reimportWithStrategy(dupImport.batchId, 'overwrite', '张编辑');
  check(stratEditor.error === 'PERMISSION_DENIED', '20 编辑员（非审批员）执行 reimport 被 PERMISSION_DENIED 拒绝');

  const stratForce = audit20.reimportWithStrategy(dupImport.batchId, 'force_new_id', '李审批');
  check(stratForce.newIds && stratForce.newIds.length === origLogCount, '20 force_new_id 策略生成了 ' + origLogCount + ' 个新ID插入');
  const logsAfterForce = arch20.exportRevisionLog(doc20Id);
  check(logsAfterForce.length === origLogCount * 3, '20 force_new_id 后日志条数 = 原生+初始导入+force新插入（' + origLogCount + '*3），不会覆盖原记录');

  // ---- 21. 审计回放流程：区分操作者 + 快照读取鉴权集成 ----
  console.log('\n【21】审计回放流程：区分操作者、快照读取鉴权集成在回放结果中');
  resetData();
  delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/document.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/audit-playback.js'))];

  const doc21 = require(path.join(ROOT, 'lib/document'));
  const draft21 = require(path.join(ROOT, 'lib/draft'));
  const audit21 = require(path.join(ROOT, 'lib/audit-playback.js'));

  const doc21Inst = doc21.importDocument('回放21测试文档', '初始', '张编辑');
  check(doc21Inst.document, '21 文档创建成功');
  const doc21Id = doc21Inst.document.id;

  const d1 = draft21.saveDraft(doc21Id, '张编辑草稿v1', '理由v1', '张编辑');
  draft21.updateDraft(d1.draft.id, '张编辑草稿v2', '理由v2', '张编辑');
  draft21.updateDraft(d1.draft.id, '张编辑草稿v3', '理由v3', '张编辑');

  const d2 = draft21.saveDraft(doc21Id, '李编辑草稿', '李理由', '李编辑');

  const arch21 = require(path.join(ROOT, 'lib/archive'));
  const all21Logs = arch21.exportRevisionLog(doc21Id);
  check(all21Logs.length >= 5, '21 收集到足够的日志（>=5 条）');
  const all21LogIds = all21Logs.map(l => l.id);

  const noOpPlayback = audit21.playbackRevisionLogs(all21LogIds, null, {});
  check(noOpPlayback.error === 'OPERATOR_REQUIRED', '21 无操作者回放被 OPERATOR_REQUIRED 拒绝');

  const editorPlayback = audit21.playbackRevisionLogs(all21LogIds, '张编辑', {});
  check(editorPlayback.error === 'PERMISSION_DENIED', '21 编辑员（非审批员）回放被 PERMISSION_DENIED 拒绝——仅审批员可回放');

  const approverPlayback1 = audit21.playbackRevisionLogs(all21LogIds, '李审批', { notes: '第一次回放' });
  check(approverPlayback1.error === undefined, '21 审批员李审批回放成功');
  check(approverPlayback1.logCount === all21LogIds.length, '21 回放日志数量匹配（' + approverPlayback1.logCount + '）');
  check(approverPlayback1.recordId && approverPlayback1.playbackAt, '21 回放返回记录ID和时间');
  check(approverPlayback1.summary && approverPlayback1.summary.actionBreakdown, '21 回放摘要包含动作分布');
  check(approverPlayback1.summary.operatorBreakdown && approverPlayback1.summary.operatorBreakdown['张编辑'], '21 回放摘要区分操作人，含张编辑计数');

  const approverPlayback2 = audit21.playbackRevisionLogs(all21LogIds, '赵审批', { notes: '第二次回放（不同人）' });
  check(approverPlayback2.recordId !== approverPlayback1.recordId, '21 不同操作者的回放记录有不同 recordId（不串线）');
  check(approverPlayback2.recordId && approverPlayback2.playbackAt, '21 赵审批回放也返回了记录ID');

  const records21 = audit21.getPlaybackRecords();
  check(records21.length === 2, '21 getPlaybackRecords 返回 2 条回放记录');
  const liPlayback = records21.find(r => r.playbackBy === '李审批');
  const zhaoPlayback = records21.find(r => r.playbackBy === '赵审批');
  check(liPlayback && zhaoPlayback, '21 回放记录按操作者区分：赵审批 和 李审批 各自一条');
  check(records21.every(r => r.summary && r.summary.timeRange), '21 每条回放记录都有时间范围摘要');

  const items21 = approverPlayback1.items;
  const snapItems21 = items21.filter(i => i.snapshotId);
  if (snapItems21.length > 0) {
    check(snapItems21.every(i => i.snapshotAccessible === false),
      '21 李审批（审批员）回放时，非自己创建的快照 snapshotAccessible=false——不能跨用户读原文');
  }

  const viewRecordNoOp = audit21.getPlaybackRecord(approverPlayback1.recordId, null);
  check(viewRecordNoOp && viewRecordNoOp._redacted === true, '21 无 viewer 查询回放记录返回 _redacted');
  check(viewRecordNoOp.items === undefined, '21 无 viewer 查询回放记录没有 items 明细');

  const viewRecordOther = audit21.getPlaybackRecord(approverPlayback1.recordId, '张编辑');
  check(viewRecordOther && viewRecordOther._redacted === true, '21 非回放人（张编辑）查看回放明细被 _redacted');

  const viewRecordOwner = audit21.getPlaybackRecord(approverPlayback1.recordId, '李审批');
  check(viewRecordOwner && !viewRecordOwner._redacted && viewRecordOwner.items, '21 回放创建人自己可以看完整明细');

  const viewRecordOtherApprover = audit21.getPlaybackRecord(approverPlayback1.recordId, '赵审批');
  check(viewRecordOtherApprover && !viewRecordOtherApprover._redacted, '21 其他审批员（赵审批）也能看回放完整明细（canApproveAndPublish）');

  // ---- 22. 重启后一致性：导入批次、回放记录、快照可见性 ----
  console.log('\n【22】持久化一致性：重启后导入结果、回放记录、快照权限仍一致');
  const batchesBeforeReboot = audit21.getImportedBatches();
  const playbacksBeforeReboot = audit21.getPlaybackRecords();
  const snapListBefore = draft21.getSnapshotsByDraft(d1.draft.id, '张编辑');
  const snapRedactedBefore = draft21.getSnapshotsByDraft(d1.draft.id, null);

  check(batchesBeforeReboot.length >= 0, '22 重启前导入批次已读');
  check(playbacksBeforeReboot.length === 2, '22 重启前回放记录为 2 条');
  check(snapListBefore.length >= 1 && snapListBefore[0].content, '22 重启前 owner 快照内容可读');
  check(snapRedactedBefore[0]._redacted === true, '22 重启前无 operator 快照已脱敏');

  delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/audit-playback.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];

  const store22 = require(path.join(ROOT, 'lib/store'));
  const audit22 = require(path.join(ROOT, 'lib/audit-playback'));
  const draft22 = require(path.join(ROOT, 'lib/draft'));

  const db22 = store22.read();
  check(Array.isArray(db22.importedLogs), '22 db.json 中 importedLogs 字段存在且为数组');
  check(Array.isArray(db22.playbackRecords), '22 db.json 中 playbackRecords 字段存在且为数组');

  const batchesAfterReboot = audit22.getImportedBatches();
  check(batchesAfterReboot.length === batchesBeforeReboot.length, '22 重启后导入批次数量不变');
  if (batchesBeforeReboot.length > 0) {
    check(batchesAfterReboot[0].importBatchId === batchesBeforeReboot[0].importBatchId, '22 重启后导入批次ID一致');
    check(batchesAfterReboot[0].importedBy === batchesBeforeReboot[0].importedBy, '22 重启后导入操作人一致（不串线）');
  }

  const playbacksAfterReboot = audit22.getPlaybackRecords();
  check(playbacksAfterReboot.length === 2, '22 重启后回放记录数量仍为 2');
  check(playbacksAfterReboot[0].recordId === playbacksBeforeReboot[0].recordId, '22 重启后回放记录ID一致');
  check(playbacksAfterReboot[0].playbackBy === playbacksBeforeReboot[0].playbackBy, '22 重启后回放操作者一致（不串线）');
  check(playbacksAfterReboot[0].summary.actionBreakdown, '22 重启后回放摘要动作分布未丢失');

  const snapListAfter = draft22.getSnapshotsByDraft(d1.draft.id, '张编辑');
  check(snapListAfter.length === snapListBefore.length, '22 重启后快照数量一致');
  check(snapListAfter[0].content === snapListBefore[0].content, '22 重启后 owner 快照内容一致');
  check(snapListAfter[0].reason === snapListBefore[0].reason, '22 重启后 owner 快照理由一致');
  check(snapListAfter[0].createdBy === snapListBefore[0].createdBy, '22 重启后 owner 快照创建人一致');

  const snapRedactedAfter = draft22.getSnapshotsByDraft(d1.draft.id, null);
  check(snapRedactedAfter[0]._redacted === true, '22 重启后无 operator 快照权限仍生效（_redacted）');
  check(snapRedactedAfter[0].content === undefined, '22 重启后无 operator 快照内容仍脱敏');
  check(snapRedactedAfter[0].reason === undefined, '22 重启后无 operator 快照理由仍脱敏');
  check(snapRedactedAfter[0].createdBy === undefined, '22 重启后无 operator 快照创建人仍脱敏');

  const snapOtherAfter = draft22.getSnapshotsByDraft(d1.draft.id, '王编辑');
  check(snapOtherAfter[0]._redacted === true, '22 重启后非 owner（王编辑）快照权限仍生效——内容脱敏');
  check(snapOtherAfter[0].content === undefined && snapOtherAfter[0].createdBy === undefined, '22 重启后非 owner 正文+创建人都拿不到');

  const snapApproverAfter = draft22.getSnapshotsByDraft(d1.draft.id, '李审批');
  check(snapApproverAfter[0]._redacted === true, '22 重启后审批员（李审批）也不能跨用户读快照原文——权限收紧');
  check(snapApproverAfter[0].content === undefined && snapApproverAfter[0].reason === undefined, '22 审批员也拿不到正文和保存理由');
  check(snapApproverAfter[0].createdBy === undefined, '22 审批员也拿不到创建人信息');

  // ---- 23. 回归测试：草稿列表/详情权限 ----
  console.log('\n【23】回归：草稿列表页和详情页对非 owner 脱敏');
  resetData();
  delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/document.js'))];

  const regDocSvc = require(path.join(ROOT, 'lib/document'));
  const regSvc = require(path.join(ROOT, 'lib/draft'));

  const regDoc = regDocSvc.importDocument('回归测试文档', '初始内容', '张编辑');
  const regDraft = regSvc.saveDraft(regDoc.document.id, '张编辑正文', '张编辑理由', '张编辑');
  regSvc.updateDraft(regDraft.draft.id, '张编辑正文v2', '张编辑理由v2', '张编辑');

  const ownerDraftList = regSvc.getDraftsByDoc(regDoc.document.id, '张编辑');
  check(ownerDraftList.length >= 1, '23 owner 能看到自己的草稿列表');
  check(ownerDraftList[0].content === '张编辑正文v2', '23 owner 能看到草稿正文');
  check(ownerDraftList[0].reason === '张编辑理由v2', '23 owner 能看到保存理由');
  check(ownerDraftList[0].createdBy === '张编辑', '23 owner 能看到创建人');
  check(!ownerDraftList[0]._redacted, '23 owner 草稿无 _redacted 标记');

  const ownerDraftDetail = regSvc.getDraft(regDraft.draft.id, '张编辑');
  check(ownerDraftDetail.content === '张编辑正文v2', '23 owner 详情页能看到正文');
  check(ownerDraftDetail.reason === '张编辑理由v2', '23 owner 详情页能看到理由');
  check(ownerDraftDetail.createdBy === '张编辑', '23 owner 详情页能看到创建人');

  const noOpDraftList = regSvc.getDraftsByDoc(regDoc.document.id, null);
  check(noOpDraftList.length >= 1, '23 无 operator 也能看到草稿条目');
  check(noOpDraftList[0]._redacted === true, '23 无 operator 草稿有 _redacted 标记');
  check(noOpDraftList[0].content === undefined, '23 无 operator 看不到正文');
  check(noOpDraftList[0].reason === undefined, '23 无 operator 看不到理由');
  check(noOpDraftList[0].createdBy === undefined, '23 无 operator 看不到创建人');

  const noOpDraftDetail = regSvc.getDraft(regDraft.draft.id, null);
  check(noOpDraftDetail._redacted === true, '23 无 operator 详情页 _redacted');
  check(noOpDraftDetail.content === undefined, '23 无 operator 详情页看不到正文');

  const otherDraftList = regSvc.getDraftsByDoc(regDoc.document.id, '王编辑');
  check(otherDraftList.length >= 1, '23 非 owner 能看到草稿条目');
  check(otherDraftList[0]._redacted === true, '23 非 owner 草稿有 _redacted 标记');
  check(otherDraftList[0].content === undefined, '23 非 owner 看不到正文');
  check(otherDraftList[0].reason === undefined, '23 非 owner 看不到理由');
  check(otherDraftList[0].createdBy === undefined, '23 非 owner 看不到创建人');

  const otherDraftDetail = regSvc.getDraft(regDraft.draft.id, '王编辑');
  check(otherDraftDetail._redacted === true, '23 非 owner 详情页 _redacted');
  check(otherDraftDetail.content === undefined, '23 非 owner 详情页看不到正文');
  check(otherDraftDetail.reason === undefined, '23 非 owner 详情页看不到理由');
  check(otherDraftDetail.createdBy === undefined, '23 非 owner 详情页看不到创建人');

  const approverDraftList = regSvc.getDraftsByDoc(regDoc.document.id, '李审批');
  check(approverDraftList.length >= 1, '23 审批员能看到草稿条目（canViewAllDrafts）');
  check(approverDraftList[0].content !== undefined, '23 审批员能看到草稿正文（canViewAllDrafts）');
  check(approverDraftList[0].reason !== undefined, '23 审批员能看到草稿理由（canViewAllDrafts）');
  check(approverDraftList[0].createdBy !== undefined, '23 审批员能看到草稿创建人（canViewAllDrafts）');
  check(!approverDraftList[0]._redacted, '23 审批员草稿无 _redacted 标记');

  // ---- 24. 回归测试：快照列表/详情权限 ----
  console.log('\n【24】回归：快照列表页和详情页对非 owner 脱敏');
  const regSnaps = regSvc.getSnapshotsByDraft(regDraft.draft.id, '张编辑');
  check(regSnaps.length >= 1, '24 owner 能看到自己的快照');
  check(regSnaps[0].content !== undefined, '24 owner 能看到快照正文');
  check(regSnaps[0].reason !== undefined, '24 owner 能看到快照理由');
  check(regSnaps[0].createdBy === '张编辑', '24 owner 能看到快照创建人');

  const noOpSnaps = regSvc.getSnapshotsByDraft(regDraft.draft.id, null);
  check(noOpSnaps.length >= 1, '24 无 operator 能看到快照条目');
  check(noOpSnaps[0]._redacted === true, '24 无 operator 快照 _redacted');
  check(noOpSnaps[0].content === undefined, '24 无 operator 看不到快照正文');
  check(noOpSnaps[0].reason === undefined, '24 无 operator 看不到快照理由');
  check(noOpSnaps[0].createdBy === undefined, '24 无 operator 看不到快照创建人');

  const otherSnaps = regSvc.getSnapshotsByDraft(regDraft.draft.id, '王编辑');
  check(otherSnaps.length >= 1, '24 非 owner 能看到快照条目');
  check(otherSnaps[0]._redacted === true, '24 非 owner 快照 _redacted');
  check(otherSnaps[0].content === undefined, '24 非 owner 看不到快照正文');
  check(otherSnaps[0].reason === undefined, '24 非 owner 看不到快照理由');
  check(otherSnaps[0].createdBy === undefined, '24 非 owner 看不到快照创建人');

  const approverSnaps = regSvc.getSnapshotsByDraft(regDraft.draft.id, '李审批');
  check(approverSnaps.length >= 1, '24 审批员能看到快照条目');
  check(approverSnaps[0]._redacted === true, '24 审批员快照也 _redacted——不能跨用户读快照原文');
  check(approverSnaps[0].content === undefined, '24 审批员看不到快照正文');
  check(approverSnaps[0].reason === undefined, '24 审批员看不到快照理由');
  check(approverSnaps[0].createdBy === undefined, '24 审批员看不到快照创建人');

  const singleSnapId = regSnaps[0].id;
  const ownerSingle = regSvc.getSnapshot(singleSnapId, '张编辑');
  check(ownerSingle.content !== undefined, '24 owner 详情页能看到快照正文');

  const otherSingle = regSvc.getSnapshot(singleSnapId, '王编辑');
  check(otherSingle._redacted === true, '24 非 owner 详情页快照 _redacted');
  check(otherSingle.content === undefined, '24 非 owner 详情页看不到快照正文');

  const approverSingle = regSvc.getSnapshot(singleSnapId, '李审批');
  check(approverSingle._redacted === true, '24 审批员详情页快照也 _redacted');
  check(approverSingle.content === undefined, '24 审批员详情页看不到快照正文');

  // ---- 25. 回归测试：导出后再导入，不串线 ----
  console.log('\n【25】回归：导出后再导入，草稿和快照归属正确，不串线');
  resetData();
  const store25 = require(path.join(ROOT, 'lib/store'));
  const draft25 = require(path.join(ROOT, 'lib/draft'));
  const doc25 = require(path.join(ROOT, 'lib/document'));

  const docA = doc25.importDocument('用户A文档', 'A初始', '张编辑');
  const dA = draft25.saveDraft(docA.document.id, 'A草稿v1', 'A理由v1', '张编辑');
  draft25.updateDraft(dA.draft.id, 'A草稿v2', 'A理由v2', '张编辑');

  const docB = doc25.importDocument('用户B文档', 'B初始', '王编辑');
  const dB = draft25.saveDraft(docB.document.id, 'B草稿v1', 'B理由v1', '王编辑');
  draft25.updateDraft(dB.draft.id, 'B草稿v2', 'B理由v2', '王编辑');

  const exportData = store25.exportAll();
  const expSnapA = Object.values(exportData.draftSnapshots).find(s => s.createdBy === '张编辑');
  const expSnapB = Object.values(exportData.draftSnapshots).find(s => s.createdBy === '王编辑');
  check(expSnapA && expSnapA.content === 'A草稿v1', '25 导出中张编辑快照内容正确');
  check(expSnapB && expSnapB.content === 'B草稿v1', '25 导出中王编辑快照内容正确');

  resetData();
  const importResult = store25.importData(exportData, '李审批');
  check(importResult.success === true, '25 导入成功');
  check(importResult.batchId !== undefined, '25 导入返回批次ID');
  check(importResult.importedBy === '李审批', '25 导入记录了操作人');

  const impData = store25.read();
  const impDraftA = Object.values(impData.drafts).find(d => d.createdBy === '张编辑');
  const impDraftB = Object.values(impData.drafts).find(d => d.createdBy === '王编辑');
  check(impDraftA && impDraftA.content === 'A草稿v2', '25 导入后张编辑草稿内容正确——不串线');
  check(impDraftB && impDraftB.content === 'B草稿v2', '25 导入后王编辑草稿内容正确——不串线');
  check(impDraftA._importBatchId === importResult.batchId, '25 导入的草稿带批次标记');

  const impSnapA = Object.values(impData.draftSnapshots).find(s => s.createdBy === '张编辑');
  const impSnapB = Object.values(impData.draftSnapshots).find(s => s.createdBy === '王编辑');
  check(impSnapA && impSnapA.content === 'A草稿v1', '25 导入后张编辑快照内容正确——不串线');
  check(impSnapB && impSnapB.content === 'B草稿v1', '25 导入后王编辑快照内容正确——不串线');

  const ownerViewA = draft25.getSnapshotsByDraft(impDraftA.id, '张编辑');
  check(ownerViewA.length >= 1 && ownerViewA[0].content === 'A草稿v1', '25 张编辑能看到自己导入的快照内容');

  const otherViewA = draft25.getSnapshotsByDraft(impDraftA.id, '王编辑');
  check(otherViewA.length >= 1 && otherViewA[0]._redacted === true, '25 王编辑看不到张编辑导入的快照内容');

  // ---- 26. 回归测试：重复导入冲突处理 ----
  console.log('\n【26】回归：重复导入同一批日志有明确冲突处理，不静默覆盖');
  const import2Again = store25.importData(exportData, '李审批');
  check(import2Again.success === true, '26 重复导入也返回成功（不报错）');
  check(import2Again.conflictCount > 0, '26 重复导入返回 conflictCount>0，明确告知冲突');
  check(import2Again.warnings && import2Again.warnings.length > 0, '26 重复导入返回 warnings 提示');
  check(import2Again.insertedCount === 0, '26 重复导入不插入新记录');
  check(import2Again.batchId !== importResult.batchId, '26 每次导入有独立批次ID');

  const import2Conflicts = import2Again.conflicts;
  check(import2Conflicts.some(c => c.type === 'document'), '26 冲突类型包含 document');
  check(import2Conflicts.some(c => c.type === 'draft'), '26 冲突类型包含 draft');
  check(import2Conflicts.some(c => c.type === 'snapshot'), '26 冲突类型包含 snapshot');
  import2Conflicts.slice(0, 3).forEach(c => {
    check(c.reason && c.reason.includes('已存在'), '26 冲突记录有明确原因说明：' + c.reason);
  });

  // ---- 27. 回归测试：导入归属权冲突拦截 ----
  console.log('\n【27】回归：导入时检测归属权冲突，防止串到别人的快照上');
  resetData();
  const store27 = require(path.join(ROOT, 'lib/store'));
  const doc27Svc = require(path.join(ROOT, 'lib/document'));

  const existingDoc = doc27Svc.importDocument('现有文档', '现有内容', '张编辑');
  const tamperedExport = JSON.parse(JSON.stringify(exportData));
  tamperedExport.drafts[Object.keys(tamperedExport.drafts)[0]].documentId = existingDoc.document.id;
  tamperedExport.drafts[Object.keys(tamperedExport.drafts)[0]].createdBy = '王编辑';

  const tamperResult = store27.importData(tamperedExport, '李审批');
  check(tamperResult.ownershipIssueCount > 0, '27 归属权冲突检测生效，返回 ownershipIssueCount>0');
  check(tamperResult.ownershipIssues.some(i => i.reason.includes('归属冲突')), '27 归属权冲突有明确提示');
  check(tamperResult.warnings.some(w => w.includes('归属权冲突')), '27 归属权冲突有警告提示');

  // ---- 28. 回归测试：重启后权限与回放结果一致 ----
  console.log('\n【28】回归：重启后所有权限规则仍然生效，回放记录可追溯');
  resetData();
  const store28 = require(path.join(ROOT, 'lib/store'));
  const draft28 = require(path.join(ROOT, 'lib/draft'));
  const doc28 = require(path.join(ROOT, 'lib/document'));
  const audit28 = require(path.join(ROOT, 'lib/audit-playback'));
  const arch28 = require(path.join(ROOT, 'lib/archive'));

  const doc28A = doc28.importDocument('重启测试文档A', '内容A', '张编辑');
  const d28A = draft28.saveDraft(doc28A.document.id, '草稿A', '理由A', '张编辑');
  draft28.updateDraft(d28A.draft.id, '草稿A2', '理由A2', '张编辑');
  draft28.updateDraft(d28A.draft.id, '草稿A3', '理由A3', '张编辑');

  const logs28 = arch28.exportRevisionLog(doc28A.document.id);
  const logIds28 = logs28.map(l => l.id);

  const playbackBefore = audit28.playbackRevisionLogs(logIds28, '李审批', { notes: '重启前回放' });
  check(playbackBefore.recordId !== undefined, '28 重启前回放成功');
  const playbackSnapItemsBefore = playbackBefore.items.filter(i => i.snapshotId);
  check(playbackSnapItemsBefore.every(i => i.snapshotAccessible === false), '28 重启前审批员回放非自己的快照 snapshotAccessible=false');

  delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/draft.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/audit-playback.js'))];

  const store28After = require(path.join(ROOT, 'lib/store'));
  const draft28After = require(path.join(ROOT, 'lib/draft'));
  const audit28After = require(path.join(ROOT, 'lib/audit-playback'));

  const dbAfter = store28After.read();
  check(Array.isArray(dbAfter.dataImports), '28 db.json 中 dataImports 字段存在');

  const noOpSnapAfter = draft28After.getSnapshotsByDraft(d28A.draft.id, null);
  check(noOpSnapAfter[0]._redacted === true, '28 重启后无 operator 快照仍脱敏');
  check(noOpSnapAfter[0].content === undefined, '28 重启后无 operator 快照正文仍脱敏');
  check(noOpSnapAfter[0].reason === undefined, '28 重启后无 operator 快照理由仍脱敏');
  check(noOpSnapAfter[0].createdBy === undefined, '28 重启后无 operator 快照创建人仍脱敏');

  const otherSnapAfter = draft28After.getSnapshotsByDraft(d28A.draft.id, '王编辑');
  check(otherSnapAfter[0]._redacted === true, '28 重启后非 owner 快照仍脱敏');
  check(otherSnapAfter[0].content === undefined, '28 重启后非 owner 正文仍脱敏');
  check(otherSnapAfter[0].createdBy === undefined, '28 重启后非 owner 创建人仍脱敏');

  const approverSnapAfter = draft28After.getSnapshotsByDraft(d28A.draft.id, '李审批');
  check(approverSnapAfter[0]._redacted === true, '28 重启后审批员跨用户快照仍脱敏');
  check(approverSnapAfter[0].content === undefined, '28 重启后审批员跨用户正文仍拿不到');
  check(approverSnapAfter[0].reason === undefined, '28 重启后审批员跨用户理由仍拿不到');
  check(approverSnapAfter[0].createdBy === undefined, '28 重启后审批员跨用户创建人仍拿不到');

  const ownerSnapAfter = draft28After.getSnapshotsByDraft(d28A.draft.id, '张编辑');
  check(ownerSnapAfter[0]._redacted !== true, '28 重启后 owner 快照仍可读');
  check(ownerSnapAfter[0].content === '草稿A2', '28 重启后 owner 快照内容正确');
  check(ownerSnapAfter[0].reason === '理由A2', '28 重启后 owner 快照理由正确');
  check(ownerSnapAfter[0].createdBy === '张编辑', '28 重启后 owner 快照创建人正确');

  const noOpDraftAfter = draft28After.getDraft(d28A.draft.id, null);
  check(noOpDraftAfter._redacted === true, '28 重启后无 operator 草稿仍脱敏');
  check(noOpDraftAfter.content === undefined, '28 重启后无 operator 草稿正文仍脱敏');

  const otherDraftAfter = draft28After.getDraft(d28A.draft.id, '王编辑');
  check(otherDraftAfter._redacted === true, '28 重启后非 owner 草稿仍脱敏');
  check(otherDraftAfter.content === undefined, '28 重启后非 owner 草稿正文仍脱敏');

  const playbackAfter = audit28After.getPlaybackRecord(playbackBefore.recordId, '李审批');
  check(playbackAfter && !playbackAfter._redacted, '28 重启后回放记录仍可读');
  check(playbackAfter.items, '28 重启后回放记录 items 仍存在');
  check(playbackAfter.playbackBy === '李审批', '28 重启后回放操作人正确——不串线');
  check(playbackAfter.notes === '重启前回放', '28 重启后回放备注正确');

  const playbackSnapAfter = playbackAfter.items.filter(i => i.snapshotId);
  check(playbackSnapAfter.every(i => i.snapshotAccessible === false), '28 重启后回放记录中快照权限仍一致——非owner不可访问');

  const batchesAfter = audit28After.getImportedBatches();
  check(Array.isArray(batchesAfter), '28 重启后导入批次仍可查询');

  // ---- 29. 批次追溯中心：导入、导出后再导入、重复导入冲突、权限校验、重启恢复 ----
  console.log('\n【29】批次追溯中心：完整链路验收');
  resetData();
  delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/batch-trace.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/auth.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/document.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/archive.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/audit-playback.js'))];

  const batchStore = require(path.join(ROOT, 'lib/store'));
  const batchSvc = require(path.join(ROOT, 'lib/batch-trace'));
  const batchAuth = require(path.join(ROOT, 'lib/auth'));
  const batchDoc = require(path.join(ROOT, 'lib/document'));
  const batchArch = require(path.join(ROOT, 'lib/archive'));
  const batchAudit = require(path.join(ROOT, 'lib/audit-playback'));

  check(fileExists('lib/batch-trace.js'), '29 lib/batch-trace.js 存在');

  const btDoc = batchDoc.importDocument('批次追溯测试文档', '批次初始内容', '张编辑');
  check(btDoc.document, '29 文档创建成功');
  const btDocId = btDoc.document.id;

  const btRev = require(path.join(ROOT, 'lib/revision'));
  btRev.createRevision(btDocId, '批次修改A', '批次修订A理由', '张编辑');
  btRev.createRevision(btDocId, '批次修改B', '批次修订B理由', '李编辑');
  const btArch = require(path.join(ROOT, 'lib/archive'));

  const btExportedLogs = batchArch.exportRevisionLog(btDocId);
  check(btExportedLogs.length >= 3, '29 导出日志 >= 3 条');
  const btLogs = btExportedLogs.map((l, i) => ({
    ...l,
    id: 'bt-' + l.id.slice(0, 12),
    timestamp: new Date(new Date(l.timestamp).getTime() + i + 100).toISOString()
  }));

  const noOpBatch = batchSvc.createBatch(btLogs, null, {});
  check(noOpBatch.error === 'OPERATOR_REQUIRED', '29 无操作人创建批次被 OPERATOR_REQUIRED 拒绝');

  const strangerBatch = batchSvc.createBatch(btLogs, '陌生人', {});
  check(strangerBatch.error === 'PERMISSION_DENIED', '29 陌生人创建批次被 PERMISSION_DENIED 拒绝');

  const editorBatch = batchSvc.createBatch(btLogs, '张编辑', {});
  check(editorBatch.error === 'PERMISSION_DENIED', '29 编辑员创建批次被 PERMISSION_DENIED 拒绝');

  const validBatch = batchSvc.createBatch(btLogs, '李审批', { source: '批次测试', notes: '29 测试' });
  check(validBatch.error === undefined && validBatch.batchId, '29 审批员创建批次成功');
  check(validBatch.insertedCount > 0, '29 批次导入插入了 ' + validBatch.insertedCount + ' 条日志');
  check(validBatch.sourceDigest && validBatch.sourceDigest.length > 0, '29 返回了来源文件摘要');
  check(validBatch.contentFingerprint && validBatch.contentFingerprint.length > 0, '29 返回了内容指纹');
  const btBatchId = validBatch.batchId;

  const dupReject = batchSvc.createBatch(btLogs, '李审批', { conflictStrategy: 'reject' });
  check(dupReject.error === 'DUPLICATE_IMPORT', '29 默认 reject 策略：重复导入被 DUPLICATE_IMPORT 拦截');
  check(dupReject.existingBatchId === btBatchId, '29 重复导入告知已有批次ID');

  const dupSkip = batchSvc.createBatch(btLogs, '李审批', { conflictStrategy: 'skip' });
  check(dupSkip.skipped === true, '29 skip 策略：重复导入被跳过');

  const dupMerge = batchSvc.createBatch(btLogs, '李审批', { conflictStrategy: 'merge', source: '合并测试' });
  check(dupMerge.batchId && dupMerge.batchId !== btBatchId, '29 merge 策略：生成了新批次ID');
  check(dupMerge.insertedCount > 0, '29 merge 策略：插入了 ' + dupMerge.insertedCount + ' 条（重新生成ID）');
  const mergeBatchId = dupMerge.batchId;

  const batches = batchSvc.getBatches();
  check(batches.length >= 2, '29 批次列表有 ' + batches.length + ' 个批次');

  const batchesByImporter = batchSvc.getBatches({ importedBy: '李审批' });
  check(batchesByImporter.length === batches.length, '29 按导入人筛选正确');

  const ownerBatchDetail = batchSvc.getBatch(btBatchId, '李审批');
  check(ownerBatchDetail && ownerBatchDetail.batchId === btBatchId, '29 owner 能查看批次详情');
  check(!ownerBatchDetail._redacted, '29 owner 批次详情无 _redacted');
  check(ownerBatchDetail.sourceDigest !== undefined, '29 owner 能看到来源摘要');
  check(ownerBatchDetail.contentFingerprint !== undefined, '29 owner 能看到内容指纹');
  check(ownerBatchDetail.conflicts !== undefined, '29 owner 能看到冲突明细');

  const nonOwnerBatchDetail = batchSvc.getBatch(btBatchId, '张编辑');
  check(nonOwnerBatchDetail && nonOwnerBatchDetail._redacted === true, '29 非 owner 查看批次详情被 _redacted');
  check(nonOwnerBatchDetail.sourceDigest === undefined, '29 非 owner 看不到来源摘要');
  check(nonOwnerBatchDetail.contentFingerprint === undefined, '29 非 owner 看不到内容指纹');
  check(nonOwnerBatchDetail.conflicts === undefined, '29 非 owner 看不到冲突明细');

  const noViewerBatchDetail = batchSvc.getBatch(btBatchId, null);
  check(noViewerBatchDetail && noViewerBatchDetail._redacted === true, '29 无 viewer 批次详情被 _redacted');

  const btBatchLogs = batchSvc.getLogsByBatch(btBatchId);
  check(btBatchLogs.length > 0, '29 按批次查日志有 ' + btBatchLogs.length + ' 条');
  check(btBatchLogs.every(l => l._importBatchId === btBatchId), '29 批次日志都带 _importBatchId');

  const batchPlaybacks = batchSvc.getPlaybacksByBatch(btBatchId);
  check(Array.isArray(batchPlaybacks), '29 按批次查回放返回数组');

  const allLogIds = batchArch.exportRevisionLog(btDocId).map(l => l.id);
  const btPlayback = batchAudit.playbackRevisionLogs(
    btBatchLogs.slice(0, 2).map(l => l.id),
    '李审批',
    { notes: '批次回放测试' }
  );
  check(btPlayback.recordId, '29 从批次日志执行回放成功');

  const playbacksAfter = batchSvc.getPlaybacksByBatch(btBatchId);
  check(playbacksAfter.length >= 1, '29 批次有 ' + playbacksAfter.length + ' 条关联回放');

  const exportAuditOwner = batchSvc.exportBatchAuditSummary(btBatchId, '李审批');
  check(exportAuditOwner.batchId === btBatchId, '29 owner 导出审计摘要成功');
  check(exportAuditOwner.sourceDigest !== undefined, '29 审计摘要含来源摘要');
  check(exportAuditOwner.contentFingerprint !== undefined, '29 审计摘要含指纹');
  check(exportAuditOwner.playbackCount >= 0, '29 审计摘要含回放数量');
  check(exportAuditOwner.exportedBy === '李审批', '29 审计摘要含导出人');
  check(exportAuditOwner.exportedAt, '29 审计摘要含导出时间');

  const exportAuditNonOwner = batchSvc.exportBatchAuditSummary(btBatchId, '张编辑');
  check(exportAuditNonOwner.error === 'PERMISSION_DENIED', '29 非 owner 导出审计摘要被 PERMISSION_DENIED 拒绝');

  const exportAuditApprover = batchSvc.exportBatchAuditSummary(btBatchId, '赵审批');
  check(exportAuditApprover.batchId === btBatchId, '29 审批员可导出审计摘要');

  const mergeDetail = batchSvc.getBatch(mergeBatchId, '李审批');
  check(mergeDetail.mergedFrom === btBatchId, '29 merge 批次记录了 mergedFrom');

  const reimportResult = batchSvc.reimportBatchWithStrategy(btBatchId, 'overwrite', '张编辑');
  check(reimportResult.error === 'PERMISSION_DENIED', '29 编辑员重导入被 PERMISSION_DENIED 拒绝');

  // ---- 29.5 重启后批次追溯一致性 ----
  console.log('\n【29.5】批次追溯：重启后批次、回放映射和冲突日志一致');
  const batchDataBefore = batchStore.read();
  const importBatchesBefore = batchDataBefore.importBatches || [];
  check(importBatchesBefore.length >= 2, '29.5 重启前有 ' + importBatchesBefore.length + ' 个批次');

  delete require.cache[require.resolve(path.join(ROOT, 'lib/store.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/batch-trace.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lib/audit-playback.js'))];

  const batchStoreAfter = require(path.join(ROOT, 'lib/store'));
  const batchSvcAfter = require(path.join(ROOT, 'lib/batch-trace'));
  const batchAuditAfter = require(path.join(ROOT, 'lib/audit-playback'));

  const batchDataAfter = batchStoreAfter.read();
  check(Array.isArray(batchDataAfter.importBatches), '29.5 重启后 importBatches 字段存在');
  check(batchDataAfter.importBatches.length === importBatchesBefore.length, '29.5 重启后批次数不变');

  const rebootOwnerBatch = batchSvcAfter.getBatch(btBatchId, '李审批');
  check(rebootOwnerBatch && !rebootOwnerBatch._redacted, '29.5 重启后 owner 仍能查看批次完整详情');
  check(rebootOwnerBatch.sourceDigest === ownerBatchDetail.sourceDigest, '29.5 重启后来源摘要一致');
  check(rebootOwnerBatch.contentFingerprint === ownerBatchDetail.contentFingerprint, '29.5 重启后指纹一致');

  const rebootNonOwnerBatch = batchSvcAfter.getBatch(btBatchId, '张编辑');
  check(rebootNonOwnerBatch && rebootNonOwnerBatch._redacted === true, '29.5 重启后非 owner 仍被 _redacted');

  const rebootExportAudit = batchSvcAfter.exportBatchAuditSummary(btBatchId, '李审批');
  check(rebootExportAudit.batchId === btBatchId, '29.5 重启后仍能导出审计摘要');

  const rebootPlaybacks = batchSvcAfter.getPlaybacksByBatch(btBatchId);
  check(rebootPlaybacks.length === playbacksAfter.length, '29.5 重启后批次的回放映射数不变');

  // ---- 29.6 批次追溯前端和 CLI 入口可见性 ----
  console.log('\n【29.6】批次追溯：前端入口和文件可见性');
  const batchHtml = readFile('public/index.html');
  check(batchHtml.includes('data-tab="batch"'), '29.6 index.html 有批次追溯标签页入口');
  check(batchHtml.includes('tab-batch'), '29.6 index.html 有批次追溯内容区');
  check(batchHtml.includes('batchImportBtn'), '29.6 index.html 有批次导入按钮');
  check(batchHtml.includes('batchImportFile'), '29.6 index.html 有批次导入文件选择');
  check(batchHtml.includes('batchConflictStrategy'), '29.6 index.html 有重复导入冲突策略选择');
  check(batchHtml.includes('batchList'), '29.6 index.html 有批次列表容器');
  check(batchHtml.includes('batchDetailSection'), '29.6 index.html 有批次详情区域');
  check(batchHtml.includes('batchExportAuditBtn'), '29.6 index.html 有导出审计摘要按钮');
  check(batchHtml.includes('batchFilterImporter'), '29.6 index.html 有导入人筛选');
  check(batchHtml.includes('脱敏'), '29.6 index.html 批次追溯有脱敏说明');
  check(batchHtml.includes('指纹'), '29.6 index.html 批次追溯有指纹说明');

  const batchAppJs = readFile('public/app.js');
  check(batchAppJs.includes('/batch-trace/import'), '29.6 app.js 调用批次导入 API');
  check(batchAppJs.includes('/batch-trace/batches'), '29.6 app.js 调用批次列表 API');
  check(batchAppJs.includes('batchImportBtn'), '29.6 app.js 处理批次导入按钮');
  check(batchAppJs.includes('refreshBatchList'), '29.6 app.js 刷新批次列表');
  check(batchAppJs.includes('loadBatchDetail'), '29.6 app.js 加载批次详情');
  check(batchAppJs.includes('batchExportAuditBtn'), '29.6 app.js 处理导出审计摘要按钮');
  check(batchAppJs.includes('batchFilterImporter'), '29.6 app.js 读取导入人筛选参数');

  const batchCss = readFile('public/style.css');
  check(batchCss.includes('.batch-card'), '29.6 style.css 有批次卡片样式');
  check(batchCss.includes('.batch-detail-card'), '29.6 style.css 有批次详情样式');

  const batchReadme = readFile('README.md');
  check(batchReadme.includes('批次追溯'), '29.6 README 描述了批次追溯');
  check(batchReadme.includes('batch-trace'), '29.6 README 记录了 batch-trace API');
  check(batchReadme.includes('DUPLICATE_IMPORT'), '29.6 README 记录了 DUPLICATE_IMPORT 冲突检测');
  check(batchReadme.includes('sourceDigest'), '29.6 README 记录了来源摘要字段');
  check(batchReadme.includes('contentFingerprint'), '29.6 README 记录了内容指纹字段');
  check(batchReadme.includes('importBatches'), '29.6 README 记录了 importBatches 持久化字段');
  check(batchReadme.includes('canViewBatchDetail'), '29.6 README 记录了 canViewBatchDetail 权限');
  check(batchReadme.includes('canExportBatchAudit'), '29.6 README 记录了 canExportBatchAudit 权限');
  check(batchReadme.includes('conflictStrategy'), '29.6 README 记录了 conflictStrategy 重复导入策略');
  check(batchReadme.includes('mergedFrom'), '29.6 README 记录了 merge 策略的 mergedFrom 字段');
  check(batchReadme.includes('batch-trace.js'), '29.6 README 目录树包含 batch-trace.js');
  check(batchReadme.includes('--batch-list'), '29.6 README 记录了 --batch-list CLI 命令');
  check(batchReadme.includes('--batch-detail'), '29.6 README 记录了 --batch-detail CLI 命令');
  check(batchReadme.includes('--export-audit'), '29.6 README 记录了 --export-audit CLI 命令');
  check(batchReadme.includes('--duplicate-check'), '29.6 README 记录了 --duplicate-check CLI 命令');

  const importLogCode = readFile('scripts/import-log.js');
  check(importLogCode.includes('--batch-list'), '29.6 import-log.js 支持 --batch-list');
  check(importLogCode.includes('--batch-detail'), '29.6 import-log.js 支持 --batch-detail');
  check(importLogCode.includes('--export-audit'), '29.6 import-log.js 支持 --export-audit');
  check(importLogCode.includes('--duplicate-check'), '29.6 import-log.js 支持 --duplicate-check');
  check(importLogCode.includes('batch-trace'), '29.6 import-log.js 引入了 batch-trace 模块');

  // ---- 29.7 批次追溯 HTTP 端点验证 ----
  console.log('\n【29.7】批次追溯 HTTP 端点验证');
  await (async () => {
    const http = require('http');
    const BT_PORT = 3299;

    function httpGetJson2(urlPath) {
      return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:' + BT_PORT + urlPath, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
            catch (e) { resolve({ status: res.statusCode, data: body }); }
          });
        }).on('error', reject);
      });
    }

    function httpPost2(urlPath, payload, method) {
      return new Promise((resolve, reject) => {
        const postData = JSON.stringify(payload || {});
        const req = http.request({ hostname: '127.0.0.1', port: BT_PORT, path: urlPath, method: method || 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => { try { resolve({ status: res.statusCode, ...JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: body }); } });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    }

    delete require.cache[require.resolve(path.join(ROOT, 'server'))];
    delete require.cache[require.resolve(path.join(ROOT, 'routes/api'))];
    delete require.cache[require.resolve(path.join(ROOT, 'lib/batch-trace'))];
    delete require.cache[require.resolve(path.join(ROOT, 'lib/store'))];
    delete require.cache[require.resolve(path.join(ROOT, 'lib/auth'))];
    const appModule = require(path.join(ROOT, 'server'));
    const btServer = require('http').createServer(appModule);

    await new Promise((resolve, reject) => {
      btServer.listen(BT_PORT, resolve);
      btServer.on('error', reject);
    });

    try {
      const btTestDoc = await httpPost2('/api/documents', { title: 'HTTP批次测试文档', content: 'HTTP初始', operator: '张编辑' });
      check(btTestDoc.document && btTestDoc.document.id, '29.7 HTTP: 创建测试文档成功');
      const btHttpDocId = btTestDoc.document.id;

      const btRevRes = await httpPost2('/api/documents/' + btHttpDocId + '/revisions', { content: 'HTTP修改', reason: 'HTTP批次测试', operator: '张编辑' });
      const btExpLogs = await httpGetJson2('/api/documents/' + btHttpDocId + '/revision-log');
      const btHttpLogs = btExpLogs.data.map((l, i) => ({
        ...l,
        id: 'http-bt-' + l.id.slice(0, 10),
        timestamp: new Date(new Date(l.timestamp).getTime() + i + 200).toISOString()
      }));

      const noOpHttp = await httpPost2('/api/batch-trace/import', { logs: btHttpLogs, operator: null });
      check(noOpHttp.status === 403 || noOpHttp.error === 'OPERATOR_REQUIRED', '29.7 HTTP: 无操作人批次导入被 403 拒绝');

      const strangerHttp = await httpPost2('/api/batch-trace/import', { logs: btHttpLogs, operator: '陌生人' });
      check(strangerHttp.status === 403 || strangerHttp.error === 'PERMISSION_DENIED', '29.7 HTTP: 陌生人批次导入被 403 拒绝');

      const validHttp = await httpPost2('/api/batch-trace/import', { logs: btHttpLogs, operator: '李审批', source: 'HTTP批次测试' });
      check(validHttp.status === 201 && validHttp.batchId, '29.7 HTTP: 审批员批次导入成功');
      check(validHttp.sourceDigest && validHttp.contentFingerprint, '29.7 HTTP: 返回来源摘要和指纹');
      const httpBatchId = validHttp.batchId;

      const dupHttp = await httpPost2('/api/batch-trace/import', { logs: btHttpLogs, operator: '李审批', conflictStrategy: 'reject' });
      check(dupHttp.status === 409 && dupHttp.error === 'DUPLICATE_IMPORT', '29.7 HTTP: 重复导入被 409 DUPLICATE_IMPORT 拦截');

      const skipHttp = await httpPost2('/api/batch-trace/import', { logs: btHttpLogs, operator: '李审批', conflictStrategy: 'skip' });
      check(skipHttp.status === 200 && skipHttp.skipped === true, '29.7 HTTP: skip 策略跳过成功');

      const mergeHttp = await httpPost2('/api/batch-trace/import', { logs: btHttpLogs, operator: '李审批', conflictStrategy: 'merge', source: 'HTTP合并' });
      check(mergeHttp.status === 201 && mergeHttp.batchId, '29.7 HTTP: merge 策略成功');

      const batchListHttp = await httpGetJson2('/api/batch-trace/batches');
      check(Array.isArray(batchListHttp.data) && batchListHttp.data.length >= 2, '29.7 HTTP: GET /batch-trace/batches 返回列表');

      const batchDetailOwner = await httpGetJson2('/api/batch-trace/batches/' + httpBatchId + '?viewer=李审批');
      check(batchDetailOwner.data && !batchDetailOwner.data._redacted, '29.7 HTTP: owner 查看批次详情无 _redacted');

      const batchDetailOther = await httpGetJson2('/api/batch-trace/batches/' + httpBatchId + '?viewer=张编辑');
      check(batchDetailOther.data && batchDetailOther.data._redacted === true, '29.7 HTTP: 非 owner 查看批次详情被 _redacted');

      const batchLogsHttp = await httpGetJson2('/api/batch-trace/batches/' + httpBatchId + '/logs');
      check(Array.isArray(batchLogsHttp.data) && batchLogsHttp.data.length > 0, '29.7 HTTP: GET /batches/:id/logs 返回批次日志');

      const exportAuditOwner = await httpGetJson2('/api/batch-trace/batches/' + httpBatchId + '/export-audit?viewer=李审批');
      check(exportAuditOwner.data && exportAuditOwner.data.batchId === httpBatchId, '29.7 HTTP: owner 导出审计摘要成功');

      const exportAuditOther = await httpGetJson2('/api/batch-trace/batches/' + httpBatchId + '/export-audit?viewer=张编辑');
      check(exportAuditOther.status === 403, '29.7 HTTP: 非 owner 导出审计摘要被 403 拒绝');

      const dupCheck = await httpGetJson2('/api/batch-trace/duplicate-check?sourceDigest=' + validHttp.sourceDigest);
      check(dupCheck.data && dupCheck.data.isDuplicate === true, '29.7 HTTP: 重复检测 API 返回 isDuplicate=true');

      const editorReimport = await httpPost2('/api/batch-trace/batches/' + httpBatchId + '/reimport', { strategy: 'overwrite', operator: '张编辑' });
      check(editorReimport.status === 403, '29.7 HTTP: 编辑员重导入被 403 拒绝');
    } finally {
      if (btServer.listening) btServer.close();
    }
  })();

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
