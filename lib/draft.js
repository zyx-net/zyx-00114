const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const docSvc = require('./document');
const authSvc = require('./auth');

const MAX_SNAPSHOTS_PER_DRAFT = 10;

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

      _createSnapshotInternal(data, draft, operator, now);

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

function _createSnapshotInternal(data, draft, operator, now) {
  const snapshotId = uuidv4();
  const snapshot = {
    id: snapshotId,
    draftId: draft.id,
    documentId: draft.documentId,
    content: draft.content,
    reason: draft.reason,
    baselineVersionId: draft.baselineVersionId,
    baselineVersionNumber: draft.baselineVersionNumber,
    createdBy: operator,
    createdAt: now
  };
  data.draftSnapshots[snapshotId] = snapshot;

  _trimSnapshotsInternal(data, draft.id);
}

function _trimSnapshotsInternal(data, draftId) {
  const snapshots = Object.values(data.draftSnapshots)
    .filter(s => s.draftId === draftId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (snapshots.length > MAX_SNAPSHOTS_PER_DRAFT) {
    const toDelete = snapshots.slice(MAX_SNAPSHOTS_PER_DRAFT);
    toDelete.forEach(s => delete data.draftSnapshots[s.id]);
  }
}

function _redactDraft(draft) {
  return {
    id: draft.id,
    documentId: draft.documentId,
    baselineVersionNumber: draft.baselineVersionNumber,
    status: draft.status,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    _redacted: true
  };
}

function getDraft(draftId, operator) {
  const data = store.read();
  const draft = data.drafts[draftId];
  if (!draft) return null;

  if (!operator) {
    return _redactDraft(draft);
  }

  const isOwner = draft.createdBy === operator;
  const canViewAll = authSvc.canViewAllDrafts(operator);

  if (isOwner || canViewAll) {
    return draft;
  }

  return _redactDraft(draft);
}

function getDraftsByDoc(docId, operator) {
  const data = store.read();
  const drafts = Object.values(data.drafts)
    .filter(d => d.documentId === docId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  if (!operator) {
    return drafts.map(_redactDraft);
  }

  const canViewAll = authSvc.canViewAllDrafts(operator);

  return drafts.map(draft => {
    const isOwner = draft.createdBy === operator;
    if (isOwner || canViewAll) {
      return draft;
    }
    return _redactDraft(draft);
  });
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

    _createSnapshotInternal(data, draft, operator, now);

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

    Object.values(data.draftSnapshots)
      .filter(s => s.draftId === draftId)
      .forEach(s => delete data.draftSnapshots[s.id]);

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

function getSnapshotsByDraft(draftId, operator) {
  const data = store.read();
  const draft = data.drafts[draftId];
  const snapshots = Object.values(data.draftSnapshots)
    .filter(s => s.draftId === draftId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!operator) {
    return snapshots.map(s => ({
      id: s.id,
      draftId: s.draftId,
      documentId: s.documentId,
      baselineVersionNumber: s.baselineVersionNumber,
      createdAt: s.createdAt,
      _redacted: true
    }));
  }

  const isOwner = draft && draft.createdBy === operator;

  return snapshots.map(s => {
    if (isOwner || authSvc.canViewSnapshot(s.createdBy, operator)) {
      return s;
    }
    return {
      id: s.id,
      draftId: s.draftId,
      documentId: s.documentId,
      baselineVersionNumber: s.baselineVersionNumber,
      createdAt: s.createdAt,
      _redacted: true
    };
  });
}

function getSnapshot(snapshotId, operator) {
  const data = store.read();
  const snapshot = data.draftSnapshots[snapshotId];
  if (!snapshot) return null;

  if (!operator) {
    return {
      id: snapshot.id,
      draftId: snapshot.draftId,
      documentId: snapshot.documentId,
      baselineVersionNumber: snapshot.baselineVersionNumber,
      createdAt: snapshot.createdAt,
      _redacted: true
    };
  }

  const draft = data.drafts[snapshot.draftId];
  const isOwner = draft && draft.createdBy === operator;

  if (isOwner || authSvc.canViewSnapshot(snapshot.createdBy, operator)) {
    return snapshot;
  }

  return {
    id: snapshot.id,
    draftId: snapshot.draftId,
    documentId: snapshot.documentId,
    baselineVersionNumber: snapshot.baselineVersionNumber,
    createdAt: snapshot.createdAt,
    _redacted: true
  };
}

function restoreSnapshot(snapshotId, operator) {
  return store.update(data => {
    const snapshot = data.draftSnapshots[snapshotId];
    if (!snapshot) return { error: 'SNAPSHOT_NOT_FOUND', message: '快照不存在' };

    const draft = data.drafts[snapshot.draftId];
    if (!draft) return { error: 'DRAFT_NOT_FOUND', message: '草稿不存在' };

    if (!authSvc.canRestoreSnapshot(snapshot.createdBy, operator)) {
      return { error: 'PERMISSION_DENIED', message: '只能恢复自己创建的快照' };
    }

    if (draft.status !== 'draft') {
      return { error: 'INVALID_STATUS', message: `草稿状态为 ${draft.status}，无法恢复快照` };
    }

    const doc = data.documents[draft.documentId];
    if (!doc) return { error: 'DOC_NOT_FOUND', message: '文档不存在' };

    const currentVer = data.versions[doc.currentVersionId];
    if (snapshot.baselineVersionId !== doc.currentVersionId) {
      const now = new Date().toISOString();
      data.revisionLogs.push({
        id: uuidv4(),
        documentId: draft.documentId,
        draftId: draft.id,
        snapshotId: snapshotId,
        action: 'draft_snapshot_restore_conflict',
        operator,
        timestamp: now,
        detail: {
          snapshotBaselineVersion: snapshot.baselineVersionNumber,
          currentVersion: currentVer ? currentVer.versionNumber : null,
          snapshotId
        }
      });

      return {
        error: 'BASELINE_CONFLICT',
        message: `恢复被拦截：快照基于版本 ${snapshot.baselineVersionNumber}，但文档当前版本已更新为 ${currentVer ? currentVer.versionNumber : '未知'}，恢复会覆盖新版本，已拦截`,
        detail: {
          snapshotBaselineVersion: snapshot.baselineVersionNumber,
          snapshotBaselineVersionId: snapshot.baselineVersionId,
          currentVersion: currentVer ? currentVer.versionNumber : null,
          currentVersionId: doc.currentVersionId,
          snapshotId
        }
      };
    }

    const now = new Date().toISOString();

    _createSnapshotInternal(data, draft, operator, now);

    draft.content = snapshot.content;
    draft.reason = snapshot.reason;
    draft.baselineVersionId = snapshot.baselineVersionId;
    draft.baselineVersionNumber = snapshot.baselineVersionNumber;
    draft.updatedAt = now;

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: draft.documentId,
      draftId: draft.id,
      snapshotId: snapshotId,
      action: 'draft_snapshot_restore',
      operator,
      timestamp: now,
      detail: {
        baselineVersion: snapshot.baselineVersionNumber,
        snapshotId,
        snapshotCreatedAt: snapshot.createdAt
      }
    });

    return { draft, snapshot };
  });
}

function deleteSnapshot(snapshotId, operator) {
  return store.update(data => {
    const snapshot = data.draftSnapshots[snapshotId];
    if (!snapshot) return { error: 'SNAPSHOT_NOT_FOUND', message: '快照不存在' };

    if (!authSvc.canDeleteSnapshot(snapshot.createdBy, operator)) {
      return { error: 'PERMISSION_DENIED', message: '只能删除自己创建的快照' };
    }

    const now = new Date().toISOString();

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: snapshot.documentId,
      draftId: snapshot.draftId,
      snapshotId: snapshotId,
      action: 'draft_snapshot_delete',
      operator,
      timestamp: now,
      detail: {
        baselineVersion: snapshot.baselineVersionNumber,
        snapshotId
      }
    });

    delete data.draftSnapshots[snapshotId];

    return { success: true };
  });
}

module.exports = {
  saveDraft,
  getDraft,
  getDraftsByDoc,
  getDraftsByUser,
  updateDraft,
  deleteDraft,
  markDraftSubmitted,
  checkBaselineConflict,
  getSnapshotsByDraft,
  getSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  MAX_SNAPSHOTS_PER_DRAFT
};
