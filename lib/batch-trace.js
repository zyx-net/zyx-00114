const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const authSvc = require('./auth');

function computeFingerprint(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str, 'utf-8').digest('hex').slice(0, 16);
}

function computeSourceDigest(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return '';
  const canonical = logs
    .map(l => [l.id, l.action, l.operator, l.timestamp, l.documentId || ''].join('|'))
    .sort()
    .join('\n');
  return computeFingerprint(canonical);
}

function createBatch(logs, operator, options) {
  if (!Array.isArray(logs)) {
    return { error: 'INVALID_INPUT', message: '导入的日志必须是数组' };
  }

  if (!operator) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定导入操作人身份' };
  }

  if (!authSvc.canApproveAndPublish(operator)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可创建导入批次' };
  }

  const sourceDigest = computeSourceDigest(logs);
  const contentFingerprint = computeFingerprint(logs);
  const duplicateCheck = checkDuplicateImport(sourceDigest, contentFingerprint);

  if (duplicateCheck.isDuplicate) {
    const strategy = options.conflictStrategy || 'reject';
    if (strategy === 'reject') {
      return {
        error: 'DUPLICATE_IMPORT',
        message: `检测到重复导入：与批次 ${duplicateCheck.existingBatchId.slice(0, 8)}... 内容指纹相同。请选择 skip 或 merge 策略。`,
        existingBatchId: duplicateCheck.existingBatchId,
        existingBatchImportedBy: duplicateCheck.existingBatchImportedBy,
        existingBatchImportedAt: duplicateCheck.existingBatchImportedAt,
        conflictStrategy: strategy
      };
    }
    if (strategy === 'skip') {
      return {
        skipped: true,
        message: `检测到重复导入，已按 skip 策略跳过。原批次: ${duplicateCheck.existingBatchId.slice(0, 8)}...`,
        existingBatchId: duplicateCheck.existingBatchId
      };
    }
  }

  return store.update(data => {
    const batchId = uuidv4();
    const now = new Date().toISOString();
    const validLogs = [];
    const invalidLogs = [];
    const conflicts = [];
    let insertedCount = 0;

    logs.forEach((log, idx) => {
      if (!log || typeof log !== 'object' || !log.id || !log.action || !log.timestamp) {
        invalidLogs.push({ index: idx, log, reason: '格式校验失败：缺少 id/action/timestamp' });
        return;
      }
      validLogs.push(log);
    });

    validLogs.forEach(log => {
      let hasConflict = null;
      let conflictingLog = null;

      for (const existing of data.revisionLogs) {
        if (existing.id === log.id) {
          hasConflict = 'DUPLICATE_ID';
          conflictingLog = existing;
          break;
        }
        if (existing.documentId === log.documentId &&
            existing.action === log.action &&
            existing.operator === log.operator &&
            existing.timestamp === log.timestamp) {
          hasConflict = 'DUPLICATE_SIGNATURE';
          conflictingLog = existing;
          break;
        }
      }

      if (hasConflict) {
        conflicts.push({
          logId: log.id,
          reason: hasConflict === 'DUPLICATE_ID' ? '日志ID已存在' : '相同操作签名已存在',
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
        if (options.conflictStrategy === 'merge') {
          const newId = uuidv4();
          data.revisionLogs.push({
            ...log,
            id: newId,
            _imported: true,
            _importBatchId: batchId,
            _originalId: log.id,
            _mergedFrom: duplicateCheck.isDuplicate ? duplicateCheck.existingBatchId : null
          });
          insertedCount++;
        }
      } else {
        data.revisionLogs.push({ ...log, _imported: true, _importBatchId: batchId });
        insertedCount++;
      }
    });

    const batch = {
      batchId,
      importedBy: operator,
      importedAt: now,
      sourceDigest,
      contentFingerprint,
      sourceFile: options.source || 'unknown',
      notes: options.notes || '',
      recordCount: logs.length,
      validCount: validLogs.length,
      invalidCount: invalidLogs.length,
      insertedCount,
      conflictCount: conflicts.length,
      conflicts,
      invalidLogs,
      conflictStrategy: options.conflictStrategy || 'reject',
      mergedFrom: duplicateCheck.isDuplicate && options.conflictStrategy === 'merge'
        ? duplicateCheck.existingBatchId
        : null
    };

    if (!data.importBatches) data.importBatches = [];
    data.importBatches.push(batch);

    return {
      batchId,
      importedAt: now,
      importedBy: operator,
      sourceDigest,
      contentFingerprint,
      recordCount: logs.length,
      insertedCount,
      conflictCount: conflicts.length,
      conflictStrategy: options.conflictStrategy || 'reject',
      conflicts: conflicts.map(c => ({
        logId: c.logId,
        reason: c.reason,
        conflictType: c.conflictType,
        existingLog: c.existingLog
      })),
      invalidLogs,
      warnings: [
        ...(conflicts.length > 0 ? [`有 ${conflicts.length} 条冲突记录被跳过`] : []),
        ...(invalidLogs.length > 0 ? [`有 ${invalidLogs.length} 条无效记录`] : []),
        ...(duplicateCheck.isDuplicate && options.conflictStrategy === 'merge'
          ? [`已合并自批次 ${duplicateCheck.existingBatchId.slice(0, 8)}...`]
          : [])
      ]
    };
  });
}

function checkDuplicateImport(sourceDigest, contentFingerprint) {
  const data = store.read();
  const batches = data.importBatches || [];

  for (const b of batches) {
    if (b.sourceDigest === sourceDigest || b.contentFingerprint === contentFingerprint) {
      return {
        isDuplicate: true,
        existingBatchId: b.batchId,
        existingBatchImportedBy: b.importedBy,
        existingBatchImportedAt: b.importedAt
      };
    }
  }

  return { isDuplicate: false };
}

function getBatches(filters) {
  const data = store.read();
  let batches = [...(data.importBatches || [])];

  if (filters && filters.importedBy) {
    batches = batches.filter(b => b.importedBy === filters.importedBy);
  }
  if (filters && filters.since) {
    batches = batches.filter(b => new Date(b.importedAt) >= new Date(filters.since));
  }
  if (filters && filters.sourceFile) {
    batches = batches.filter(b => b.sourceFile === filters.sourceFile);
  }
  if (filters && filters.hasConflicts) {
    batches = batches.filter(b => b.conflictCount > 0);
  }

  return batches.sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
}

function getBatch(batchId, viewer) {
  const data = store.read();
  const batch = (data.importBatches || []).find(b => b.batchId === batchId);
  if (!batch) return null;

  if (!viewer) {
    return _redactBatch(batch);
  }

  const isOwner = batch.importedBy === viewer;
  const isAdmin = authSvc.canApproveAndPublish(viewer);

  if (isOwner || isAdmin) {
    return batch;
  }

  return _redactBatch(batch);
}

function _redactBatch(batch) {
  return {
    batchId: batch.batchId,
    importedAt: batch.importedAt,
    importedBy: batch.importedBy,
    sourceFile: batch.sourceFile,
    recordCount: batch.recordCount,
    insertedCount: batch.insertedCount,
    conflictCount: batch.conflictCount,
    invalidCount: batch.invalidCount,
    conflictStrategy: batch.conflictStrategy,
    _redacted: true
  };
}

function getLogsByBatch(batchId) {
  const data = store.read();
  return data.revisionLogs
    .filter(l => l._importBatchId === batchId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function getPlaybacksByBatch(batchId) {
  const data = store.read();
  return (data.playbackRecords || [])
    .filter(r => r.logIds && r.logIds.some(lid => data.revisionLogs.some(l => l.id === lid && l._importBatchId === batchId)))
    .sort((a, b) => new Date(b.playbackAt) - new Date(a.playbackAt));
}

function linkPlaybackToBatch(playbackRecordId, batchId, operator) {
  if (!operator) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' };
  }
  if (!authSvc.canApproveAndPublish(operator)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可关联回放到批次' };
  }

  return store.update(data => {
    const record = (data.playbackRecords || []).find(r => r.id === playbackRecordId);
    if (!record) return { error: 'RECORD_NOT_FOUND', message: '回放记录不存在' };

    const batch = (data.importBatches || []).find(b => b.batchId === batchId);
    if (!batch) return { error: 'BATCH_NOT_FOUND', message: '导入批次不存在' };

    record._linkedBatchId = batchId;
    record._linkedAt = new Date().toISOString();
    record._linkedBy = operator;

    return { success: true, recordId: playbackRecordId, batchId };
  });
}

function exportBatchAuditSummary(batchId, viewer) {
  const data = store.read();
  const batch = (data.importBatches || []).find(b => b.batchId === batchId);
  if (!batch) return { error: 'BATCH_NOT_FOUND', message: '导入批次不存在' };

  const isOwner = batch.importedBy === viewer;
  const isAdmin = authSvc.canApproveAndPublish(viewer);

  if (!isOwner && !isAdmin) {
    return { error: 'PERMISSION_DENIED', message: '仅批次导入人或审批员可导出审计摘要' };
  }

  const batchLogs = data.revisionLogs.filter(l => l._importBatchId === batchId);
  const batchPlaybacks = (data.playbackRecords || []).filter(r =>
    r._linkedBatchId === batchId ||
    (r.logIds && r.logIds.some(lid => batchLogs.some(l => l.id === lid)))
  );

  const actionBreakdown = {};
  const operatorBreakdown = {};
  batchLogs.forEach(l => {
    actionBreakdown[l.action] = (actionBreakdown[l.action] || 0) + 1;
    operatorBreakdown[l.operator] = (operatorBreakdown[l.operator] || 0) + 1;
  });

  return {
    batchId: batch.batchId,
    importedBy: batch.importedBy,
    importedAt: batch.importedAt,
    sourceDigest: batch.sourceDigest,
    contentFingerprint: batch.contentFingerprint,
    sourceFile: batch.sourceFile,
    notes: batch.notes,
    recordCount: batch.recordCount,
    insertedCount: batch.insertedCount,
    conflictCount: batch.conflictCount,
    invalidCount: batch.invalidCount,
    conflictStrategy: batch.conflictStrategy,
    mergedFrom: batch.mergedFrom,
    actionBreakdown,
    operatorBreakdown,
    playbackCount: batchPlaybacks.length,
    playbacks: batchPlaybacks.map(p => ({
      id: p.id,
      playbackBy: p.playbackBy,
      playbackAt: p.playbackAt,
      logCount: p.logCount
    })),
    conflicts: batch.conflicts,
    invalidLogs: batch.invalidLogs,
    exportedAt: new Date().toISOString(),
    exportedBy: viewer
  };
}

function reimportBatchWithStrategy(batchId, strategy, operator) {
  if (!operator) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' };
  }
  if (!authSvc.canApproveAndPublish(operator)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可执行冲突重导入' };
  }

  const batch = getBatch(batchId, operator);
  if (!batch) return { error: 'BATCH_NOT_FOUND', message: '导入批次不存在' };
  if (batch._redacted) return { error: 'PERMISSION_DENIED', message: '无权查看批次详情' };

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
          data.revisionLogs[idx] = {
            ...log,
            _imported: true,
            _importBatchId: batchId,
            _reimportedAt: new Date().toISOString()
          };
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
            data.revisionLogs[sigIdx] = {
              ...log,
              _imported: true,
              _importBatchId: batchId,
              _reimportedAt: new Date().toISOString()
            };
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
        data.revisionLogs.push({
          ...log,
          id: newId,
          _imported: true,
          _importBatchId: batchId,
          _originalId: log.id,
          _forceNewId: true
        });
        newIds.push({ originalId: log.id, newId });
        processed++;
      }
    });

    const batchIdx = (data.importBatches || []).findIndex(b => b.batchId === batchId);
    if (batchIdx >= 0) {
      data.importBatches[batchIdx]._reimport = {
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
      message: strategy === 'skip'
        ? '所有冲突已按 skip 策略保持原样'
        : `重导入完成：${processed} 条被处理`
    };
  });
}

module.exports = {
  createBatch,
  checkDuplicateImport,
  getBatches,
  getBatch,
  getLogsByBatch,
  getPlaybacksByBatch,
  linkPlaybackToBatch,
  exportBatchAuditSummary,
  reimportBatchWithStrategy,
  computeFingerprint,
  computeSourceDigest
};
