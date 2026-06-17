const express = require('express');
const router = express.Router();
const docSvc = require('../lib/document');
const revSvc = require('../lib/revision');
const archSvc = require('../lib/archive');
const diffSvc = require('../lib/diff');
const draftSvc = require('../lib/draft');
const authSvc = require('../lib/auth');
const auditSvc = require('../lib/audit-playback');
const batchSvc = require('../lib/batch-trace');
const vaultSvc = require('../lib/playback-vault');
const deskSvc = require('../lib/sensitive-desk');
const store = require('../lib/store');

router.get('/export', (req, res) => {
  const data = store.exportAll();
  res.setHeader('Content-Disposition', 'attachment; filename="data-export.json"');
  res.json(data);
});

router.post('/import', (req, res) => {
  const imported = req.body;
  const operator = req.body.operator || null;
  if (!imported || typeof imported !== 'object') {
    return res.status(400).json({ error: 'Invalid import data' });
  }
  const result = store.importData(imported, operator);
  if (result.error) {
    return res.status(422).json(result);
  }
  if (result.conflictCount > 0 || result.ownershipIssueCount > 0) {
    return res.status(202).json({ ...result, message: '部分导入成功，存在冲突或归属权问题，请检查详情' });
  }
  res.json(result);
});

router.post('/documents', (req, res) => {
  const { title, content, operator } = req.body;
  if (!title || content === undefined) {
    return res.status(400).json({ error: 'title and content are required' });
  }
  const result = docSvc.importDocument(title, content, operator || 'system');
  res.status(201).json(result);
});

router.get('/documents', (req, res) => {
  const docs = docSvc.listDocuments();
  res.json(docs);
});

router.get('/documents/:docId', (req, res) => {
  const result = docSvc.getDocument(req.params.docId);
  if (!result) return res.status(404).json({ error: 'Document not found' });
  res.json(result);
});

router.get('/documents/:docId/versions', (req, res) => {
  const versions = docSvc.getVersionsByDoc(req.params.docId);
  res.json(versions);
});

router.get('/versions/:verId', (req, res) => {
  const version = docSvc.getVersion(req.params.verId);
  if (!version) return res.status(404).json({ error: 'Version not found' });
  res.json(version);
});

router.post('/diff', (req, res) => {
  const { oldContent, newContent } = req.body;
  if (oldContent === undefined || newContent === undefined) {
    return res.status(400).json({ error: 'oldContent and newContent are required' });
  }
  const diff = diffSvc.generateDiff(oldContent, newContent);
  res.json(diff);
});

router.post('/documents/:docId/revisions', (req, res) => {
  const { content, reason, operator } = req.body;
  if (content === undefined) {
    return res.status(400).json({ error: 'content is required' });
  }
  const result = revSvc.createRevision(req.params.docId, content, reason, operator || 'unknown');
  if (result.error) {
    return res.status(422).json(result);
  }
  res.status(201).json(result);
});

router.get('/documents/:docId/revisions', (req, res) => {
  const revisions = revSvc.getRevisionsByDoc(req.params.docId);
  res.json(revisions);
});

router.get('/revisions/:revId', (req, res) => {
  const rev = revSvc.getRevision(req.params.revId);
  if (!rev) return res.status(404).json({ error: 'Revision not found' });
  res.json(rev);
});

router.post('/revisions/:revId/approve', (req, res) => {
  const { approver } = req.body;
  if (!approver) {
    return res.status(400).json({ error: 'approver is required' });
  }
  const result = archSvc.approveAndPublish(req.params.revId, approver);
  if (result.error) {
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post('/revisions/:revId/withdraw', (req, res) => {
  const { operator } = req.body;
  const result = archSvc.withdraw(req.params.revId, operator || 'system');
  if (result.error) {
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/documents/:docId/archives', (req, res) => {
  const archives = archSvc.getArchives(req.params.docId);
  res.json(archives);
});

router.get('/consistency', (req, res) => {
  const result = archSvc.verifyConsistency();
  res.json(result);
});

router.get('/users', (req, res) => {
  const users = authSvc.getUsers();
  res.json(users);
});

router.post('/drafts', (req, res) => {
  const { documentId, content, reason, operator } = req.body;
  if (!documentId || content === undefined) {
    return res.status(400).json({ error: 'documentId and content are required' });
  }
  const result = draftSvc.saveDraft(documentId, content, reason, operator || 'unknown');
  if (result.error) {
    return res.status(422).json(result);
  }
  res.status(201).json(result);
});

router.get('/drafts', (req, res) => {
  const { operator, documentId } = req.query;
  let drafts;
  if (operator) {
    drafts = draftSvc.getDraftsByUser(operator);
  } else if (documentId) {
    drafts = draftSvc.getDraftsByDoc(documentId, operator || null);
  } else {
    drafts = [];
  }
  res.json(drafts);
});

router.get('/drafts/:draftId', (req, res) => {
  const operator = req.query.operator || null;
  const draft = draftSvc.getDraft(req.params.draftId, operator);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

router.put('/drafts/:draftId', (req, res) => {
  const { content, reason, operator } = req.body;
  const result = draftSvc.updateDraft(req.params.draftId, content, reason, operator || 'unknown');
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') {
      return res.status(403).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.delete('/drafts/:draftId', (req, res) => {
  const { operator } = req.body;
  const result = draftSvc.deleteDraft(req.params.draftId, operator || 'unknown');
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') {
      return res.status(403).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/drafts/:draftId/conflict', (req, res) => {
  const result = draftSvc.checkBaselineConflict(req.params.draftId);
  if (result.error) {
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post('/drafts/:draftId/submit', (req, res) => {
  const { operator } = req.body;
  const result = revSvc.submitRevisionFromDraft(req.params.draftId, operator || 'unknown');
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') {
      return res.status(403).json(result);
    }
    if (result.error === 'BASELINE_CONFLICT') {
      return res.status(409).json(result);
    }
    return res.status(422).json(result);
  }
  res.status(201).json(result);
});

router.get('/drafts/:draftId/snapshots', (req, res) => {
  const operator = req.query.operator;
  const snapshots = draftSvc.getSnapshotsByDraft(req.params.draftId, operator || null);
  res.json(snapshots);
});

router.get('/snapshots/:snapshotId', (req, res) => {
  const operator = req.query.operator;
  const snapshot = draftSvc.getSnapshot(req.params.snapshotId, operator || null);
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
  res.json(snapshot);
});

router.post('/snapshots/:snapshotId/restore', (req, res) => {
  const { operator } = req.body;
  const result = draftSvc.restoreSnapshot(req.params.snapshotId, operator || 'unknown');
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') {
      return res.status(403).json(result);
    }
    if (result.error === 'BASELINE_CONFLICT') {
      return res.status(409).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.delete('/snapshots/:snapshotId', (req, res) => {
  const { operator } = req.body;
  const result = draftSvc.deleteSnapshot(req.params.snapshotId, operator || 'unknown');
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') {
      return res.status(403).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/revision-log', (req, res) => {
  const { documentId, action, operator, status } = req.query;
  const filters = {};
  if (action) filters.action = action;
  if (operator) filters.operator = operator;
  if (status) filters.status = status;
  const logs = archSvc.exportRevisionLog(documentId || null, filters);
  res.json(logs);
});

router.get('/revision-log/export.csv', (req, res) => {
  const { documentId, action, operator, status } = req.query;
  const filters = {};
  if (action) filters.action = action;
  if (operator) filters.operator = operator;
  if (status) filters.status = status;
  const csv = archSvc.exportRevisionLogCSV(documentId || null, filters);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="revision-log.csv"');
  res.send('\uFEFF' + csv);
});

router.get('/documents/:docId/revision-log', (req, res) => {
  const { action, operator, status } = req.query;
  const filters = {};
  if (action) filters.action = action;
  if (operator) filters.operator = operator;
  if (status) filters.status = status;
  const logs = archSvc.exportRevisionLog(req.params.docId, filters);
  res.json(logs);
});

router.get('/documents/:docId/revision-log/export.csv', (req, res) => {
  const { action, operator, status } = req.query;
  const filters = {};
  if (action) filters.action = action;
  if (operator) filters.operator = operator;
  if (status) filters.status = status;
  const csv = archSvc.exportRevisionLogCSV(req.params.docId, filters);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="revision-log.csv"');
  res.send('\uFEFF' + csv);
});

router.post('/revision-log/import', (req, res) => {
  const { logs, operator, source, notes } = req.body;
  if (!logs || !Array.isArray(logs)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '请求体必须包含 logs 数组' });
  }
  const result = auditSvc.importRevisionLogs(logs, operator, { source, notes });
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    return res.status(422).json(result);
  }
  if (result.conflictCount > 0) {
    return res.status(202).json({ ...result, message: '部分导入成功，存在冲突记录，请检查详情' });
  }
  res.status(201).json(result);
});

router.get('/revision-log/imported', (req, res) => {
  const { importer, since } = req.query;
  const filters = {};
  if (importer) filters.importer = importer;
  if (since) filters.since = since;
  res.json(auditSvc.getImportedBatches(filters));
});

router.get('/revision-log/imported/:batchId', (req, res) => {
  const batch = auditSvc.getImportedBatch(req.params.batchId);
  if (!batch) return res.status(404).json({ error: 'BATCH_NOT_FOUND', message: '导入批次不存在' });
  res.json(batch);
});

router.get('/revision-log/imported/:batchId/logs', (req, res) => {
  const logs = auditSvc.getImportedLogsByBatch(req.params.batchId);
  if (!logs) return res.status(404).json({ error: 'BATCH_NOT_FOUND', message: '导入批次不存在' });
  res.json(logs);
});

router.post('/revision-log/imported/:batchId/reimport', (req, res) => {
  const { strategy, operator } = req.body;
  if (!strategy) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '必须指定冲突处理策略: skip/overwrite/force_new_id' });
  }
  const result = auditSvc.reimportWithStrategy(req.params.batchId, strategy, operator);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') return res.status(403).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post('/revision-log/playback', (req, res) => {
  const { logIds, operator, notes, mode } = req.body;
  const result = auditSvc.playbackRevisionLogs(logIds, operator, { notes, mode });
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    return res.status(422).json(result);
  }
  res.status(201).json(result);
});

router.get('/revision-log/playback-records', (req, res) => {
  const { playbackBy, since } = req.query;
  const filters = {};
  if (playbackBy) filters.playbackBy = playbackBy;
  if (since) filters.since = since;
  res.json(auditSvc.getPlaybackRecords(filters));
});

router.get('/revision-log/playback-records/:recordId', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const record = auditSvc.getPlaybackRecord(req.params.recordId, viewer);
  if (!record) return res.status(404).json({ error: 'RECORD_NOT_FOUND', message: '回放记录不存在' });
  res.json(record);
});

router.post('/batch-trace/import', (req, res) => {
  const { logs, operator, source, notes, conflictStrategy } = req.body;
  if (!logs || !Array.isArray(logs)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '请求体必须包含 logs 数组' });
  }
  const result = batchSvc.createBatch(logs, operator, { source, notes, conflictStrategy });
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'DUPLICATE_IMPORT') {
      return res.status(409).json(result);
    }
    return res.status(422).json(result);
  }
  if (result.skipped) {
    return res.status(200).json(result);
  }
  if (result.conflictCount > 0 && result.conflictStrategy !== 'merge') {
    return res.status(202).json({ ...result, message: '部分导入成功，存在冲突记录，请检查详情' });
  }
  res.status(201).json(result);
});

router.get('/batch-trace/batches', (req, res) => {
  const { importedBy, since, sourceFile, hasConflicts } = req.query;
  const filters = {};
  if (importedBy) filters.importedBy = importedBy;
  if (since) filters.since = since;
  if (sourceFile) filters.sourceFile = sourceFile;
  if (hasConflicts) filters.hasConflicts = hasConflicts === 'true';
  res.json(batchSvc.getBatches(filters));
});

router.get('/batch-trace/batches/:batchId', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const batch = batchSvc.getBatch(req.params.batchId, viewer);
  if (!batch) return res.status(404).json({ error: 'BATCH_NOT_FOUND', message: '导入批次不存在' });
  res.json(batch);
});

router.get('/batch-trace/batches/:batchId/logs', (req, res) => {
  const logs = batchSvc.getLogsByBatch(req.params.batchId);
  res.json(logs);
});

router.get('/batch-trace/batches/:batchId/playbacks', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const playbacks = batchSvc.getPlaybacksByBatch(req.params.batchId);
  if (!viewer) {
    const redacted = playbacks.map(p => p._redacted ? p : {
      id: p.id,
      playbackAt: p.playbackAt,
      playbackBy: p.playbackBy,
      logCount: p.logCount,
      summary: p.summary,
      _redacted: true
    });
    return res.json(redacted);
  }
  res.json(playbacks);
});

router.post('/batch-trace/batches/:batchId/reimport', (req, res) => {
  const { strategy, operator } = req.body;
  if (!strategy) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '必须指定冲突处理策略: skip/overwrite/force_new_id' });
  }
  const result = batchSvc.reimportBatchWithStrategy(req.params.batchId, strategy, operator);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') return res.status(403).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/batch-trace/batches/:batchId/export-audit', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const result = batchSvc.exportBatchAuditSummary(req.params.batchId, viewer);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') return res.status(403).json(result);
    if (result.error === 'BATCH_NOT_FOUND') return res.status(404).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post('/batch-trace/link-playback', (req, res) => {
  const { playbackRecordId, batchId, operator } = req.body;
  if (!playbackRecordId || !batchId || !operator) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '必须指定 playbackRecordId、batchId 和 operator' });
  }
  const result = batchSvc.linkPlaybackToBatch(playbackRecordId, batchId, operator);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') return res.status(403).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/batch-trace/duplicate-check', (req, res) => {
  const { sourceDigest, contentFingerprint } = req.query;
  if (!sourceDigest && !contentFingerprint) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '必须提供 sourceDigest 或 contentFingerprint' });
  }
  const result = batchSvc.checkDuplicateImport(sourceDigest || '', contentFingerprint || '');
  res.json(result);
});

// ========== 回放授权保险箱模块 ==========

router.post('/vault/create', (req, res) => {
  const { batchId, operator, notes, redactionRules } = req.body;
  if (!batchId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '必须指定 batchId' });
  }
  if (!operator) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' });
  }
  const result = vaultSvc.createVaultBatch(batchId, operator, { notes, redactionRules });
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'BATCH_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(422).json(result);
  }
  res.status(201).json(result);
});

router.get('/vault/batches', (req, res) => {
  const { ownerId, status, since, viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  const filters = {};
  if (ownerId) filters.ownerId = ownerId;
  if (status) filters.status = status;
  if (since) filters.since = since;
  const result = vaultSvc.getVaultBatches(filters, viewerParam);
  res.json(result);
});

router.get('/vault/batches/:vaultBatchId', (req, res) => {
  const { viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  const result = vaultSvc.getVaultBatch(req.params.vaultBatchId, viewerParam);
  if (!result) {
    return res.status(404).json({ error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' });
  }
  res.json(result);
});

router.get('/vault/batches/:vaultBatchId/logs', (req, res) => {
  const { viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  const result = vaultSvc.getVaultLogs(req.params.vaultBatchId, viewerParam);
  if (result.error) {
    if (result.error === 'BATCH_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/vault/batches/:vaultBatchId/playbacks', (req, res) => {
  const { viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  const result = vaultSvc.getVaultPlaybacks(req.params.vaultBatchId, viewerParam);
  if (result.error) {
    if (result.error === 'BATCH_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post('/vault/batches/:vaultBatchId/playback', (req, res) => {
  const { operator, notes } = req.body;
  if (!operator) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' });
  }
  const result = vaultSvc.playbackVaultBatch(req.params.vaultBatchId, operator, { notes });
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'BATCH_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(422).json(result);
  }
  res.status(201).json(result);
});

router.get('/vault/batches/:vaultBatchId/notes', (req, res) => {
  const { viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  const result = vaultSvc.getVaultNotes(req.params.vaultBatchId, viewerParam);
  if (result.error) {
    if (result.error === 'BATCH_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.put('/vault/batches/:vaultBatchId/notes', (req, res) => {
  const { operator, notes } = req.body;
  if (!operator) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' });
  }
  const result = vaultSvc.updateVaultNotes(req.params.vaultBatchId, operator, notes || '');
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'BATCH_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/vault/batches/:vaultBatchId/trail', (req, res) => {
  const { viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  const result = vaultSvc.getVaultAccessTrail(req.params.vaultBatchId, viewerParam);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') {
      return res.status(403).json(result);
    }
    if (result.error === 'BATCH_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/vault/batches/:vaultBatchId/export', (req, res) => {
  const { viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  const result = vaultSvc.exportVaultAuditPackage(req.params.vaultBatchId, viewerParam);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'BATCH_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(422).json(result);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.json({ packageData: result.packageData, filename: result.filename, fingerprint: result.fingerprint });
});

router.post('/vault/import', (req, res) => {
  const { packageData, operator, conflictStrategy, sourceBatchStrategy } = req.body;
  if (!operator) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' });
  }
  if (!packageData) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '必须提供 packageData' });
  }
  const result = vaultSvc.importVaultAuditPackage(packageData, operator, {
    conflictStrategy: conflictStrategy || 'reject',
    sourceBatchStrategy: sourceBatchStrategy || 'merge'
  });
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'PACKAGE_TAMPERED' || result.error === 'INVALID_PACKAGE') {
      return res.status(422).json(result);
    }
    return res.status(422).json(result);
  }
  if (result.status === 'conflict') {
    return res.status(409).json(result);
  }
  if (result.status === 'skipped') {
    return res.status(200).json(result);
  }
  if (result.status === 'forced') {
    return res.status(201).json(result);
  }
  if (result.conflictCount > 0) {
    return res.status(202).json({ ...result, message: '部分导入成功，存在冲突记录，请检查详情' });
  }
  res.status(201).json(result);
});

router.get('/vault/imported-packages', (req, res) => {
  const { importer, type, status, fingerprint } = req.query;
  const filters = {};
  if (importer) filters.importer = importer;
  if (type) filters.type = type;
  if (status) filters.status = status;
  if (fingerprint) filters.fingerprint = fingerprint;
  res.json(vaultSvc.getImportedPackages(filters));
});

router.get('/vault/redaction-rules', (req, res) => {
  const { viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  const result = vaultSvc.getVaultRedactionRules(viewerParam);
  if (result.error) {
    return res.status(403).json(result);
  }
  res.json(result);
});

// ========== 敏感审计借阅台模块 ==========

router.get('/sensitive-desk/config', (req, res) => {
  const config = deskSvc.getDeskConfig();
  res.json(config);
});

router.put('/sensitive-desk/config', (req, res) => {
  const { operator, maxDurationMinutes, defaultDurationMinutes } = req.body;
  if (!operator) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' });
  }
  const result = deskSvc.updateDeskConfig({ maxDurationMinutes, defaultDurationMinutes }, operator);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') return res.status(403).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post('/sensitive-desk/apply', (req, res) => {
  const { targetVaultBatchId, applicant, reason, durationMinutes } = req.body;
  if (!applicant) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定申请人' });
  }
  const result = deskSvc.applyForGrant(targetVaultBatchId, applicant, { reason, durationMinutes });
  if (result.error) {
    if (result.error === 'OPERATOR_REQUIRED' || result.error === 'PERMISSION_DENIED') {
      return res.status(403).json(result);
    }
    if (result.error === 'BATCH_NOT_FOUND') return res.status(404).json(result);
    if (result.error === 'ALREADY_AUTHORIZED') return res.status(422).json(result);
    return res.status(422).json(result);
  }
  res.status(201).json(result);
});

router.post('/sensitive-desk/:grantId/approve', (req, res) => {
  const { approver, notes } = req.body;
  if (!approver) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定审批人' });
  }
  const result = deskSvc.approveGrant(req.params.grantId, approver, { notes });
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'GRANT_NOT_FOUND') return res.status(404).json(result);
    if (result.error === 'BATCH_NOT_FOUND') return res.status(404).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post('/sensitive-desk/:grantId/revoke', (req, res) => {
  const { operator, reason } = req.body;
  if (!operator) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定操作人' });
  }
  const result = deskSvc.revokeGrant(req.params.grantId, operator, reason);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'GRANT_NOT_FOUND') return res.status(404).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post('/sensitive-desk/:grantId/open-session', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '必须指定用户ID' });
  }
  const result = deskSvc.openSession(req.params.grantId, userId);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') return res.status(403).json(result);
    if (result.error === 'GRANT_INVALID') return res.status(422).json(result);
    return res.status(422).json(result);
  }
  res.status(201).json(result);
});

router.get('/sensitive-desk/sessions/:sessionId/validate', (req, res) => {
  const result = deskSvc.validateSession(req.params.sessionId);
  if (!result.valid && result.reason === 'SESSION_NOT_FOUND') {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: '会话不存在' });
  }
  res.json(result);
});

router.get('/sensitive-desk/grants', (req, res) => {
  const { targetVaultBatchId, applicant, approver, status } = req.query;
  const filters = {};
  if (targetVaultBatchId) filters.targetVaultBatchId = targetVaultBatchId;
  if (applicant) filters.applicant = applicant;
  if (approver) filters.approver = approver;
  if (status) filters.status = status;
  res.json(deskSvc.getGrants(filters));
});

router.get('/sensitive-desk/grants/:grantId', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const result = deskSvc.getGrant(req.params.grantId, viewer);
  if (!result) return res.status(404).json({ error: 'GRANT_NOT_FOUND', message: '授权单不存在' });
  res.json(result);
});

router.get('/sensitive-desk/vault-batches/:vaultBatchId/detail', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const grantId = req.query.grantId || null;
  if (!viewer) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定查看人' });
  }
  const result = deskSvc.getSensitiveDetail(req.params.vaultBatchId, viewer, grantId);
  if (result.error) {
    if (result.error === 'BATCH_NOT_FOUND') return res.status(404).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/sensitive-desk/vault-batches/:vaultBatchId/logs', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const grantId = req.query.grantId || null;
  if (!viewer) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定查看人' });
  }
  const result = deskSvc.getSensitiveLogs(req.params.vaultBatchId, viewer, grantId);
  if (result.error) {
    if (result.error === 'BATCH_NOT_FOUND') return res.status(404).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/sensitive-desk/vault-batches/:vaultBatchId/playbacks', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const grantId = req.query.grantId || null;
  if (!viewer) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定查看人' });
  }
  const result = deskSvc.getSensitivePlaybacks(req.params.vaultBatchId, viewer, grantId);
  if (result.error) {
    if (result.error === 'BATCH_NOT_FOUND') return res.status(404).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/sensitive-desk/vault-batches/:vaultBatchId/notes', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const grantId = req.query.grantId || null;
  if (!viewer) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定查看人' });
  }
  const result = deskSvc.getSensitiveNotes(req.params.vaultBatchId, viewer, grantId);
  if (result.error) {
    if (result.error === 'BATCH_NOT_FOUND') return res.status(404).json(result);
    return res.status(422).json(result);
  }
  res.json(result);
});

router.get('/sensitive-desk/vault-batches/:vaultBatchId/export', (req, res) => {
  const viewer = req.query.viewer || req.query.operator || null;
  const grantId = req.query.grantId || null;
  if (!viewer) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定导出人' });
  }
  const result = deskSvc.exportSensitivePackage(req.params.vaultBatchId, viewer, grantId);
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED') return res.status(403).json(result);
    if (result.error === 'BATCH_NOT_FOUND') return res.status(404).json(result);
    return res.status(422).json(result);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.json({ packageData: result.packageData, filename: result.filename, fingerprint: result.fingerprint });
});

router.post('/sensitive-desk/import', (req, res) => {
  const { packageData, operator, conflictStrategy, sourceBatchStrategy } = req.body;
  if (!operator) {
    return res.status(403).json({ error: 'OPERATOR_REQUIRED', message: '必须指定导入操作人身份' });
  }
  if (!packageData) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '必须提供 packageData' });
  }
  const result = deskSvc.importSensitivePackage(packageData, operator, {
    conflictStrategy: conflictStrategy || 'reject',
    sourceBatchStrategy: sourceBatchStrategy || 'merge'
  });
  if (result.error) {
    if (result.error === 'PERMISSION_DENIED' || result.error === 'OPERATOR_REQUIRED') {
      return res.status(403).json(result);
    }
    if (result.error === 'PACKAGE_TAMPERED' || result.error === 'INVALID_PACKAGE') {
      return res.status(422).json(result);
    }
    return res.status(422).json(result);
  }
  if (result.status === 'conflict') {
    return res.status(409).json(result);
  }
  if (result.status === 'skipped') {
    return res.status(200).json(result);
  }
  if (result.status === 'forced') {
    return res.status(201).json(result);
  }
  if (result.conflictCount > 0) {
    return res.status(202).json({ ...result, message: '部分导入成功，存在冲突记录，请检查详情' });
  }
  res.status(201).json(result);
});

router.get('/sensitive-desk/imported-packages', (req, res) => {
  const { importer, type, status, fingerprint } = req.query;
  const filters = {};
  if (importer) filters.importer = importer;
  if (type) filters.type = type;
  if (status) filters.status = status;
  if (fingerprint) filters.fingerprint = fingerprint;
  res.json(deskSvc.getImportedPackages(filters));
});

router.get('/sensitive-desk/access-logs', (req, res) => {
  const { userId, grantId, action, granted, since, viewer, operator } = req.query;
  const viewerParam = viewer || operator || null;
  if (!viewerParam || !authSvc.canApproveAndPublish(viewerParam)) {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: '仅审批员可查看访问日志' });
  }
  const filters = {};
  if (userId) filters.userId = userId;
  if (grantId) filters.grantId = grantId;
  if (action) filters.action = action;
  if (granted !== undefined) filters.granted = granted === 'true';
  if (since) filters.since = since;
  res.json(deskSvc.getAccessLogs(filters));
});

router.post('/sensitive-desk/expire-grants', (req, res) => {
  const { operator } = req.body;
  if (!operator || !authSvc.canApproveAndPublish(operator)) {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: '仅审批员可触发过期回收' });
  }
  const result = deskSvc.expireGrants();
  res.json(result);
});

module.exports = router;
