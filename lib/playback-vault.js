const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const store = require('./store');
const authSvc = require('./auth');
const batchSvc = require('./batch-trace');
const auditSvc = require('./audit-playback');

const REDACTION_FIELDS = [
  'detail', 'content', 'reason', 'notes', 'operatorBreakdown',
  'actionBreakdown', 'docBreakdown', 'conflicts', 'invalidLogs',
  'sourceDigest', 'contentFingerprint', 'items', 'logIds'
];

function computePackageFingerprint(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str, 'utf-8').digest('hex').slice(0, 32);
}

function pushAccessLog(data, batchId, viewer, action, granted, details) {
  if (!data.vaultAccessLogs) data.vaultAccessLogs = [];
  const accessLog = {
    id: uuidv4(),
    batchId,
    viewer,
    action,
    granted,
    details: details || {},
    accessedAt: new Date().toISOString()
  };
  data.vaultAccessLogs.push(accessLog);
  return accessLog;
}

function logVaultAccess(batchId, viewer, action, granted, details) {
  return store.update(data => {
    return pushAccessLog(data, batchId, viewer, action, granted, details);
  });
}

function isVaultOwner(batchOwnerId, viewer) {
  if (!viewer) return false;
  return batchOwnerId === viewer;
}

function canAccessVaultDetail(batch, viewer) {
  if (!batch) return false;
  if (!viewer) return false;
  if (isVaultOwner(batch.ownerId, viewer)) return true;
  if (authSvc.canApproveAndPublish(viewer)) return true;
  return false;
}

function applyRedaction(obj, level) {
  if (!obj || typeof obj !== 'object') return obj;

  if (level === 'full') {
    const minimal = {};
    if (obj.vaultBatchId) minimal.vaultBatchId = obj.vaultBatchId;
    if (obj.batchId) minimal.batchId = obj.batchId;
    if (obj.status) minimal.status = obj.status;
    minimal._redacted = true;
    minimal._redactionLevel = 'full';
    return minimal;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        return applyRedaction(item, level);
      }
      return item;
    });
  }

  const redacted = {};
  const allowedFields = [
    'batchId', 'vaultBatchId', 'importedAt', 'importedBy', 'ownerId',
    'recordCount', 'insertedCount', 'conflictCount', 'invalidCount',
    'status', 'sourceFile', 'conflictStrategy', '_redacted', '_redactionLevel',
    'playbackCount', 'exportedAt', 'exportedBy', 'playbackAt',
    'playbackBy', 'logCount', 'timeRange', 'sourceBatch'
  ];

  for (const key of Object.keys(obj)) {
    if (allowedFields.includes(key)) {
      redacted[key] = obj[key];
    } else if (key === 'summary') {
      const summary = obj[key];
      redacted[key] = {
        actionBreakdown: Object.keys(summary?.actionBreakdown || {}).reduce((acc, k) => {
          acc[k] = summary.actionBreakdown[k];
          return acc;
        }, {}),
        timeRange: summary?.timeRange || null,
        _redacted: true
      };
    }
  }

  redacted._redacted = true;
  redacted._redactionLevel = level || 'summary';

  return redacted;
}

function createVaultBatch(batchId, ownerId, options = {}) {
  if (!batchId) {
    return { error: 'BATCH_ID_REQUIRED', message: '必须指定批次ID' };
  }
  if (!ownerId) {
    return { error: 'OWNER_REQUIRED', message: '必须指定批次所有者' };
  }
  if (!authSvc.canApproveAndPublish(ownerId)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可创建保险箱批次' };
  }

  const existingBatch = batchSvc.getBatch(batchId, ownerId);
  if (!existingBatch) {
    return { error: 'BATCH_NOT_FOUND', message: '导入批次不存在' };
  }
  if (existingBatch._redacted) {
    return { error: 'PERMISSION_DENIED', message: '无权访问该批次详情' };
  }

  return store.update(data => {
    const vaultBatchId = uuidv4();
    const now = new Date().toISOString();

    const vaultBatch = {
      vaultBatchId,
      sourceBatchId: batchId,
      ownerId,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      notes: options.notes || '',
      customRedactionRules: options.redactionRules || [],
      accessCount: 0,
      playbackCount: 0,
      exportCount: 0,
      lastAccessedAt: null,
      lastPlaybackAt: null,
      lastExportAt: null
    };

    if (!data.vaultBatches) data.vaultBatches = [];
    data.vaultBatches.push(vaultBatch);

    pushAccessLog(data, vaultBatchId, ownerId, 'create', true, { sourceBatchId: batchId });

    return {
      vaultBatchId,
      sourceBatchId: batchId,
      ownerId,
      createdAt: now,
      status: 'active'
    };
  });
}

function getVaultBatch(vaultBatchId, viewer) {
  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) return null;

  const sourceBatch = batchSvc.getBatch(vaultBatch.sourceBatchId, viewer);
  if (!sourceBatch) return null;

  const canAccess = canAccessVaultDetail(vaultBatch, viewer);

  logVaultAccess(vaultBatchId, viewer, 'view', canAccess, { viewer });

  if (!canAccess) {
    return applyRedaction({ ...vaultBatch, sourceBatch: applyRedaction(sourceBatch, 'summary') }, 'summary');
  }

  store.update(data => {
    const idx = data.vaultBatches.findIndex(b => b.vaultBatchId === vaultBatchId);
    if (idx >= 0) {
      data.vaultBatches[idx].accessCount++;
      data.vaultBatches[idx].lastAccessedAt = new Date().toISOString();
    }
    return data;
  });

  return {
    ...vaultBatch,
    sourceBatch,
    _redacted: false
  };
}

function getVaultBatches(filters = {}, viewer) {
  const data = store.read();
  let batches = [...(data.vaultBatches || [])];

  if (filters.ownerId) {
    batches = batches.filter(b => b.ownerId === filters.ownerId);
  }
  if (filters.status) {
    batches = batches.filter(b => b.status === filters.status);
  }
  if (filters.since) {
    batches = batches.filter(b => new Date(b.createdAt) >= new Date(filters.since));
  }

  const canViewAll = viewer && authSvc.canApproveAndPublish(viewer);

  return batches
    .map(batch => {
      const isOwner = viewer && batch.ownerId === viewer;
      const canAccess = isOwner || canViewAll;

      if (!canAccess) {
        return applyRedaction(batch, 'summary');
      }
      return { ...batch, _redacted: false };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getVaultLogs(vaultBatchId, viewer) {
  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };

  const canAccess = canAccessVaultDetail(vaultBatch, viewer);
  logVaultAccess(vaultBatchId, viewer, 'view_logs', canAccess, { viewer });

  const logs = batchSvc.getLogsByBatch(vaultBatch.sourceBatchId);

  if (!canAccess) {
    return logs.map(log => applyRedaction(log, 'summary'));
  }

  return logs;
}

function getVaultPlaybacks(vaultBatchId, viewer) {
  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };

  const canAccess = canAccessVaultDetail(vaultBatch, viewer);
  logVaultAccess(vaultBatchId, viewer, 'view_playbacks', canAccess, { viewer });

  const playbacks = batchSvc.getPlaybacksByBatch(vaultBatch.sourceBatchId);

  if (!canAccess) {
    return playbacks.map(p => {
      if (p._redacted) return p;
      return applyRedaction(p, 'summary');
    });
  }

  store.update(data => {
    const idx = data.vaultBatches.findIndex(b => b.vaultBatchId === vaultBatchId);
    if (idx >= 0) {
      data.vaultBatches[idx].playbackCount++;
      data.vaultBatches[idx].lastPlaybackAt = new Date().toISOString();
    }
    return data;
  });

  return playbacks;
}

function playbackVaultBatch(vaultBatchId, viewer, options = {}) {
  if (!viewer) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定回放操作人身份' };
  }
  if (!authSvc.canApproveAndPublish(viewer)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可执行审计回放' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };

  const canAccess = canAccessVaultDetail(vaultBatch, viewer);
  if (!canAccess) {
    return { error: 'PERMISSION_DENIED', message: '仅批次所有者或审批员可回放该批次' };
  }

  const logs = batchSvc.getLogsByBatch(vaultBatch.sourceBatchId);
  const logIds = logs.map(l => l.id);

  const result = auditSvc.playbackRevisionLogs(logIds, viewer, {
    notes: options.notes || '保险箱批次回放',
    mode: 'vault'
  });

  if (result.error) return result;

  return store.update(data => {
    pushAccessLog(data, vaultBatchId, viewer, 'playback', true, { recordId: result.recordId });

    const idx = data.vaultBatches.findIndex(b => b.vaultBatchId === vaultBatchId);
    if (idx >= 0) {
      data.vaultBatches[idx].playbackCount++;
      data.vaultBatches[idx].lastPlaybackAt = new Date().toISOString();
    }

    return {
      ...result,
      vaultBatchId,
      sourceBatchId: vaultBatch.sourceBatchId
    };
  });
}

function getVaultNotes(vaultBatchId, viewer) {
  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };

  const canAccess = canAccessVaultDetail(vaultBatch, viewer);
  logVaultAccess(vaultBatchId, viewer, 'view_notes', canAccess, { viewer });

  if (!canAccess) {
    return {
      vaultBatchId,
      notes: null,
      _redacted: true
    };
  }

  const sourceBatch = batchSvc.getBatch(vaultBatch.sourceBatchId, viewer);

  return {
    vaultBatchId,
    notes: vaultBatch.notes,
    sourceBatchNotes: sourceBatch?.notes || '',
    createdAt: vaultBatch.createdAt,
    updatedAt: vaultBatch.updatedAt
  };
}

function updateVaultNotes(vaultBatchId, viewer, notes) {
  if (!viewer) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };

  if (!isVaultOwner(vaultBatch.ownerId, viewer)) {
    return { error: 'PERMISSION_DENIED', message: '仅批次所有者可更新备注' };
  }

  return store.update(data => {
    const idx = data.vaultBatches.findIndex(b => b.vaultBatchId === vaultBatchId);
    if (idx >= 0) {
      data.vaultBatches[idx].notes = notes;
      data.vaultBatches[idx].updatedAt = new Date().toISOString();
    }
    pushAccessLog(data, vaultBatchId, viewer, 'update_notes', true, {});
    return {
      vaultBatchId,
      notes,
      updatedAt: data.vaultBatches[idx]?.updatedAt
    };
  });
}

function getVaultAccessTrail(vaultBatchId, viewer) {
  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };

  const canAccess = canAccessVaultDetail(vaultBatch, viewer);
  if (!canAccess) {
    return { error: 'PERMISSION_DENIED', message: '仅批次所有者或审批员可查看操作轨迹' };
  }

  const accessLogs = (data.vaultAccessLogs || [])
    .filter(l => l.batchId === vaultBatchId)
    .sort((a, b) => new Date(b.accessedAt) - new Date(a.accessedAt));

  return {
    vaultBatchId,
    accessCount: vaultBatch.accessCount,
    playbackCount: vaultBatch.playbackCount,
    exportCount: vaultBatch.exportCount,
    lastAccessedAt: vaultBatch.lastAccessedAt,
    lastPlaybackAt: vaultBatch.lastPlaybackAt,
    lastExportAt: vaultBatch.lastExportAt,
    trail: accessLogs.map(log => ({
      id: log.id,
      action: log.action,
      viewer: log.viewer,
      granted: log.granted,
      accessedAt: log.accessedAt,
      details: log.details
    }))
  };
}

function exportVaultAuditPackage(vaultBatchId, viewer) {
  if (!viewer) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定操作人身份' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };

  const canAccess = canAccessVaultDetail(vaultBatch, viewer);
  if (!canAccess) {
    return { error: 'PERMISSION_DENIED', message: '仅批次所有者或审批员可导出审计包' };
  }

  const sourceBatch = batchSvc.getBatch(vaultBatch.sourceBatchId, viewer);
  const logs = batchSvc.getLogsByBatch(vaultBatch.sourceBatchId);
  const playbacks = batchSvc.getPlaybacksByBatch(vaultBatch.sourceBatchId);
  const accessTrail = getVaultAccessTrail(vaultBatchId, viewer);

  const now = new Date().toISOString();
  const packageData = {
    packageVersion: '1.0',
    packageType: 'vault-audit-export',
    exportedAt: now,
    exportedBy: viewer,
    vaultBatchId,
    vaultBatch: {
      ...vaultBatch,
      _exportContext: {
        exportFingerprint: '',
        exportChain: []
      }
    },
    sourceBatch,
    logs,
    playbacks,
    accessTrail: accessTrail.trail || [],
    redactionRules: vaultBatch.customRedactionRules || []
  };

  const fingerprint = computePackageFingerprint(packageData);
  packageData.vaultBatch._exportContext.exportFingerprint = fingerprint;

  return store.update(data => {
    const idx = data.vaultBatches.findIndex(b => b.vaultBatchId === vaultBatchId);
    if (idx >= 0) {
      data.vaultBatches[idx].exportCount++;
      data.vaultBatches[idx].lastExportAt = now;
    }

    if (!data.vaultImportPackages) data.vaultImportPackages = [];
    data.vaultImportPackages.push({
      id: uuidv4(),
      packageId: fingerprint,
      type: 'export',
      vaultBatchId,
      exportedBy: viewer,
      exportedAt: now,
      fingerprint,
      status: 'exported'
    });

    pushAccessLog(data, vaultBatchId, viewer, 'export', true, { fingerprint });

    return {
      packageData,
      filename: `vault-audit-${vaultBatchId.slice(0, 8)}-${Date.now()}.json`,
      fingerprint
    };
  });
}

function importVaultAuditPackage(packageData, importer, options = {}) {
  if (!importer) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定导入操作人身份' };
  }
  if (!authSvc.canApproveAndPublish(importer)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可导入审计包' };
  }

  if (!packageData || typeof packageData !== 'object') {
    return { error: 'INVALID_PACKAGE', message: '无效的审计包格式' };
  }
  if (packageData.packageType !== 'vault-audit-export') {
    return { error: 'INVALID_PACKAGE', message: '不是有效的保险箱审计包' };
  }

  const packageFingerprint = packageData.vaultBatch?._exportContext?.exportFingerprint;
  if (!packageFingerprint) {
    return { error: 'INVALID_PACKAGE', message: '审计包缺少指纹验证信息' };
  }

  const verifyData = { ...packageData };
  verifyData.vaultBatch = { ...verifyData.vaultBatch };
  verifyData.vaultBatch._exportContext = {
    ...verifyData.vaultBatch._exportContext,
    exportFingerprint: ''
  };
  const computedFingerprint = computePackageFingerprint(verifyData);

  if (computedFingerprint !== packageFingerprint) {
    return {
      error: 'PACKAGE_TAMPERED',
      message: '审计包指纹校验失败，可能已被篡改',
      expected: packageFingerprint,
      actual: computedFingerprint
    };
  }

  return store.update(data => {
    const now = new Date().toISOString();
    const importId = uuidv4();
    const conflicts = [];
    const imported = [];
    let importStatus = 'completed';
    const sourceVaultBatchId = packageData.vaultBatch?.vaultBatchId;

    const existingPackage = (data.vaultImportPackages || []).find(
      p => p.fingerprint === packageFingerprint && p.type === 'import'
    );

    if (existingPackage) {
      conflicts.push({
        type: 'PACKAGE_DUPLICATE',
        message: `该审计包已于 ${existingPackage.exportedAt} 由 ${existingPackage.exportedBy} 导出，${existingPackage.importedAt || existingPackage.exportedAt} ${existingPackage.importer ? '由 ' + existingPackage.importer : ''} 导入`,
        existingPackageId: existingPackage.id,
        existingImporter: existingPackage.importer,
        existingImportedAt: existingPackage.importedAt || existingPackage.exportedAt
      });

      if (options.conflictStrategy === 'skip') {
        if (!data.vaultImportPackages) data.vaultImportPackages = [];
        data.vaultImportPackages.push({
          id: importId,
          packageId: packageFingerprint,
          type: 'import',
          vaultBatchId: sourceVaultBatchId,
          exportedBy: packageData.exportedBy,
          exportedAt: packageData.exportedAt,
          importer,
          importedAt: now,
          fingerprint: packageFingerprint,
          status: 'skipped',
          conflicts,
          importedItems: [],
          conflictStrategy: 'skip',
          force: false
        });
        return {
          importId,
          status: 'skipped',
          skipped: true,
          conflicts,
          message: '检测到重复审计包，已按 skip 策略跳过'
        };
      }

      if (options.conflictStrategy !== 'force') {
        return {
          importId,
          status: 'conflict',
          conflicts,
          message: '检测到重复审计包，请指定 conflictStrategy=skip 或 force',
          existingPackage: {
            id: existingPackage.id,
            exportedBy: existingPackage.exportedBy,
            exportedAt: existingPackage.exportedAt,
            importedBy: existingPackage.importer,
            importedAt: existingPackage.importedAt
          }
        };
      }

      importStatus = 'forced';
    }

    const existingVaultBatch = (data.vaultBatches || []).find(
      b => b.vaultBatchId === sourceVaultBatchId
    );

    let vaultBatchIdToUse = sourceVaultBatchId;

    if (!existingVaultBatch) {
      const newVaultBatch = {
        ...packageData.vaultBatch,
        importedFromPackage: packageFingerprint,
        importedBy: importer,
        importedAt: now,
        _exportContext: undefined
      };
      if (!data.vaultBatches) data.vaultBatches = [];
      data.vaultBatches.push(newVaultBatch);
      imported.push({ type: 'vaultBatch', id: sourceVaultBatchId });
    } else {
      vaultBatchIdToUse = sourceVaultBatchId;
    }

    if (packageData.sourceBatch) {
      const existingSourceBatch = batchSvc.getBatch(packageData.sourceBatch.batchId, importer);
      if (!existingSourceBatch || existingSourceBatch._redacted) {
        const sourceBatchResult = batchSvc.createBatch(
          packageData.logs || [],
          importer,
          {
            source: packageData.sourceBatch.sourceFile || `导入审计包-${packageFingerprint.slice(0, 8)}`,
            notes: `从审计包导入，原批次: ${packageData.sourceBatch.batchId}`,
            conflictStrategy: options.sourceBatchStrategy || 'merge'
          }
        );
        if (!sourceBatchResult.error) {
          imported.push({ type: 'sourceBatch', id: sourceBatchResult.batchId });
        }
      }
    }

    if (!data.vaultImportPackages) data.vaultImportPackages = [];
    data.vaultImportPackages.push({
      id: importId,
      packageId: packageFingerprint,
      type: 'import',
      vaultBatchId: vaultBatchIdToUse,
      exportedBy: packageData.exportedBy,
      exportedAt: packageData.exportedAt,
      importer,
      importedAt: now,
      fingerprint: packageFingerprint,
      status: importStatus,
      conflicts,
      importedItems: imported,
      conflictStrategy: options.conflictStrategy || 'reject',
      force: options.conflictStrategy === 'force'
    });

    return {
      importId,
      status: importStatus,
      vaultBatchId: vaultBatchIdToUse,
      importedAt: now,
      importer,
      importedCount: imported.length,
      conflictCount: conflicts.length,
      conflicts,
      imported,
      fingerprint: packageFingerprint,
      warnings: conflicts.length > 0
        ? [`导入完成，有 ${conflicts.length} 条冲突记录，请检查详情`]
        : []
    };
  });
}

function getImportedPackages(filters = {}) {
  const data = store.read();
  let packages = [...(data.vaultImportPackages || [])];

  if (filters.importer) {
    packages = packages.filter(p => p.importer === filters.importer);
  }
  if (filters.type) {
    packages = packages.filter(p => p.type === filters.type);
  }
  if (filters.status) {
    packages = packages.filter(p => p.status === filters.status);
  }
  if (filters.fingerprint) {
    packages = packages.filter(p => p.fingerprint === filters.fingerprint);
  }

  return packages.sort((a, b) => new Date(b.importedAt || b.exportedAt) - new Date(a.importedAt || a.exportedAt));
}

function getVaultRedactionRules(viewer) {
  if (!viewer || !authSvc.canApproveAndPublish(viewer)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可查看脱敏规则' };
  }

  const data = store.read();
  return data.vaultRedactionRules || [];
}

module.exports = {
  REDACTION_FIELDS,
  computePackageFingerprint,
  logVaultAccess,
  pushAccessLog,
  isVaultOwner,
  canAccessVaultDetail,
  applyRedaction,
  createVaultBatch,
  getVaultBatch,
  getVaultBatches,
  getVaultLogs,
  getVaultPlaybacks,
  playbackVaultBatch,
  getVaultNotes,
  updateVaultNotes,
  getVaultAccessTrail,
  exportVaultAuditPackage,
  importVaultAuditPackage,
  getImportedPackages,
  getVaultRedactionRules
};
