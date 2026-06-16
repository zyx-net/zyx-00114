const { v4: uuidv4 } = require('uuid');
const store = require('./store');

function importDocument(title, content, operator) {
  return store.update(data => {
    const docId = uuidv4();
    const verId = uuidv4();
    const now = new Date().toISOString();

    data.documents[docId] = {
      id: docId,
      title,
      currentVersionId: verId,
      createdBy: operator,
      createdAt: now
    };

    data.versions[verId] = {
      id: verId,
      documentId: docId,
      versionNumber: '1.0',
      content,
      createdBy: operator,
      createdAt: now
    };

    data.revisionLogs.push({
      id: uuidv4(),
      documentId: docId,
      action: 'import',
      operator,
      timestamp: now,
      detail: { versionId: verId, versionNumber: '1.0' }
    });

    return {
      document: data.documents[docId],
      version: data.versions[verId]
    };
  });
}

function getDocument(docId) {
  const data = store.read();
  const doc = data.documents[docId];
  if (!doc) return null;
  const currentVer = data.versions[doc.currentVersionId];
  return { document: doc, currentVersion: currentVer };
}

function listDocuments() {
  const data = store.read();
  return Object.values(data.documents).map(doc => {
    const ver = data.versions[doc.currentVersionId];
    return { ...doc, currentVersionNumber: ver ? ver.versionNumber : 'N/A' };
  });
}

function getVersion(verId) {
  const data = store.read();
  return data.versions[verId] || null;
}

function getVersionsByDoc(docId) {
  const data = store.read();
  return Object.values(data.versions)
    .filter(v => v.documentId === docId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

module.exports = { importDocument, getDocument, listDocuments, getVersion, getVersionsByDoc };
