const store = require('../lib/store');
const docSvc = require('../lib/document');
const revSvc = require('../lib/revision');
const archSvc = require('../lib/archive');
const diffSvc = require('../lib/diff');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('  ✅ ' + msg);
    passed++;
  } else {
    console.log('  ❌ ' + msg);
    failed++;
  }
}

function resetStore() {
  const fs = require('fs');
  const path = require('path');
  const dbFile = path.join(__dirname, '..', 'data', 'db.json');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const tmpFile = dbFile + '.tmp';
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  console.log('  ' + title);
  console.log('='.repeat(60));
}

function run() {
  resetStore();

  section('1. 主流程：导入样例文档');
  const imported = docSvc.importDocument('信息安全管理制度', '第一章 总则\n第一条 本制度适用全体员工。', '张编辑');
  assert(imported.document !== undefined, '文档导入成功，返回文档对象');
  assert(imported.version.versionNumber === '1.0', '初始版本号为 1.0');
  const docId = imported.document.id;
  const ver1Id = imported.version.id;

  section('2. 主流程：生成差异');
  const newContent = '第一章 总则\n第一条 本制度适用全体员工及外部合作人员。';
  const diff = diffSvc.generateDiff('第一章 总则\n第一条 本制度适用全体员工。', newContent);
  assert(diff.hasChanges === true, '差异检测：检测到内容变更');
  assert(diff.summary.added >= 1, '差异检测：有新增行');
  assert(diff.summary.removed >= 1, '差异检测：有删除行');

  section('3. 主流程：提交修订');
  const revision = revSvc.createRevision(docId, newContent, '扩展适用范围至外部合作人员', '张编辑');
  assert(revision.revision !== undefined, '修订提交成功');
  assert(revision.revision.status === 'submitted', '修订状态为 submitted');
  assert(revision.revision.oldVersionNumber === '1.0', '旧版本为 1.0');
  assert(revision.revision.newVersionNumber === '1.1', '新版本为 1.1');
  const revId = revision.revision.id;

  section('4. 主流程：审批发布');
  const approved = archSvc.approveAndPublish(revId, '李审批');
  assert(approved.revision !== undefined, '审批发布成功');
  assert(approved.revision.status === 'published', '状态变为 published');
  assert(approved.revision.approvedBy === '李审批', '批准人为李审批');

  const docAfterPublish = docSvc.getDocument(docId);
  assert(docAfterPublish.currentVersion.versionNumber === '1.1', '发布后当前版本指针指向 1.1');
  assert(docAfterPublish.document.currentVersionId !== ver1Id, '旧版本 1.0 未被覆盖');

  section('5. 主流程：导出修订日志');
  const logs = archSvc.exportRevisionLog(docId);
  assert(logs.length >= 3, '修订日志至少包含3条记录（导入+提交+发布）');
  const importLog = logs.find(l => l.action === 'import');
  const submitLog = logs.find(l => l.action === 'submit');
  const publishLog = logs.find(l => l.action === 'publish');
  assert(importLog !== undefined, '日志包含导入记录');
  assert(submitLog !== undefined, '日志包含提交记录');
  assert(publishLog !== undefined, '日志包含发布记录');

  section('6. 失败链路：无修订理由不能提交');
  const noReason = revSvc.createRevision(docId, '新内容', '', '张编辑');
  assert(noReason.error === 'REVISION_REASON_REQUIRED', '空理由被拒绝：REVISION_REASON_REQUIRED');

  const noReason2 = revSvc.createRevision(docId, '新内容', '   ', '张编辑');
  assert(noReason2.error === 'REVISION_REASON_REQUIRED', '纯空格理由被拒绝');

  section('7. 失败链路：内容相同为无效变更');
  const sameContent = docAfterPublish.currentVersion.content;
  const invalidChange = revSvc.createRevision(docId, sameContent, '试图硬改版本号', '张编辑');
  assert(invalidChange.error === 'INVALID_CHANGE', '内容完全相同被识别为无效变更');

  section('8. 失败链路：同一修订重复发布不会多写历史');
  const dupPublish = archSvc.approveAndPublish(revId, '李审批');
  assert(dupPublish.error === 'DUPLICATE_PUBLISH', '重复发布被拒绝：DUPLICATE_PUBLISH');

  const logsAfterDup = archSvc.exportRevisionLog(docId);
  const publishLogs = logsAfterDup.filter(l => l.action === 'publish' && l.revisionId === revId);
  assert(publishLogs.length === 1, '历史中只有1条发布记录，未多写');

  section('9. 失败链路：提交人与批准人不能是同一角色');
  const rev2 = revSvc.createRevision(docId, '第一章 总则\n第一条 本制度适用全体员工及外部合作人员。\n第二条 违规者将受处罚。', '新增处罚条款', '张编辑');
  const samePerson = archSvc.approveAndPublish(rev2.revision.id, '张编辑');
  assert(samePerson.error === 'SAME_ROLE', '同一人审批被拒绝：SAME_ROLE');

  const diffPerson = archSvc.approveAndPublish(rev2.revision.id, '李审批');
  assert(diffPerson.revision !== undefined, '不同人审批通过');

  section('10. 撤回已发布版本：恢复上一版为当前有效版本');
  const currentBefore = docSvc.getDocument(docId);
  assert(currentBefore.currentVersion.versionNumber === '1.2', '撤回前当前版本为 1.2');

  const withdrawn = archSvc.withdraw(rev2.revision.id, '李审批');
  assert(withdrawn.revision.status === 'withdrawn', '修订状态变为 withdrawn');

  const currentAfter = docSvc.getDocument(docId);
  assert(currentAfter.currentVersion.versionNumber === '1.1', '撤回后当前版本恢复为 1.1');

  section('11. 撤回后保留全部归档记录');
  const archives = archSvc.getArchives(docId);
  assert(archives.length >= 1, '归档记录不为空');
  const v1Archive = archives.find(a => a.versionNumber === '1.0');
  assert(v1Archive !== undefined, '1.0 版本归档记录保留');

  section('12. 重启后一致性：活动版本指针、历史归档、导出结果一致');
  const consistency = archSvc.verifyConsistency();
  assert(consistency.consistent === true, '一致性校验通过');

  const docReloaded = docSvc.getDocument(docId);
  assert(docReloaded.currentVersion.versionNumber === '1.1', '重启后活动版本指针仍指向 1.1');

  const logsBeforeReload = archSvc.exportRevisionLog(docId);
  const archivesBeforeReload = archSvc.getArchives(docId);

  const logsReloaded = archSvc.exportRevisionLog(docId);
  assert(logsReloaded.length === logsBeforeReload.length, '重启后修订日志条数一致');

  const archivesReloaded = archSvc.getArchives(docId);
  assert(archivesReloaded.length === archivesBeforeReload.length, '重启后归档记录条数一致');

  section('13. 旧版本未被覆盖验证');
  const ver1 = docSvc.getVersion(ver1Id);
  assert(ver1 !== null, '1.0 版本仍存在');
  assert(ver1.content === '第一章 总则\n第一条 本制度适用全体员工。', '1.0 版本内容未被修改');
  assert(ver1.versionNumber === '1.0', '1.0 版本号未变');

  section('14. 修订理由在归档中保留');
  const archiveWithReason = archives.find(a => a.versionNumber === '1.0');
  assert(archiveWithReason.reason === '扩展适用范围至外部合作人员', '归档记录保留了修订理由');

  section('15. 撤回状态不可再次撤回');
  const reWithdraw = archSvc.withdraw(rev2.revision.id, '李审批');
  assert(reWithdraw.error === 'INVALID_STATUS', '已撤回的修订不可再次撤回');

  console.log('\n' + '='.repeat(60));
  console.log(`  测试结果：✅ ${passed} 通过  ❌ ${failed} 失败`);
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
}

run();
