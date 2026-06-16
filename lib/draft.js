const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const docSvc = require('./document');

function saveDraft(docId, content, reason, operator) {
  return store.update(data => {
    const doc = data.documents[docId];
    if (!doc) return { error: 'DOC_NOT_FOUND', message: '文档不存在' };

    const currentVer = data.versions[doc.currentVersionId];
    if (!currentVer) return { error: 'VERSION_NOT_FOUND', message: '当前版本不存在' };

    const now = new Date().toISOString();

    let draft = null;
    let isNew = true;

    const existingDrafts = Object.values(data.drafts).filter(
      d => d.documentId === docId && d.createdBy === operator && d.status === 'draft'
    );

    if (existingDrafts.length > 0) {
      draft = existingDrafts[0];
      isNew = false;
      draft.content = content;
      draft.reason = reason || '';
      draft.updatedAt = now;
    } else {
      const draftId = uuidv4();
      draft = {
        id: draftId,
        documentId: docId,
        baselineVersionId: currentVer.id,
        baselineVersionNumber: currentVer.versionNumber,
        content,
        reason: reason || '',
        createdBy: operator,
        createdAt: now,
        updatedAt: now,
        status: 'draft'
      };
      data.drafts[draftId] = draft;
    }

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: docId,
      draftId: draft.id,
      action: 'draft_save',
      operator,
      timestamp: now,
      detail: {
        baselineVersion: currentVer.versionNumber,
        isNew
      }
    });

    return { draft, isNew };
  });
}

function getDraft(draftId) {
  const data = store.read();
  return data.drafts[draftId] || null;
}

function getDraftsByDoc(docId) {
  const data = store.read();
  return Object.values(data.drafts)
    .filter(d => d.documentId === docId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function getDraftsByUser(operator) {
  const data = store.read();
  return Object.values(data.drafts)
    .filter(d => d.createdBy === operator)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function updateDraft(draftId, content, reason, operator) {
  return store.update(data => {
    const draft = data.drafts[draftId];
    if (!draft) return { error: 'DRAFT_NOT_FOUND', message: '草稿不存在' };

    if (draft.createdBy !== operator) {
      return { error: 'PERMISSION_DENIED', message: '只能修改自己创建的草稿' };
    }

    if (draft.status !== 'draft') {
      return { error: 'INVALID_STATUS', message: `草稿状态为 ${draft.status}，无法修改` };
    }

    const now = new Date().toISOString();
    draft.content = content;
    draft.reason = reason !== undefined ? reason : draft.reason;
    draft.updatedAt = now;

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: draft.documentId,
      draftId: draft.id,
      action: 'draft_save',
      operator,
      timestamp: now,
      detail: {
        baselineVersion: draft.baselineVersionNumber
      }
    });

    return { draft };
  });
}

function deleteDraft(draftId, operator) {
  return store.update(data => {
    const draft = data.drafts[draftId];
    if (!draft) return { error: 'DRAFT_NOT_FOUND', message: '草稿不存在' };

    if (draft.createdBy !== operator) {
      return { error: 'PERMISSION_DENIED', message: '只能删除自己创建的草稿' };
    }

    const now = new Date().toISOString();

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: draft.documentId,
      draftId: draft.id,
      action: 'draft_delete',
      operator,
      timestamp: now,
      detail: {
        baselineVersion: draft.baselineVersionNumber
      }
    });

    delete data.drafts[draftId];

    return { success: true };
  });
}

function markDraftSubmitted(draftId) {
  return store.update(data => {
    const draft = data.drafts[draftId];
    if (!draft) return { error: 'DRAFT_NOT_FOUND', message: '草稿不存在' };

    draft.status = 'submitted';
    draft.updatedAt = new Date().toISOString();

    return { draft };
  });
}

function checkBaselineConflict(draftId) {
  const data = store.read();
  const draft = data.drafts[draftId];
  if (!draft) return { error: 'DRAFT_NOT_FOUND', message: '草稿不存在' };

  const doc = data.documents[draft.documentId];
  if (!doc) return { error: 'DOC_NOT_FOUND', message: '文档不存在' };

  const currentVer = data.versions[doc.currentVersionId];
  const hasConflict = draft.baselineVersionId !== doc.currentVersionId;

  return {
    hasConflict,
    baselineVersion: draft.baselineVersionNumber,
    currentVersion: currentVer ? currentVer.versionNumber : null,
    baselineVersionId: draft.baselineVersionId,
    currentVersionId: doc.currentVersionId
  };
}

module.exports = {
  saveDraft,
  getDraft,
  getDraftsByDoc,
  getDraftsByUser,
  updateDraft,
  deleteDraft,
  markDraftSubmitted,
  checkBaselineConflict
};
