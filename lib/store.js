const fs = require('fs');
const path = require('path');

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
  playbackRecords: []
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
      playbackRecords: data.playbackRecords || []
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

function importData(imported) {
  return update(data => {
    if (imported.documents) {
      Object.entries(imported.documents).forEach(([id, doc]) => {
        if (!data.documents[id]) {
          data.documents[id] = doc;
        }
      });
    }
    if (imported.versions) {
      Object.entries(imported.versions).forEach(([id, ver]) => {
        if (!data.versions[id]) {
          data.versions[id] = ver;
        }
      });
    }
    if (imported.revisions) {
      Object.entries(imported.revisions).forEach(([id, rev]) => {
        if (!data.revisions[id]) {
          data.revisions[id] = rev;
        }
      });
    }
    if (imported.drafts) {
      Object.entries(imported.drafts).forEach(([id, draft]) => {
        if (!data.drafts[id]) {
          data.drafts[id] = draft;
        }
      });
    }
    if (imported.draftSnapshots) {
      Object.entries(imported.draftSnapshots).forEach(([id, snap]) => {
        if (!data.draftSnapshots[id]) {
          data.draftSnapshots[id] = snap;
        }
      });
    }
    if (imported.revisionLogs && Array.isArray(imported.revisionLogs)) {
      imported.revisionLogs.forEach(log => {
        if (!data.revisionLogs.some(l => l.id === log.id)) {
          data.revisionLogs.push(log);
        }
      });
    }
    if (imported.archives && Array.isArray(imported.archives)) {
      imported.archives.forEach(arc => {
        if (!data.archives.some(a => a.id === arc.id)) {
          data.archives.push(arc);
        }
      });
    }
    if (imported.importedLogs && Array.isArray(imported.importedLogs)) {
      imported.importedLogs.forEach(log => {
        if (!data.importedLogs.some(l => l.importBatchId === log.importBatchId)) {
          data.importedLogs.push(log);
        }
      });
    }
    if (imported.playbackRecords && Array.isArray(imported.playbackRecords)) {
      imported.playbackRecords.forEach(rec => {
        if (!data.playbackRecords.some(r => r.id === rec.id)) {
          data.playbackRecords.push(rec);
        }
      });
    }
    return { success: true };
  });
}

module.exports = { read, write, update, exportAll, importData };
