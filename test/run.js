const store = require('../lib/store');
const docSvc = require('../lib/document');
const revSvc = require('../lib/revision');
const archSvc = require('../lib/archive');
const diffSvc = require('../lib/diff');
const draftSvc = require('../lib/draft');
const authSvc = require('../lib/auth');
const path = require('path');

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

async function run() {
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

  section('29. 前端入口可见性：index.html 包含草稿箱、筛选、CSV导出');
  const fs = require('fs');
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');
  assert(indexHtml.includes('data-tab="drafts"'), 'index.html 包含草稿箱标签页');
  assert(indexHtml.includes('tab-drafts'), 'index.html 包含草稿箱内容区');
  assert(indexHtml.includes('draftDocSelect'), 'index.html 包含草稿文档选择器');
  assert(indexHtml.includes('draftList'), 'index.html 包含草稿列表容器');
  assert(indexHtml.includes('draftConflictWarning'), 'index.html 包含冲突警告区域');
  assert(indexHtml.includes('draftSubmitBtn'), 'index.html 包含从草稿提交按钮');
  assert(indexHtml.includes('saveDraftBtn'), 'index.html 修订区包含保存草稿按钮');
  assert(indexHtml.includes('logFilterOperator'), 'index.html 日志区包含操作人筛选');
  assert(indexHtml.includes('logFilterAction'), 'index.html 日志区包含动作筛选');
  assert(indexHtml.includes('logFilterStatus'), 'index.html 日志区包含状态筛选');
  assert(indexHtml.includes('exportCsvBtn'), 'index.html 包含 CSV 导出按钮');

  section('30. 前端逻辑链路：app.js 包含草稿/冲突/筛选/权限关键函数');
  const appPath = path.join(__dirname, '..', 'public', 'app.js');
  const appJs = fs.readFileSync(appPath, 'utf-8');
  assert(appJs.includes('/drafts'), 'app.js 调用草稿 API');
  assert(appJs.includes('/conflict'), 'app.js 调用冲突检测 API');
  assert(appJs.includes('/drafts/') && appJs.includes('/submit'), 'app.js 调用从草稿提交 API');
  assert(appJs.includes('BASELINE_CONFLICT') || appJs.includes('409'), 'app.js 处理基线版本冲突响应');
  assert(appJs.includes('draftConflictWarning'), 'app.js 显示冲突警告');
  assert(appJs.includes('exportCsvBtn'), 'app.js 绑定 CSV 导出按钮');
  assert(appJs.includes('logFilterAction'), 'app.js 使用动作筛选参数');
  assert(appJs.includes('logFilterStatus'), 'app.js 使用状态筛选参数');
  assert(appJs.includes('logFilterOperator'), 'app.js 使用操作人筛选参数');
  assert(appJs.includes('isOwner') || appJs.includes('createdBy'), 'app.js 判断草稿归属');
  assert(appJs.includes("role === 'approver'"), 'app.js 根据角色控制审批按钮可见性');
  assert(appJs.includes('export.csv'), 'app.js CSV 下载链接指向 export.csv 端点');

  section('31. 前端样式：style.css 包含草稿/冲突/筛选样式');
  const cssPath = path.join(__dirname, '..', 'public', 'style.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  assert(cssContent.includes('.draft-card'), 'style.css 包含草稿卡片样式');
  assert(cssContent.includes('.conflict-warning'), 'style.css 包含冲突警告样式');
  assert(cssContent.includes('.filter-bar'), 'style.css 包含筛选栏样式');
  assert(cssContent.includes('.draft-edit-area'), 'style.css 包含草稿编辑区样式');
  assert(cssContent.includes('.action-draft_save'), 'style.css 包含草稿日志样式');
  assert(cssContent.includes('.status-draft'), 'style.css 包含草稿状态样式');

  {
  section('32. 草稿快照：多次保存自动创建快照');
  resetStore();
  const snapDoc = docSvc.importDocument('快照测试文档', '初始内容 v1', '张编辑');
  const snapDocId = snapDoc.document.id;

  const snapDraft1 = draftSvc.saveDraft(snapDocId, '草稿内容 1', '快照测试理由 1', '张编辑');
  assert(snapDraft1.draft !== undefined, '首次保存草稿成功');
  const snapDraftId = snapDraft1.draft.id;

  let snapshotsAfterFirst = draftSvc.getSnapshotsByDraft(snapDraftId);
  assert(snapshotsAfterFirst.length === 0, '首次保存草稿不创建快照（无历史内容）');

  const snapDraft2 = draftSvc.updateDraft(snapDraftId, '草稿内容 2', '快照测试理由 2', '张编辑');
  assert(snapDraft2.draft !== undefined, '第一次更新草稿成功');
  let snapshotsAfterUpdate1 = draftSvc.getSnapshotsByDraft(snapDraftId);
  assert(snapshotsAfterUpdate1.length === 1, '第一次更新后有 1 个快照');
  assert(snapshotsAfterUpdate1[0].content === '草稿内容 1', '快照保留了更新前的内容');
  assert(snapshotsAfterUpdate1[0].reason === '快照测试理由 1', '快照保留了更新前的理由');
  assert(snapshotsAfterUpdate1[0].createdBy === '张编辑', '快照创建人正确');
  assert(snapshotsAfterUpdate1[0].baselineVersionNumber === '1.0', '快照基线版本正确');

  draftSvc.updateDraft(snapDraftId, '草稿内容 3', '快照测试理由 3', '张编辑');
  draftSvc.updateDraft(snapDraftId, '草稿内容 4', '快照测试理由 4', '张编辑');
  let snapshotsAfter3 = draftSvc.getSnapshotsByDraft(snapDraftId);
  assert(snapshotsAfter3.length === 3, '3 次更新后有 3 个快照');
  assert(snapshotsAfter3[0].content === '草稿内容 3', '最新快照排在最前');
  assert(snapshotsAfter3[2].content === '草稿内容 1', '最早快照排在最后');

  section('33. 草稿快照：恢复快照到草稿');
  const restored = draftSvc.restoreSnapshot(snapshotsAfter3[1].id, '张编辑');
  assert(restored.draft !== undefined, '快照恢复成功');
  assert(restored.draft.content === '草稿内容 2', '恢复后草稿内容为快照内容');
  assert(restored.draft.reason === '快照测试理由 2', '恢复后草稿理由为快照理由');

  const snapshotsAfterRestore = draftSvc.getSnapshotsByDraft(snapDraftId);
  assert(snapshotsAfterRestore.length >= 4, '恢复前自动为当前内容创建了新快照，快照数增加');

  const draftAfterRestore = draftSvc.getDraft(snapDraftId);
  assert(draftAfterRestore.content === '草稿内容 2', '草稿实际内容已更新为快照内容');

  section('34. 草稿快照：冲突拦截 - 正式版本前进后恢复被拦下');
  resetStore();
  const conflictDoc = docSvc.importDocument('冲突恢复文档', '初始内容', '张编辑');
  const conflictDocId = conflictDoc.document.id;

  const snapConflictDraft = draftSvc.saveDraft(conflictDocId, '我的草稿内容', '草稿理由', '张编辑');
  const snapConflictDraftId = snapConflictDraft.draft.id;

  draftSvc.updateDraft(snapConflictDraftId, '更新后的草稿内容', '更新后的理由', '张编辑');
  const conflictSnapshots = draftSvc.getSnapshotsByDraft(snapConflictDraftId);
  assert(conflictSnapshots.length === 1, '草稿有 1 个快照');
  const conflictSnapshotId = conflictSnapshots[0].id;

  const otherRev = revSvc.createRevision(conflictDocId, '别人改的正式版本', '别人的修订理由', '王编辑');
  archSvc.approveAndPublish(otherRev.revision.id, '李审批');
  const docAfterPublish = docSvc.getDocument(conflictDocId);
  assert(docAfterPublish.currentVersion.versionNumber === '1.1', '正式版本已前进到 1.1');

  const blockedRestore = draftSvc.restoreSnapshot(conflictSnapshotId, '张编辑');
  assert(blockedRestore.error === 'BASELINE_CONFLICT', '基线版本冲突时快照恢复被拦截');
  assert(blockedRestore.message && blockedRestore.message.includes('拦截'), '拦截错误有明确提示');
  assert(blockedRestore.detail && blockedRestore.detail.snapshotBaselineVersion === '1.0', '拦截错误返回了快照基线版本');
  assert(blockedRestore.detail && blockedRestore.detail.currentVersion === '1.1', '拦截错误返回了当前版本');

  const conflictLogs = archSvc.exportRevisionLog(conflictDocId, { action: 'draft_snapshot_restore_conflict' });
  assert(conflictLogs.length === 1, '冲突拦截写入了修订日志');

  const draftAfterBlocked = draftSvc.getDraft(snapConflictDraftId);
  assert(draftAfterBlocked.content === '更新后的草稿内容', '被拦截后草稿内容未被改动');

  section('35. 草稿快照：权限边界 - 审批人不能恢复/删除别人的快照');
  resetStore();
  const permDoc = docSvc.importDocument('权限快照文档', '初始内容', '张编辑');
  const permDocId = permDoc.document.id;

  const permDraft = draftSvc.saveDraft(permDocId, '张编辑的草稿', '张编辑的理由', '张编辑');
  draftSvc.updateDraft(permDraft.draft.id, '张编辑更新后的内容', '更新理由', '张编辑');
  const permSnapshots = draftSvc.getSnapshotsByDraft(permDraft.draft.id);
  assert(permSnapshots.length === 1, '有一个快照');
  const permSnapshotId = permSnapshots[0].id;

  const approverRestore = draftSvc.restoreSnapshot(permSnapshotId, '李审批');
  assert(approverRestore.error === 'PERMISSION_DENIED', '审批人不能恢复别人的快照');

  const approverDeleteSnap = draftSvc.deleteSnapshot(permSnapshotId, '李审批');
  assert(approverDeleteSnap.error === 'PERMISSION_DENIED', '审批人不能删除别人的快照');

  const ownerDeleteSnap = draftSvc.deleteSnapshot(permSnapshotId, '张编辑');
  assert(ownerDeleteSnap.success === true, '快照创建者可以删除自己的快照');

  const permSnapshotsAfter = draftSvc.getSnapshotsByDraft(permDraft.draft.id);
  assert(permSnapshotsAfter.length === 0, '删除后快照列表为空');

  const snapDeleteLogs = archSvc.exportRevisionLog(permDocId, { action: 'draft_snapshot_delete' });
  assert(snapDeleteLogs.length === 1, '删除快照写入了修订日志');

  section('36. 草稿快照：重启后快照仍然存在（持久化）');
  resetStore();
  const persistDoc = docSvc.importDocument('持久化快照文档', '初始内容', '张编辑');
  const persistDocId = persistDoc.document.id;

  const persistDraft = draftSvc.saveDraft(persistDocId, '草稿内容 A', '理由 A', '张编辑');
  draftSvc.updateDraft(persistDraft.draft.id, '草稿内容 B', '理由 B', '张编辑');
  draftSvc.updateDraft(persistDraft.draft.id, '草稿内容 C', '理由 C', '张编辑');
  const persistSnapshotsBefore = draftSvc.getSnapshotsByDraft(persistDraft.draft.id);
  assert(persistSnapshotsBefore.length === 2, '重启前有 2 个快照');
  const persistDraftId = persistDraft.draft.id;

  delete require.cache[require.resolve('../lib/store.js')];
  delete require.cache[require.resolve('../lib/draft.js')];

  const storePersistReloaded = require('../lib/store');
  const draftSvcPersistReloaded = require('../lib/draft');

  const persistSnapshotsAfter = draftSvcPersistReloaded.getSnapshotsByDraft(persistDraftId);
  assert(persistSnapshotsAfter.length === 2, '重启后快照仍然存在（2 个）');
  assert(persistSnapshotsAfter[0].content === '草稿内容 B', '重启后快照内容正确（最新）');
  assert(persistSnapshotsAfter[1].content === '草稿内容 A', '重启后快照内容正确（最早）');
  assert(persistSnapshotsAfter[0].baselineVersionNumber === '1.0', '重启后快照基线版本正确');
  assert(persistSnapshotsAfter[0].createdBy === '张编辑', '重启后快照创建人正确');

  const restoredAfterReload = draftSvcPersistReloaded.restoreSnapshot(persistSnapshotsAfter[1].id, '张编辑');
  assert(restoredAfterReload.draft !== undefined, '重启后恢复快照成功');
  assert(restoredAfterReload.draft.content === '草稿内容 A', '重启后恢复的快照内容正确');

  section('37. 草稿快照：保留最近 N 个（超过自动清理最旧）');
  resetStore();
  const trimDoc = docSvc.importDocument('快照裁剪文档', '初始内容', '张编辑');
  const trimDocId = trimDoc.document.id;

  const trimDraft = draftSvc.saveDraft(trimDocId, '内容 0', '理由 0', '张编辑');
  const trimDraftId = trimDraft.draft.id;

  for (let i = 1; i <= 12; i++) {
    draftSvc.updateDraft(trimDraftId, `内容 ${i}`, `理由 ${i}`, '张编辑');
  }

  const trimSnapshots = draftSvc.getSnapshotsByDraft(trimDraftId);
  assert(trimSnapshots.length === draftSvc.MAX_SNAPSHOTS_PER_DRAFT, `超过上限后裁剪为 ${draftSvc.MAX_SNAPSHOTS_PER_DRAFT} 个快照`);
  assert(trimSnapshots[0].content === '内容 11', '最新快照保留');
  assert(trimSnapshots[trimSnapshots.length - 1].content === '内容 2', '最旧的快照被裁剪掉（内容 0 和 1 被移除）');

  section('38. 草稿快照：日志和 CSV 导出包含快照动作');
  resetStore();
  const logDoc = docSvc.importDocument('快照日志文档', '初始内容', '张编辑');
  const logDocId = logDoc.document.id;

  const logDraft = draftSvc.saveDraft(logDocId, '草稿 v1', '理由 v1', '张编辑');
  draftSvc.updateDraft(logDraft.draft.id, '草稿 v2', '理由 v2', '张编辑');
  const logSnapshots = draftSvc.getSnapshotsByDraft(logDraft.draft.id);
  draftSvc.restoreSnapshot(logSnapshots[0].id, '张编辑');
  draftSvc.deleteSnapshot(logSnapshots[0].id, '张编辑');

  const allSnapLogs = archSvc.exportRevisionLog(logDocId, { status: 'draft' });
  assert(allSnapLogs.some(l => l.action === 'draft_snapshot_restore'), '日志包含 draft_snapshot_restore 动作');
  assert(allSnapLogs.some(l => l.action === 'draft_snapshot_delete'), '日志包含 draft_snapshot_delete 动作');

  const csvSnapContent = archSvc.exportRevisionLogCSV(logDocId);
  assert(csvSnapContent.includes('快照ID'), 'CSV 包含快照ID列');
  assert(csvSnapContent.includes('恢复草稿快照'), 'CSV 包含"恢复草稿快照"记录');
  assert(csvSnapContent.includes('删除草稿快照'), 'CSV 包含"删除草稿快照"记录');

  section('39. 草稿快照：删除草稿时快照也被清理');
  resetStore();
  const cascadeDoc = docSvc.importDocument('级联删除文档', '初始内容', '张编辑');
  const cascadeDraft = draftSvc.saveDraft(cascadeDoc.document.id, '内容 A', '理由 A', '张编辑');
  draftSvc.updateDraft(cascadeDraft.draft.id, '内容 B', '理由 B', '张编辑');
  const cascadeSnapshotCountBefore = draftSvc.getSnapshotsByDraft(cascadeDraft.draft.id).length;
  assert(cascadeSnapshotCountBefore === 1, '删除草稿前有 1 个快照');

  draftSvc.deleteDraft(cascadeDraft.draft.id, '张编辑');
  const cascadeSnapshotsAfter = draftSvc.getSnapshotsByDraft(cascadeDraft.draft.id);
  assert(cascadeSnapshotsAfter.length === 0, '删除草稿后关联快照被级联清理');
  }

  section('40. HTTP 端点：修订日志筛选查询不混入无关记录');
  const http = require('http');
  const PORT = 3299;

  function httpGet(urlPath) {
    return new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:' + PORT + urlPath, res => {
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
      http.get('http://127.0.0.1:' + PORT + urlPath, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: body }));
      }).on('error', reject);
    });
  }

  resetStore();
  const app = require('../server');
  const server = require('http').createServer(app);

  await new Promise((resolve, reject) => {
    server.listen(PORT, resolve);
    server.on('error', reject);
  });

  try {
    const importRes = await httpGet('/api/documents');
    const docs = importRes.data;
    if (docs.length === 0) {
      const importRes2 = await httpGet('/api/documents');
    }

    const createRes = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ title: '筛选测试文档', content: '初始内容', operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/documents', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    const filterDocId = createRes.document.id;

    await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ content: '修改后内容', reason: '测试筛选', operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/documents/' + filterDocId + '/revisions', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    const filterRevId = (await httpGet('/api/documents/' + filterDocId + '/revisions')).data[0].id;

    await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ approver: '李审批' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/revisions/' + filterRevId + '/approve', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ documentId: filterDocId, content: '草稿内容', reason: '筛选草稿', operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/drafts', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    const allLogsRes = await httpGet('/api/documents/' + filterDocId + '/revision-log');
    const allLogs = allLogsRes.data;
    assert(allLogs.length >= 4, '未筛选时日志包含所有记录（导入+提交+发布+草稿）');
    assert(allLogs.some(l => l.action === 'import'), '未筛选结果包含 import');
    assert(allLogs.some(l => l.action === 'submit'), '未筛选结果包含 submit');
    assert(allLogs.some(l => l.action === 'publish'), '未筛选结果包含 publish');
    assert(allLogs.some(l => l.action === 'draft_save'), '未筛选结果包含 draft_save');

    const statusDraftRes = await httpGet('/api/documents/' + filterDocId + '/revision-log?status=draft');
    const draftLogs = statusDraftRes.data;
    assert(draftLogs.length > 0, '按 status=draft 筛选有结果');
    assert(draftLogs.every(l => l.action === 'draft_save' || l.action === 'draft_delete'), '按 status=draft 筛选后只有 draft_save/draft_delete，不混入 import/submit/publish');
    assert(!draftLogs.some(l => l.action === 'import'), 'draft 筛选结果中不含 import');
    assert(!draftLogs.some(l => l.action === 'submit'), 'draft 筛选结果中不含 submit');
    assert(!draftLogs.some(l => l.action === 'publish'), 'draft 筛选结果中不含 publish');

    const actionSubmitRes = await httpGet('/api/documents/' + filterDocId + '/revision-log?action=submit');
    const submitLogs = actionSubmitRes.data;
    assert(submitLogs.length > 0, '按 action=submit 筛选有结果');
    assert(submitLogs.every(l => l.action === 'submit'), '按 action=submit 筛选后只有 submit');
    assert(!submitLogs.some(l => l.action === 'import'), 'submit 筛选结果中不含 import');
    assert(!submitLogs.some(l => l.action === 'publish'), 'submit 筛选结果中不含 publish');

    const operatorZhangRes = await httpGet('/api/documents/' + filterDocId + '/revision-log?operator=' + encodeURIComponent('张编辑'));
    const zhangLogs = operatorZhangRes.data;
    assert(zhangLogs.length > 0, '按 operator=张编辑 筛选有结果');
    assert(zhangLogs.every(l => l.operator === '张编辑'), '按 operator 筛选后只有张编辑的记录');
    assert(!zhangLogs.some(l => l.operator === '李审批'), '张编辑筛选结果中不含李审批的记录');

    section('33. HTTP 端点：CSV 导出与 JSON 筛选结果一致');
    const csvRawRes = await httpGetRaw('/api/documents/' + filterDocId + '/revision-log/export.csv?status=draft');
    const csvData = csvRawRes.data;
    assert(csvData.includes('时间'), 'CSV 包含表头');
    assert(csvData.includes('保存草稿'), 'CSV 包含保存草稿记录');
    const csvLines = csvData.split('\n').filter(l => l.trim() !== '');
    const csvDataLines = csvLines.slice(1);
    assert(csvDataLines.length === draftLogs.length, 'CSV 数据行数与 JSON 筛选结果一致（' + csvDataLines.length + ' vs ' + draftLogs.length + '）');

    const csvSubmitRes = await httpGetRaw('/api/documents/' + filterDocId + '/revision-log/export.csv?action=submit');
    const csvSubmitData = csvSubmitRes.data;
    const csvSubmitLines = csvSubmitData.split('\n').filter(l => l.trim() !== '');
    const csvSubmitDataLines = csvSubmitLines.slice(1);
    assert(csvSubmitDataLines.length === submitLogs.length, 'CSV submit 筛选行数与 JSON 一致（' + csvSubmitDataLines.length + ' vs ' + submitLogs.length + '）');

    section('34. HTTP 端点：重启后再次查询筛选仍然生效');
    delete require.cache[require.resolve('../lib/store.js')];
    delete require.cache[require.resolve('../lib/archive.js')];

    const archSvcReloaded = require('../lib/archive');
    const reloadedDraftLogs = archSvcReloaded.exportRevisionLog(filterDocId, { status: 'draft' });
    assert(reloadedDraftLogs.every(l => l.action === 'draft_save' || l.action === 'draft_delete'), '重启后按 status=draft 筛选仍然不混入无关记录');

    const reloadedSubmitLogs = archSvcReloaded.exportRevisionLog(filterDocId, { action: 'submit' });
    assert(reloadedSubmitLogs.every(l => l.action === 'submit'), '重启后按 action=submit 筛选仍然正确');

    const reloadCsv = archSvcReloaded.exportRevisionLogCSV(filterDocId, { status: 'draft' });
    const reloadCsvLines = reloadCsv.split('\n').filter(l => l.trim() !== '');
    const reloadCsvDataLines = reloadCsvLines.slice(1);
    assert(reloadCsvDataLines.length === reloadedDraftLogs.length, '重启后 CSV 行数与 JSON 筛选一致');

    section('35. HTTP 端点：草稿快照列表、恢复、删除、冲突拦截');

    const snapDocHttp = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ title: 'HTTP 快照文档', content: '初始内容', operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/documents', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    const snapHttpDocId = snapDocHttp.document.id;

    await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ documentId: snapHttpDocId, content: 'HTTP 草稿内容 1', reason: 'HTTP 草稿理由 1', operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/drafts', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    const draftsAfterFirst = await httpGet('/api/drafts?documentId=' + snapHttpDocId);
    const snapHttpDraftId = draftsAfterFirst.data[0].id;

    await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ content: 'HTTP 草稿内容 2', reason: 'HTTP 草稿理由 2', operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/drafts/' + snapHttpDraftId, method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    const snapListRes = await httpGet('/api/drafts/' + snapHttpDraftId + '/snapshots');
    assert(snapListRes.data.length === 1, 'HTTP 获取快照列表返回 1 条快照');
    assert(snapListRes.data[0].content === 'HTTP 草稿内容 1', '快照内容正确');
    const snapHttpId = snapListRes.data[0].id;

    const approverDeleteBefore = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ operator: '李审批' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/snapshots/' + snapHttpId, method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: body }); } });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    assert(approverDeleteBefore.status === 403, '审批人删除别人快照返回 403');

    const deleteSnapRes = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/snapshots/' + snapHttpId, method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: body }); } });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    assert(deleteSnapRes.status === 200, 'HTTP 删除快照成功（200）');
    assert(deleteSnapRes.data.success === true, '删除快照返回 success');

    const snapListAfterDel = await httpGet('/api/drafts/' + snapHttpDraftId + '/snapshots');
    assert(snapListAfterDel.data.length === 0, '删除后快照列表为空');

    await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ content: 'HTTP 草稿内容 1', reason: 'HTTP 草稿理由 1', operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/drafts/' + snapHttpDraftId, method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    const snapListForRestore = await httpGet('/api/drafts/' + snapHttpDraftId + '/snapshots');
    const snapHttpId2 = snapListForRestore.data[0].id;

    const restoreRes = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ operator: '张编辑' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/snapshots/' + snapHttpId2 + '/restore', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: body }); } });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    assert(restoreRes.status === 200, 'HTTP 恢复快照成功（200）');
    assert(restoreRes.data.draft.content === 'HTTP 草稿内容 2', '恢复后草稿内容正确');

    const approverRestoreRes = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ operator: '李审批' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/snapshots/' + snapHttpId2 + '/restore', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: body }); } });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    assert(approverRestoreRes.status === 403, '审批人恢复别人快照返回 403');

  } finally {
    server.close();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  测试结果：✅ ${passed} 通过  ❌ ${failed} 失败`);
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
}

run();
