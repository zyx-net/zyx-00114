const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const authSvc = require('./auth');

function validateLog(log) {
  if (!log || typeof log !== 'object') return false;
  if (!log.id || typeof log.id !== 'string') return false;
  if (!log.action || typeof log.action !== 'string') return false;
  if (!log.timestamp || typeof log.timestamp !== 'string') return false;
  return true;
}

function checkLogConflict(existingLog, newLog) {
  if (existingLog.id === newLog.id) {
    return 'DUPLICATE_ID';
  }
  if (existingLog.documentId === newLog.documentId &&
      existingLog.action === newLog.action &&
      existingLog.operator === newLog.operator &&
      existingLog.timestamp === newLog.timestamp) {
    return 'DUPLICATE_SIGNATURE';
  }
  return null;
}

function importRevisionLogs(logs, importerOperator, options = {}) {
  if (!Array.isArray(logs)) {
    return { error: 'INVALID_INPUT', message: '导入的日志必须是数组' };
  }

  if (!importerOperator) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定导入操作人身份' };
  }

  if (!authSvc.canApproveAndPublish(importerOperator)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可导入审计日志（需明确操作者身份）' };
  }

  return store.update(data => {
    const batchId = uuidv4();
    const now = new Date().toISOString();
    const validLogs = [];
    const invalidLogs = [];
    const conflicts = [];
    let insertedCount = 0;

    logs.forEach((log, idx) => {
      if (!validateLog(log)) {
        invalidLogs.push({ index: idx, log, reason: '格式校验失败：缺少 id/action/timestamp' });
        return;
      }
      validLogs.push(log);
    });

    validLogs.forEach(log => {
      let hasConflict = null;
      let conflictingLog = null;

      for (const existing of data.revisionLogs) {
        const conflictType = checkLogConflict(existing, log);
        if (conflictType) {
          hasConflict = conflictType;
          conflictingLog = existing;
          break;
        }
      }

      if (hasConflict) {
        conflicts.push({
          logId: log.id,
          reason: hasConflict === 'DUPLICATE_ID' ? '日志ID已存在' : '相同操作签名（文档+动作+操作人+时间）已存在',
          conflictType: hasConflict,
          importedLog: log,
          existingLog: {
            id: conflictingLog.id,
            action: conflictingLog.action,
            operator: conflictingLog.operator,
            timestamp: conflictingLog.timestamp,
            documentId: conflictingLog.documentId
          }
        });
      } else {
        data.revisionLogs.push({ ...log, _imported: true, _importBatchId: batchId });
        insertedCount++;
      }
    });

    const batchRecord = {
      importBatchId: batchId,
      importedBy: importerOperator,
      importedAt: now,
      totalCount: logs.length,
      validCount: validLogs.length,
      invalidCount: invalidLogs.length,
      insertedCount,
      conflictCount: conflicts.length,
      conflicts,
      invalidLogs,
      source: options.source || 'manual',
      notes: options.notes || ''
    };

    data.importedLogs.push(batchRecord);

    return {
      batchId,
      importedAt: now,
      totalCount: logs.length,
      validCount: validLogs.length,
      invalidCount: invalidLogs.length,
      insertedCount,
      conflictCount: conflicts.length,
      conflicts: conflicts.map(c => ({
        logId: c.logId,
        reason: c.reason,
        conflictType: c.conflictType,
        existingLog: c.existingLog
      })),
      invalidLogs,
      warnings: conflicts.length > 0 ? [`导入完成，有 ${conflicts.length} 条冲突记录被跳过，未覆盖原有日志`] : []
    };
  });
}

function getImportedBatches(filters = {}) {
  const data = store.read();
  let batches = [...data.importedLogs];

  if (filters.importer) {
    batches = batches.filter(b => b.importedBy === filters.importer);
  }

  if (filters.since) {
    batches = batches.filter(b => new Date(b.importedAt) >= new Date(filters.since));
  }

  return batches.sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
}

function getImportedBatch(batchId) {
  const data = store.read();
  return data.importedLogs.find(b => b.importBatchId === batchId) || null;
}

function getImportedLogsByBatch(batchId) {
  const data = store.read();
  return data.revisionLogs
    .filter(l => l._importBatchId === batchId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function playbackRevisionLogs(logIds, playbackOperator, options = {}) {
  if (!playbackOperator) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定回放操作人身份' };
  }

  if (!authSvc.canApproveAndPublish(playbackOperator)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可执行审计回放' };
  }

  if (!Array.isArray(logIds) || logIds.length === 0) {
    return { error: 'INVALID_INPUT', message: '请指定要回放的日志 ID 列表' };
  }

  const data = store.read();
  const foundLogs = [];
  const missingIds = [];

  logIds.forEach(id => {
    const log = data.revisionLogs.find(l => l.id === id);
    if (log) foundLogs.push(log);
    else missingIds.push(id);
  });

  foundLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const actionBreakdown = {};
  const operatorBreakdown = {};
  const docBreakdown = {};

  foundLogs.forEach(log => {
    actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
    operatorBreakdown[log.operator] = (operatorBreakdown[log.operator] || 0) + 1;
    if (log.documentId) {
      docBreakdown[log.documentId] = (docBreakdown[log.documentId] || 0) + 1;
    }
  });

  const now = new Date().toISOString();
  const recordId = uuidv4();

  const playbackItems = foundLogs.map(log => {
    let relatedDocTitle = null;
    if (log.documentId && data.documents[log.documentId]) {
      relatedDocTitle = data.documents[log.documentId].title;
    }

    let snapshotAccessible = null;
    let snapshotDetail = null;
    if (log.snapshotId) {
      const snap = data.draftSnapshots[log.snapshotId];
      if (snap) {
        const draft = data.drafts[snap.draftId];
        const isOwner = draft && draft.createdBy === playbackOperator;
        snapshotAccessible = isOwner || snap.createdBy === playbackOperator;
        if (snapshotAccessible) {
          snapshotDetail = {
            baselineVersionNumber: snap.baselineVersionNumber,
            createdAt: snap.createdAt
          };
        }
      }
    }

    return {
      logId: log.id,
      timestamp: log.timestamp,
      action: log.action,
      operator: log.operator,
      documentId: log.documentId,
      documentTitle: relatedDocTitle,
      revisionId: log.revisionId || null,
      draftId: log.draftId || null,
      snapshotId: log.snapshotId || null,
      snapshotAccessible,
      snapshotDetail,
      detail: log.detail || {}
    };
  });

  const playbackRecord = {
    id: recordId,
    playbackBy: playbackOperator,
    playbackAt: now,
    logCount: foundLogs.length,
    missingCount: missingIds.length,
    missingIds,
    logIds: foundLogs.map(l => l.id),
    summary: {
      actionBreakdown,
      operatorBreakdown,
      docBreakdown,
      timeRange: foundLogs.length > 0 ? {
        start: foundLogs[0].timestamp,
        end: foundLogs[foundLogs.length - 1].timestamp
      } : null
    },
    items: playbackItems,
    notes: options.notes || '',
    mode: options.mode || 'audit'
  };

  return store.update(data => {
    data.playbackRecords.push(playbackRecord);
    return {
      recordId,
      playbackAt: now,
      logCount: foundLogs.length,
      missingCount: missingIds.length,
      missingIds,
      summary: playbackRecord.summary,
      items: playbackItems,
      warnings: missingIds.length > 0 ? [`有 ${missingIds.length} 条日志未在仓库中找到，已跳过`] : []
    };
  });
}

function getPlaybackRecords(filters = {}) {
  const data = store.read();
  let records = [...data.playbackRecords];

  if (filters.playbackBy) {
    records = records.filter(r => r.playbackBy === filters.playbackBy);
  }

  if (filters.since) {
    records = records.filter(r => new Date(r.playbackAt) >= new Date(filters.since));
  }

  return records.sort((a, b) => new Date(b.playbackAt) - new Date(a.playbackAt));
}

function getPlaybackRecord(recordId, viewer) {
  const data = store.read();
  const record = data.playbackRecords.find(r => r.id === recordId);
  if (!record) return null;

  if (!viewer) {
    return {
      id: record.id,
      playbackAt: record.playbackAt,
      playbackBy: record.playbackBy,
      logCount: record.logCount,
      summary: record.summary,
      _redacted: true
    };
  }

  if (viewer === record.playbackBy || authSvc.canApproveAndPublish(viewer)) {
    return record;
  }

  return {
    id: record.id,
    playbackAt: record.playbackAt,
    playbackBy: record.playbackBy,
    logCount: record.logCount,
    summary: record.summary,
    _redacted: true
  };
}

function reimportWithStrategy(batchId, strategy, operator) {
  if (!operator) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' };
  }

  if (!authSvc.canApproveAndPublish(operator)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可执行冲突重导入操作' };
  }

  const batch = getImportedBatch(batchId);
  if (!batch) return { error: 'BATCH_NOT_FOUND', message: '导入批次不存在' };

  if (batch.conflictCount === 0) {
    return { message: '该批次没有冲突记录，无需重导入' };
  }

  const strategies = ['skip', 'overwrite', 'force_new_id'];
  if (!strategies.includes(strategy)) {
    return { error: 'INVALID_STRATEGY', message: `冲突策略必须是 ${strategies.join(', ')} 之一` };
  }

  return store.update(data => {
    const conflictLogs = batch.conflicts.map(c => c.importedLog);
    let processed = 0;
    let skipped = 0;
    let overwritten = 0;
    let newIds = [];

    conflictLogs.forEach(log => {
      if (strategy === 'skip') {
        skipped++;
        return;
      }

      if (strategy === 'overwrite') {
        const idx = data.revisionLogs.findIndex(l => l.id === log.id);
        if (idx >= 0) {
          data.revisionLogs[idx] = { ...log, _imported: true, _importBatchId: batchId, _reimportedAt: new Date().toISOString() };
          overwritten++;
          processed++;
        } else {
          const sigIdx = data.revisionLogs.findIndex(l =>
            l.documentId === log.documentId &&
            l.action === log.action &&
            l.operator === log.operator &&
            l.timestamp === log.timestamp
          );
          if (sigIdx >= 0) {
            data.revisionLogs[sigIdx] = { ...log, _imported: true, _importBatchId: batchId, _reimportedAt: new Date().toISOString() };
            overwritten++;
            processed++;
          } else {
            data.revisionLogs.push({ ...log, _imported: true, _importBatchId: batchId });
            processed++;
          }
        }
      }

      if (strategy === 'force_new_id') {
        const newId = uuidv4();
        const newLog = { ...log, id: newId, _imported: true, _importBatchId: batchId, _originalId: log.id, _forceNewId: true };
        data.revisionLogs.push(newLog);
        newIds.push({ originalId: log.id, newId });
        processed++;
      }
    });

    const batchIdx = data.importedLogs.findIndex(b => b.importBatchId === batchId);
    if (batchIdx >= 0) {
      data.importedLogs[batchIdx]._reimport = {
        strategy,
        by: operator,
        at: new Date().toISOString(),
        processed,
        skipped,
        overwritten,
        newIdsCount: newIds.length
      };
    }

    return {
      strategy,
      processed,
      skipped,
      overwritten,
      newIds,
      message: strategy === 'skip' ? '所有冲突已按 skip 策略保持原样' : `重导入完成：${processed} 条被处理`
    };
  });
}

module.exports = {
  importRevisionLogs,
  getImportedBatches,
  getImportedBatch,
  getImportedLogsByBatch,
  playbackRevisionLogs,
  getPlaybackRecords,
  getPlaybackRecord,
  reimportWithStrategy
};
