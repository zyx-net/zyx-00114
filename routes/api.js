const express = require('express');
const router = express.Router();
const docSvc = require('../lib/document');
const revSvc = require('../lib/revision');
const archSvc = require('../lib/archive');
const diffSvc = require('../lib/diff');
const draftSvc = require('../lib/draft');
const authSvc = require('../lib/auth');

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
    drafts = draftSvc.getDraftsByDoc(documentId);
  } else {
    drafts = [];
  }
  res.json(drafts);
});

router.get('/drafts/:draftId', (req, res) => {
  const draft = draftSvc.getDraft(req.params.draftId);
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
  const snapshots = draftSvc.getSnapshotsByDraft(req.params.draftId);
  res.json(snapshots);
});

router.get('/snapshots/:snapshotId', (req, res) => {
  const snapshot = draftSvc.getSnapshot(req.params.snapshotId);
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

module.exports = router;
