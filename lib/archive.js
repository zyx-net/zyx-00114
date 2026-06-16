const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const authSvc = require('./auth');

function approveAndPublish(revId, approver) {
  if (!authSvc.canApproveAndPublish(approver)) {
    return { error: 'PERMISSION_DENIED', message: '当前用户没有审批发布的权限' };
  }

  return store.update(data => {
    const rev = data.revisions[revId];
    if (!rev) return { error: 'REVISION_NOT_FOUND', message: '修订不存在' };

    if (rev.status === 'published') {
      return { error: 'DUPLICATE_PUBLISH', message: '同一修订重复发布不会多写历史' };
    }

    if (rev.status !== 'submitted') {
      return { error: 'INVALID_STATUS', message: `修订当前状态为 ${rev.status}，无法审批发布` };
    }

    if (authSvc.isSamePersonSubmitAndApprove(rev.submittedBy, approver)) {
      return { error: 'SAME_ROLE', message: '提交人与批准人不能是同一权限角色' };
    }

    const now = new Date().toISOString();
    rev.status = 'published';
    rev.approvedBy = approver;
    rev.approvedAt = now;
    rev.publishedAt = now;

    data.documents[rev.documentId].currentVersionId = rev.newVersionId;

    data.archives.push({
      id: uuidv4(),
      revisionId: revId,
      documentId: rev.documentId,
      versionId: rev.oldVersionId,
      versionNumber: rev.oldVersionNumber,
      reason: rev.reason,
      archivedAt: now
    });

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: rev.documentId,
      revisionId: revId,
      action: 'publish',
      operator: approver,
      timestamp: now,
      detail: {
        from: rev.oldVersionNumber,
        to: rev.newVersionNumber,
        reason: rev.reason
      }
    });

    return { revision: rev };
  });
}

function withdraw(revId, operator) {
  if (!authSvc.canWithdraw(operator)) {
    return { error: 'PERMISSION_DENIED', message: '当前用户没有撤回的权限' };
  }

  return store.update(data => {
    const rev = data.revisions[revId];
    if (!rev) return { error: 'REVISION_NOT_FOUND', message: '修订不存在' };

    if (rev.status !== 'published') {
      return { error: 'INVALID_STATUS', message: `修订当前状态为 ${rev.status}，无法撤回` };
    }

    const now = new Date().toISOString();
    rev.status = 'withdrawn';
    rev.withdrawnAt = now;

    const doc = data.documents[rev.documentId];
    doc.currentVersionId = rev.oldVersionId;

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: rev.documentId,
      revisionId: revId,
      action: 'withdraw',
      operator,
      timestamp: now,
      detail: {
        from: rev.newVersionNumber,
        to: rev.oldVersionNumber,
        reason: '撤回已发布版本'
      }
    });

    return { revision: rev };
  });
}

function getArchives(docId) {
  const data = store.read();
  let archives = data.archives;
  if (docId) {
    archives = archives.filter(a => a.documentId === docId);
  }
  return archives.sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
}

function exportRevisionLog(docId, filters = {}) {
  const data = store.read();
  let logs = data.revisionLogs;

  if (docId) {
    logs = logs.filter(l => l.documentId === docId);
  }

  if (filters.action) {
    logs = logs.filter(l => l.action === filters.action);
  }

  if (filters.operator) {
    logs = logs.filter(l => l.operator === filters.operator);
  }

  if (filters.status) {
    const statusActionMap = {
      submitted: ['submit'],
      published: ['publish'],
      withdrawn: ['withdraw'],
      draft: ['draft_save', 'draft_delete']
    };
    const actions = statusActionMap[filters.status];
    if (actions) {
      logs = logs.filter(l => actions.includes(l.action));
    }
  }

  if (filters.actions && Array.isArray(filters.actions)) {
    logs = logs.filter(l => filters.actions.includes(l.action));
  }

  return logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function exportRevisionLogCSV(docId, filters = {}) {
  const logs = exportRevisionLog(docId, filters);

  const headers = [
    '时间',
    '操作',
    '操作人',
    '文档ID',
    '修订ID',
    '草稿ID',
    '详情'
  ];

  const actionLabels = {
    import: '导入文档',
    submit: '提交修订',
    publish: '发布版本',
    withdraw: '撤回版本',
    draft_save: '保存草稿',
    draft_delete: '删除草稿'
  };

  const rows = logs.map(log => {
    const detailStr = log.detail ? JSON.stringify(log.detail) : '';
    return [
      log.timestamp,
      actionLabels[log.action] || log.action,
      log.operator || '',
      log.documentId || '',
      log.revisionId || '',
      log.draftId || '',
      escapeCSV(detailStr)
    ];
  });

  const csvLines = [headers.join(',')];
  rows.forEach(row => {
    csvLines.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  });

  return csvLines.join('\n');
}

function escapeCSV(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/"/g, '""');
}

function verifyConsistency() {
  const data = store.read();
  const issues = [];

  for (const [docId, doc] of Object.entries(data.documents)) {
    if (!data.versions[doc.currentVersionId]) {
      issues.push(`文档 ${docId} 的当前版本指针 ${doc.currentVersionId} 指向不存在的版本`);
    }

    const publishedRevs = Object.values(data.revisions).filter(
      r => r.documentId === docId && r.status === 'published'
    );
    const latestPublished = publishedRevs.sort(
      (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
    )[0];

    if (latestPublished) {
      if (doc.currentVersionId !== latestPublished.newVersionId) {
        issues.push(`文档 ${docId} 的当前版本指针与最新已发布版本不一致`);
      }
    }
  }

  return { consistent: issues.length === 0, issues };
}

module.exports = {
  approveAndPublish,
  withdraw,
  getArchives,
  exportRevisionLog,
  exportRevisionLogCSV,
  verifyConsistency
};
