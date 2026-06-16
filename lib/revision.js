const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const docSvc = require('./document');
const diffSvc = require('./diff');
const authSvc = require('./auth');
const draftSvc = require('./draft');

function createRevision(docId, newContent, reason, operator) {
  if (!reason || reason.trim() === '') {
    return { error: 'REVISION_REASON_REQUIRED', message: '修订理由不能为空，无法提交' };
  }

  if (!authSvc.canSubmitRevision(operator)) {
    return { error: 'PERMISSION_DENIED', message: '当前用户没有提交修订的权限' };
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
      withdrawnAt: null,
      baselineVersionId: oldVersion.id
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
        reason,
        baselineVersion: oldVersion.versionNumber
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

function submitRevisionFromDraft(draftId, operator) {
  if (!authSvc.canSubmitRevision(operator)) {
    return { error: 'PERMISSION_DENIED', message: '当前用户没有提交修订的权限' };
  }

  return store.update(data => {
    const draft = data.drafts[draftId];
    if (!draft) return { error: 'DRAFT_NOT_FOUND', message: '草稿不存在' };

    if (draft.createdBy !== operator) {
      return { error: 'PERMISSION_DENIED', message: '只能提交自己的草稿' };
    }

    if (draft.status !== 'draft') {
      return { error: 'INVALID_STATUS', message: `草稿状态为 ${draft.status}，无法提交` };
    }

    const doc = data.documents[draft.documentId];
    if (!doc) return { error: 'DOC_NOT_FOUND', message: '文档不存在' };

    const currentVer = data.versions[doc.currentVersionId];
    if (!currentVer) return { error: 'VERSION_NOT_FOUND', message: '当前版本不存在' };

    if (draft.baselineVersionId !== doc.currentVersionId) {
      return {
        error: 'BASELINE_CONFLICT',
        message: `基线版本冲突：草稿基于 ${draft.baselineVersionNumber}，当前版本已更新为 ${currentVer.versionNumber}`,
        detail: {
          baselineVersion: draft.baselineVersionNumber,
          baselineVersionId: draft.baselineVersionId,
          currentVersion: currentVer.versionNumber,
          currentVersionId: doc.currentVersionId
        }
      };
    }

    const reason = draft.reason;
    if (!reason || reason.trim() === '') {
      return { error: 'REVISION_REASON_REQUIRED', message: '修订理由不能为空，无法提交' };
    }

    if (diffSvc.isIdenticalContent(currentVer.content, draft.content)) {
      return { error: 'INVALID_CHANGE', message: '内容完全相同，属于无效变更' };
    }

    const diff = diffSvc.generateDiff(currentVer.content, draft.content);
    const revId = uuidv4();
    const newVerId = uuidv4();
    const now = new Date().toISOString();
    const majorMinor = parseVersion(currentVer.versionNumber);
    const newVersionNumber = `${majorMinor.major}.${majorMinor.minor + 1}`;

    data.versions[newVerId] = {
      id: newVerId,
      documentId: draft.documentId,
      versionNumber: newVersionNumber,
      content: draft.content,
      createdBy: operator,
      createdAt: now
    };

    data.revisions[revId] = {
      id: revId,
      documentId: draft.documentId,
      oldVersionId: currentVer.id,
      newVersionId: newVerId,
      oldVersionNumber: currentVer.versionNumber,
      newVersionNumber,
      reason,
      diff,
      status: 'submitted',
      submittedBy: operator,
      submittedAt: now,
      approvedBy: null,
      approvedAt: null,
      publishedAt: null,
      withdrawnAt: null,
      baselineVersionId: currentVer.id,
      fromDraftId: draftId
    };

    draft.status = 'submitted';
    draft.updatedAt = now;

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: draft.documentId,
      revisionId: revId,
      draftId: draftId,
      action: 'submit',
      operator,
      timestamp: now,
      detail: {
        from: currentVer.versionNumber,
        to: newVersionNumber,
        reason,
        baselineVersion: currentVer.versionNumber,
        fromDraft: true
      }
    });

    return { revision: data.revisions[revId], draft };
  });
}

module.exports = { createRevision, getRevision, getRevisionsByDoc, submitRevisionFromDraft };
