const express = require('express');
const router = express.Router();
const docSvc = require('../lib/document');
const revSvc = require('../lib/revision');
const archSvc = require('../lib/archive');
const diffSvc = require('../lib/diff');

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

router.get('/documents/:docId/revision-log', (req, res) => {
  const logs = archSvc.exportRevisionLog(req.params.docId);
  res.json(logs);
});

router.get('/consistency', (req, res) => {
  const result = archSvc.verifyConsistency();
  res.json(result);
});

module.exports = router;
