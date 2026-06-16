const { v4: uuidv4 } = require('uuid');
const store = require('./store');

function approveAndPublish(revId, approver) {
  return store.update(data => {
    const rev = data.revisions[revId];
    if (!rev) return { error: 'REVISION_NOT_FOUND', message: '修订不存在' };

    if (rev.status === 'published') {
      return { error: 'DUPLICATE_PUBLISH', message: '同一修订重复发布不会多写历史' };
    }

    if (rev.status !== 'submitted') {
      return { error: 'INVALID_STATUS', message: `修订当前状态为 ${rev.status}，无法审批发布` };
    }

    if (rev.submittedBy === approver) {
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

function exportRevisionLog(docId) {
  const data = store.read();
  let logs = data.revisionLogs;
  if (docId) {
    logs = logs.filter(l => l.documentId === docId);
  }
  return logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
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

module.exports = { approveAndPublish, withdraw, getArchives, exportRevisionLog, verifyConsistency };
