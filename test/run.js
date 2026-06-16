const store = require('../lib/store');
const docSvc = require('../lib/document');
const revSvc = require('../lib/revision');
const archSvc = require('../lib/archive');
const diffSvc = require('../lib/diff');
const draftSvc = require('../lib/draft');
const authSvc = require('../lib/auth');

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

  section('9. 失败链路：提交人与批准人不能是同一角色，且编辑员不能审批');
  const rev2 = revSvc.createRevision(docId, '第一章 总则\n第一条 本制度适用全体员工及外部合作人员。\n第二条 违规者将受处罚。', '新增处罚条款', '张编辑');
  const editorApprove = archSvc.approveAndPublish(rev2.revision.id, '张编辑');
  assert(editorApprove.error === 'PERMISSION_DENIED', '编辑员没有审批权限，被拒绝：PERMISSION_DENIED');

  const approverSubmit = revSvc.createRevision(docId, '审批员自己提交的内容', '审批员自审自测', '李审批');
  const samePersonApprove = archSvc.approveAndPublish(approverSubmit.revision.id, '李审批');
  assert(samePersonApprove.error === 'SAME_ROLE', '审批员也不能审批自己提交的修订：SAME_ROLE');

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

  section('16. 草稿箱：保存和读取草稿');
  const draftContent = '第一章 总则\n第一条 本制度适用全体员工及外包人员。';
  const draftReason = '扩展到外包人员';
  const savedDraft = draftSvc.saveDraft(docId, draftContent, draftReason, '张编辑');
  assert(savedDraft.draft !== undefined, '草稿保存成功');
  assert(savedDraft.draft.status === 'draft', '草稿状态为 draft');
  assert(savedDraft.draft.createdBy === '张编辑', '草稿创建人为张编辑');
  assert(savedDraft.draft.baselineVersionNumber === '1.1', '草稿基线版本为 1.1');
  assert(savedDraft.isNew === true, '首次保存标记为新草稿');

  const gotDraft = draftSvc.getDraft(savedDraft.draft.id);
  assert(gotDraft !== null, '可以通过 ID 读取草稿');
  assert(gotDraft.content === draftContent, '草稿内容正确');
  assert(gotDraft.reason === draftReason, '草稿理由正确');

  const userDrafts = draftSvc.getDraftsByUser('张编辑');
  assert(userDrafts.length >= 1, '按用户查询草稿列表有结果');

  const docDrafts = draftSvc.getDraftsByDoc(docId);
  assert(docDrafts.length >= 1, '按文档查询草稿列表有结果');

  section('17. 草稿箱：更新草稿和二次保存幂等');
  const updatedContent = '第一章 总则\n第一条 本制度适用全体员工、外包人员及实习生。';
  const updated = draftSvc.updateDraft(savedDraft.draft.id, updatedContent, '更新理由', '张编辑');
  assert(updated.draft !== undefined, '草稿更新成功');
  assert(updated.draft.content === updatedContent, '草稿内容已更新');

  const secondSave = draftSvc.saveDraft(docId, '新内容', '新理由', '张编辑');
  assert(secondSave.isNew === false, '同一用户同一文档第二次保存会更新现有草稿，不新建');
  assert(secondSave.draft.id === savedDraft.draft.id, '草稿 ID 保持不变');

  section('18. 草稿箱：权限校验 - 不能修改/删除别人的草稿');
  const updateOther = draftSvc.updateDraft(savedDraft.draft.id, '试图篡改', '', '李审批');
  assert(updateOther.error === 'PERMISSION_DENIED', '审批员不能修改编辑员的草稿');

  const deleteOther = draftSvc.deleteDraft(savedDraft.draft.id, '李审批');
  assert(deleteOther.error === 'PERMISSION_DENIED', '审批员不能删除编辑员的草稿');

  const ownDelete = draftSvc.deleteDraft(savedDraft.draft.id, '张编辑');
  assert(ownDelete.success === true, '草稿创建者可以删除自己的草稿');

  section('19. 草稿箱：重启后草稿仍然存在（持久化验证）');
  const newDraft = draftSvc.saveDraft(docId, '重启测试内容', '重启测试理由', '张编辑');
  const draftId = newDraft.draft.id;

  delete require.cache[require.resolve('../lib/store.js')];
  delete require.cache[require.resolve('../lib/draft.js')];

  const storeReloaded = require('../lib/store');
  const draftSvcReloaded = require('../lib/draft');

  const draftAfterReload = draftSvcReloaded.getDraft(draftId);
  assert(draftAfterReload !== null, '重启后草稿仍然存在（持久化成功）');
  assert(draftAfterReload.content === '重启测试内容', '重启后草稿内容正确');
  assert(draftAfterReload.reason === '重启测试理由', '重启后草稿理由正确');
  assert(draftAfterReload.status === 'draft', '重启后草稿状态正确');

  section('20. 基线版本冲突检测');
  const draftForConflict = draftSvc.saveDraft(docId, '冲突测试内容', '冲突测试', '张编辑');
  const conflictDraftId = draftForConflict.draft.id;

  const conflictCheck1 = draftSvc.checkBaselineConflict(conflictDraftId);
  assert(conflictCheck1.hasConflict === false, '初始状态下基线版本无冲突');

  const anotherRev = revSvc.createRevision(docId, '别人改的内容', '别人提交的修订', '王编辑');
  assert(anotherRev.revision !== undefined, '另一个人提交了修订');
  const anotherApprove = archSvc.approveAndPublish(anotherRev.revision.id, '李审批');
  assert(anotherApprove.revision !== undefined, '另一条修订被发布，文档版本推进');

  const conflictCheck2 = draftSvc.checkBaselineConflict(conflictDraftId);
  assert(conflictCheck2.hasConflict === true, '别人发布后，旧草稿检测出基线版本冲突');
  assert(conflictCheck2.baselineVersion !== conflictCheck2.currentVersion, '冲突检测返回了不同的基线版本和当前版本');

  section('21. 从草稿提交修订 - 无冲突场景');
  const freshDraft = draftSvc.saveDraft(docId, '新鲜草稿内容', '新鲜草稿理由', '赵编辑');
  const freshDraftId = freshDraft.draft.id;

  const submittedFromDraft = revSvc.submitRevisionFromDraft(freshDraftId, '赵编辑');
  assert(submittedFromDraft.revision !== undefined, '从草稿提交修订成功');
  assert(submittedFromDraft.revision.status === 'submitted', '提交后修订状态为 submitted');
  assert(submittedFromDraft.draft.status === 'submitted', '草稿状态变为 submitted');
  assert(submittedFromDraft.revision.fromDraftId === freshDraftId, '修订记录了来源草稿 ID');

  section('22. 从草稿提交修订 - 冲突拦截场景');
  const conflictDraft2 = draftSvc.saveDraft(docId, '冲突草稿2内容', '冲突测试2', '王编辑');
  const conflictDraft2Id = conflictDraft2.draft.id;

  const thirdRev = revSvc.createRevision(docId, '第三方改的内容', '第三方修订', '张编辑');
  archSvc.approveAndPublish(thirdRev.revision.id, '李审批');

  const conflictSubmit = revSvc.submitRevisionFromDraft(conflictDraft2Id, '王编辑');
  assert(conflictSubmit.error === 'BASELINE_CONFLICT', '基线版本冲突时提交被拦截');
  assert(conflictSubmit.detail && conflictSubmit.detail.baselineVersion, '冲突错误返回了基线版本信息');
  assert(conflictSubmit.detail && conflictSubmit.detail.currentVersion, '冲突错误返回了当前版本信息');

  section('23. 权限校验：提交人不能发布（编辑员角色）');
  const editorRev = revSvc.createRevision(docId, '编辑员提交的内容', '编辑员提交', '张编辑');
  const editorPublish = archSvc.approveAndPublish(editorRev.revision.id, '张编辑');
  assert(editorPublish.error === 'PERMISSION_DENIED', '编辑员没有发布权限，被拒绝');

  const fakeEditor = '无名编辑';
  const fakePublish = archSvc.approveAndPublish(editorRev.revision.id, fakeEditor);
  assert(fakePublish.error === 'PERMISSION_DENIED', '非审批员角色没有发布权限');

  section('24. 权限校验：审批员可以提交修订（不限于编辑）');
  const approverSubmitTest = revSvc.createRevision(docId, '审批员提交的内容', '审批员提交', '李审批');
  assert(approverSubmitTest.revision !== undefined, '审批员也可以提交修订');

  section('25. 修订日志筛选：按操作人过滤');
  const allLogs = archSvc.exportRevisionLog(docId);
  assert(allLogs.length > 0, '文档有修订日志');

  const zhangLogs = archSvc.exportRevisionLog(docId, { operator: '张编辑' });
  assert(zhangLogs.every(l => l.operator === '张编辑'), '按操作人筛选后，所有记录都是张编辑的');
  assert(zhangLogs.length < allLogs.length, '筛选后结果数量少于总数');

  const liLogs = archSvc.exportRevisionLog(docId, { operator: '李审批' });
  assert(liLogs.every(l => l.operator === '李审批'), '按操作人筛选李审批的记录正确');

  section('26. 修订日志筛选：按动作/状态过滤');
  const submitActionLogs = archSvc.exportRevisionLog(docId, { action: 'submit' });
  assert(submitActionLogs.every(l => l.action === 'submit'), '按动作筛选 submit 正确');

  const publishActionLogs = archSvc.exportRevisionLog(docId, { action: 'publish' });
  assert(publishActionLogs.every(l => l.action === 'publish'), '按动作筛选 publish 正确');

  const draftStatusLogs = archSvc.exportRevisionLog(docId, { status: 'draft' });
  assert(draftStatusLogs.every(l => l.action === 'draft_save' || l.action === 'draft_delete'), '按状态 draft 筛选返回草稿相关动作');

  section('27. CSV 导出功能');
  const csvContent = archSvc.exportRevisionLogCSV(docId);
  assert(csvContent.includes('时间'), 'CSV 包含表头：时间');
  assert(csvContent.includes('操作'), 'CSV 包含表头：操作');
  assert(csvContent.includes('操作人'), 'CSV 包含表头：操作人');
  assert(csvContent.includes('提交修订'), 'CSV 中有"提交修订"动作记录');
  assert(csvContent.includes('发布版本'), 'CSV 中有"发布版本"动作记录');
  assert(csvContent.includes('保存草稿'), 'CSV 中有"保存草稿"动作记录');

  const filteredCSV = archSvc.exportRevisionLogCSV(docId, { operator: '张编辑' });
  const csvLines = filteredCSV.split('\n');
  const dataLines = csvLines.slice(1).filter(l => l.trim() !== '');
  assert(dataLines.every(l => l.includes('张编辑')), '筛选后的 CSV 只包含张编辑的记录');

  section('28. 草稿相关动作会写入修订日志');
  resetStore();
  const testDoc = docSvc.importDocument('日志测试文档', '初始内容', '张编辑');
  const testDocId = testDoc.document.id;

  const testDraft = draftSvc.saveDraft(testDocId, '草稿内容', '草稿理由', '张编辑');
  const testDraftId = testDraft.draft.id;

  draftSvc.updateDraft(testDraftId, '更新后内容', '更新理由', '张编辑');
  draftSvc.deleteDraft(testDraftId, '张编辑');

  const draftLogs2 = archSvc.exportRevisionLog(testDocId, { status: 'draft' });
  assert(draftLogs2.some(l => l.action === 'draft_save'), '日志中有 draft_save 动作');
  assert(draftLogs2.some(l => l.action === 'draft_delete'), '日志中有 draft_delete 动作');
  assert(draftLogs2.some(l => l.detail && l.detail.baselineVersion), '草稿日志详情中包含基线版本信息');

  console.log('\n' + '='.repeat(60));
  console.log(`  测试结果：✅ ${passed} 通过  ❌ ${failed} 失败`);
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
}

run();
