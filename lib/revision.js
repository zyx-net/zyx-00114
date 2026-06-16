const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const docSvc = require('./document');
const diffSvc = require('./diff');

function createRevision(docId, newContent, reason, operator) {
  if (!reason || reason.trim() === '') {
    return { error: 'REVISION_REASON_REQUIRED', message: '修订理由不能为空，无法提交' };
  }

  return store.update(data => {
    const doc = data.documents[docId];
    if (!doc) return { error: 'DOC_NOT_FOUND', message: '文档不存在' };

    const oldVersion = data.versions[doc.currentVersionId];
    if (!oldVersion) return { error: 'VERSION_NOT_FOUND', message: '当前版本不存在' };

    if (diffSvc.isIdenticalContent(oldVersion.content, newContent)) {
      return { error: 'INVALID_CHANGE', message: '内容完全相同，属于无效变更' };
    }

    const diff = diffSvc.generateDiff(oldVersion.content, newContent);
    const revId = uuidv4();
    const newVerId = uuidv4();
    const now = new Date().toISOString();
    const majorMinor = parseVersion(oldVersion.versionNumber);
    const newVersionNumber = `${majorMinor.major}.${majorMinor.minor + 1}`;

    data.versions[newVerId] = {
      id: newVerId,
      documentId: docId,
      versionNumber: newVersionNumber,
      content: newContent,
      createdBy: operator,
      createdAt: now
    };

    data.revisions[revId] = {
      id: revId,
      documentId: docId,
      oldVersionId: oldVersion.id,
      newVersionId: newVerId,
      oldVersionNumber: oldVersion.versionNumber,
      newVersionNumber,
      reason,
      diff,
      status: 'submitted',
      submittedBy: operator,
      submittedAt: now,
      approvedBy: null,
      approvedAt: null,
      publishedAt: null,
      withdrawnAt: null
    };

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: docId,
      revisionId: revId,
      action: 'submit',
      operator,
      timestamp: now,
      detail: {
        from: oldVersion.versionNumber,
        to: newVersionNumber,
        reason
      }
    });

    return { revision: data.revisions[revId] };
  });
}

function getRevision(revId) {
  const data = store.read();
  return data.revisions[revId] || null;
}

function getRevisionsByDoc(docId) {
  const data = store.read();
  return Object.values(data.revisions)
    .filter(r => r.documentId === docId)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function parseVersion(ver) {
  const parts = ver.split('.');
  return { major: parseInt(parts[0]) || 1, minor: parseInt(parts[1]) || 0 };
}

module.exports = { createRevision, getRevision, getRevisionsByDoc };
