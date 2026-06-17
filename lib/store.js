const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  documents: {},
  versions: {},
  revisions: {},
  revisionLogs: [],
  archives: [],
  drafts: {},
  draftSnapshots: {},
  users: {},
  importedLogs: [],
  playbackRecords: [],
  dataImports: [],
  importBatches: [],
  vaultBatches: [],
  vaultAccessLogs: [],
  vaultRedactionRules: [],
  vaultImportPackages: []
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function read() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return {
      documents: data.documents || {},
      versions: data.versions || {},
      revisions: data.revisions || {},
      revisionLogs: data.revisionLogs || [],
      archives: data.archives || [],
      drafts: data.drafts || {},
      draftSnapshots: data.draftSnapshots || {},
      users: data.users || {},
      importedLogs: data.importedLogs || [],
      playbackRecords: data.playbackRecords || [],
      dataImports: data.dataImports || [],
      importBatches: data.importBatches || [],
      vaultBatches: data.vaultBatches || [],
      vaultAccessLogs: data.vaultAccessLogs || [],
      vaultRedactionRules: data.vaultRedactionRules || [],
      vaultImportPackages: data.vaultImportPackages || []
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function write(data) {
  ensureDataDir();
  const tmpFile = DB_FILE + '.tmp';
  let retries = 5;
  let lastErr;
  while (retries > 0) {
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
      return;
    } catch (e) {
      lastErr = e;
      retries--;
      if (retries > 0) {
        const wait = (6 - retries) * 50;
        const start = Date.now();
        while (Date.now() - start < wait) { /* spin */ }
      }
    }
  }
  throw lastErr;
}

function update(fn) {
  const data = read();
  const result = fn(data);
  write(data);
  return result;
}

function exportAll() {
  return read();
}

function importData(imported, operator) {
  return update(data => {
    const batchId = uuidv4();
    const now = new Date().toISOString();
    const conflicts = [];
    const ownershipIssues = [];
    let insertedCount = 0;
    let skippedCount = 0;

    if (imported.documents) {
      Object.entries(imported.documents).forEach(([id, doc]) => {
        if (!data.documents[id]) {
          data.documents[id] = { ...doc, _imported: true, _importBatchId: batchId, _importedBy: operator };
          insertedCount++;
        } else {
          conflicts.push({ type: 'document', id, reason: '文档ID已存在，已跳过' });
          skippedCount++;
        }
      });
    }
    if (imported.versions) {
      Object.entries(imported.versions).forEach(([id, ver]) => {
        if (!data.versions[id]) {
          data.versions[id] = { ...ver, _imported: true, _importBatchId: batchId };
          insertedCount++;
        } else {
          conflicts.push({ type: 'version', id, reason: '版本ID已存在，已跳过' });
          skippedCount++;
        }
      });
    }
    if (imported.revisions) {
      Object.entries(imported.revisions).forEach(([id, rev]) => {
        if (!data.revisions[id]) {
          data.revisions[id] = { ...rev, _imported: true, _importBatchId: batchId };
          insertedCount++;
        } else {
          conflicts.push({ type: 'revision', id, reason: '修订ID已存在，已跳过' });
          skippedCount++;
        }
      });
    }
    if (imported.drafts) {
      Object.entries(imported.drafts).forEach(([id, draft]) => {
        if (!data.drafts[id]) {
          const existingDoc = data.documents[draft.documentId];
          if (existingDoc && existingDoc.createdBy && existingDoc.createdBy !== draft.createdBy && !existingDoc._imported) {
            ownershipIssues.push({
              type: 'draft',
              id,
              reason: `草稿归属冲突：文档由 ${existingDoc.createdBy} 创建，但草稿由 ${draft.createdBy} 创建，防止串线，已跳过`
            });
            skippedCount++;
            return;
          }
          data.drafts[id] = { ...draft, _imported: true, _importBatchId: batchId };
          insertedCount++;
        } else {
          conflicts.push({ type: 'draft', id, reason: '草稿ID已存在，已跳过' });
          skippedCount++;
        }
      });
    }
    if (imported.draftSnapshots) {
      Object.entries(imported.draftSnapshots).forEach(([id, snap]) => {
        if (!data.draftSnapshots[id]) {
          const existingDraft = data.drafts[snap.draftId];
          if (existingDraft && existingDraft.createdBy && existingDraft.createdBy !== snap.createdBy && !existingDraft._imported) {
            ownershipIssues.push({
              type: 'snapshot',
              id,
              reason: `快照归属冲突：草稿由 ${existingDraft.createdBy} 创建，但快照由 ${snap.createdBy} 创建，防止串线，已跳过`
            });
            skippedCount++;
            return;
          }
          data.draftSnapshots[id] = { ...snap, _imported: true, _importBatchId: batchId };
          insertedCount++;
        } else {
          conflicts.push({ type: 'snapshot', id, reason: '快照ID已存在，已跳过' });
          skippedCount++;
        }
      });
    }
    if (imported.revisionLogs && Array.isArray(imported.revisionLogs)) {
      imported.revisionLogs.forEach(log => {
        if (!data.revisionLogs.some(l => l.id === log.id)) {
          data.revisionLogs.push({ ...log, _imported: true, _importBatchId: batchId });
          insertedCount++;
        } else {
          conflicts.push({ type: 'revisionLog', id: log.id, reason: '日志ID已存在，已跳过' });
          skippedCount++;
        }
      });
    }
    if (imported.archives && Array.isArray(imported.archives)) {
      imported.archives.forEach(arc => {
        if (!data.archives.some(a => a.id === arc.id)) {
          data.archives.push({ ...arc, _imported: true, _importBatchId: batchId });
          insertedCount++;
        } else {
          conflicts.push({ type: 'archive', id: arc.id, reason: '归档ID已存在，已跳过' });
          skippedCount++;
        }
      });
    }
    if (imported.importedLogs && Array.isArray(imported.importedLogs)) {
      imported.importedLogs.forEach(log => {
        if (!data.importedLogs.some(l => l.importBatchId === log.importBatchId)) {
          data.importedLogs.push({ ...log, _nestedImport: true, _parentBatchId: batchId });
          insertedCount++;
        } else {
          conflicts.push({ type: 'importedLog', id: log.importBatchId, reason: '导入批次记录已存在，已跳过' });
          skippedCount++;
        }
      });
    }
    if (imported.playbackRecords && Array.isArray(imported.playbackRecords)) {
      imported.playbackRecords.forEach(rec => {
        if (!data.playbackRecords.some(r => r.id === rec.id)) {
          data.playbackRecords.push({ ...rec, _imported: true, _importBatchId: batchId });
          insertedCount++;
        } else {
          conflicts.push({ type: 'playbackRecord', id: rec.id, reason: '回放记录ID已存在，已跳过' });
          skippedCount++;
        }
      });
    }

    function _countEntries(obj) {
      if (!obj) return 0;
      if (Array.isArray(obj)) return obj.length;
      if (typeof obj === 'object') return Object.keys(obj).length;
      return 0;
    }

    const totalCount = Object.values(imported).reduce((sum, val) => sum + _countEntries(val), 0);

    const importMeta = {
      importBatchId: batchId,
      importedAt: now,
      importedBy: operator || 'unknown',
      totalCount,
      insertedCount,
      skippedCount,
      conflictCount: conflicts.length,
      ownershipIssueCount: ownershipIssues.length,
      conflicts,
      ownershipIssues
    };

    data.dataImports = data.dataImports || [];
    data.dataImports.push(importMeta);

    return {
      success: true,
      batchId,
      importedAt: now,
      importedBy: operator || 'unknown',
      insertedCount,
      skippedCount,
      conflictCount: conflicts.length,
      ownershipIssueCount: ownershipIssues.length,
      conflicts,
      ownershipIssues,
      warnings: [
        ...(conflicts.length > 0 ? [`有 ${conflicts.length} 条记录因ID冲突被跳过，未覆盖原有数据`] : []),
        ...(ownershipIssues.length > 0 ? [`有 ${ownershipIssues.length} 条记录因归属权冲突被跳过，防止串到其他用户数据上`] : [])
      ]
    };
  });
}

module.exports = { read, write, update, exportAll, importData };
