const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const store = require('./store');
const authSvc = require('./auth');
const vaultSvc = require('./playback-vault');
const batchSvc = require('./batch-trace');

const DEFAULT_MAX_DURATION_MINUTES = 120;
const DEFAULT_DEFAULT_DURATION_MINUTES = 30;

const DESK_REDACTED_FIELDS = [
  'detail', 'content', 'reason', 'notes', 'batchNo', 'logDetails',
  'operatorBreakdown', 'actionBreakdown', 'docBreakdown', 'conflicts',
  'invalidLogs', 'sourceDigest', 'contentFingerprint', 'items', 'logIds',
  'relatedOps', 'remarks'
];

function computePackageFingerprint(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str, 'utf-8').digest('hex').slice(0, 32);
}

function pushAccessLog(data, grantId, userId, action, granted, details) {
  if (!data.sensitiveDeskAccessLogs) data.sensitiveDeskAccessLogs = [];
  data.sensitiveDeskAccessLogs.push({
    id: uuidv4(),
    grantId: grantId || null,
    userId: userId || 'anonymous',
    action,
    granted,
    details: details || {},
    accessedAt: new Date().toISOString()
  });
}

function getDeskConfig() {
  const data = store.read();
  return data.sensitiveDeskConfig || {
    maxDurationMinutes: DEFAULT_MAX_DURATION_MINUTES,
    defaultDurationMinutes: DEFAULT_DEFAULT_DURATION_MINUTES
  };
}

function updateDeskConfig(updates, operator) {
  if (!operator || !authSvc.canApproveAndPublish(operator)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可更新借阅台配置' };
  }
  return store.update(data => {
    if (!data.sensitiveDeskConfig) {
      data.sensitiveDeskConfig = {
        maxDurationMinutes: DEFAULT_MAX_DURATION_MINUTES,
        defaultDurationMinutes: DEFAULT_DEFAULT_DURATION_MINUTES
      };
    }
    if (updates.maxDurationMinutes !== undefined && updates.maxDurationMinutes > 0) {
      data.sensitiveDeskConfig.maxDurationMinutes = updates.maxDurationMinutes;
    }
    if (updates.defaultDurationMinutes !== undefined && updates.defaultDurationMinutes > 0) {
      data.sensitiveDeskConfig.defaultDurationMinutes = updates.defaultDurationMinutes;
    }
    return { ...data.sensitiveDeskConfig };
  });
}

function applyDeskRedaction(obj, level) {
  if (!obj || typeof obj !== 'object') return obj;

  if (level === 'full') {
    const minimal = {};
    if (obj.vaultBatchId) minimal.vaultBatchId = obj.vaultBatchId;
    if (obj.batchId) minimal.batchId = obj.batchId;
    if (obj.grantId) minimal.grantId = obj.grantId;
    if (obj.status) minimal.status = obj.status;
    minimal._redacted = true;
    minimal._redactionLevel = 'full';
    return minimal;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        return applyDeskRedaction(item, level);
      }
      return item;
    });
  }

  const redacted = {};
  const allowedFields = [
    'grantId', 'targetVaultBatchId', 'applicant', 'approver',
    'status', 'createdAt', 'approvedAt', 'expiresAt',
    'durationMinutes', 'vaultBatchId', 'batchId',
    'importedAt', 'importedBy', 'ownerId',
    'recordCount', 'insertedCount', 'conflictCount', 'invalidCount',
    'sourceFile', 'conflictStrategy', '_redacted', '_redactionLevel',
    'playbackCount', 'exportedAt', 'exportedBy', 'playbackAt',
    'playbackBy', 'logCount', 'timeRange', 'revokeReason'
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

function checkGrantExpired(grant) {
  if (!grant || grant.status !== 'approved') return grant;
  if (grant.expiresAt && new Date(grant.expiresAt) <= new Date()) {
    return store.update(data => {
      const idx = (data.sensitiveDeskGrants || []).findIndex(g => g.grantId === grant.grantId);
      if (idx >= 0 && data.sensitiveDeskGrants[idx].status === 'approved') {
        data.sensitiveDeskGrants[idx].status = 'expired';
        pushAccessLog(data, grant.grantId, 'system', 'grant_expired', true, {});
      }
      return { expired: true, grantId: grant.grantId };
    });
  }
  return { expired: false };
}

function isGrantValid(grant) {
  if (!grant) return false;
  if (grant.status !== 'approved') return false;
  if (grant.expiresAt && new Date(grant.expiresAt) <= new Date()) return false;
  return true;
}

function validateSession(sessionId) {
  const data = store.read();
  const session = (data.sensitiveDeskSessions || []).find(s => s.sessionId === sessionId);
  if (!session) return { valid: false, reason: 'SESSION_NOT_FOUND' };
  if (session.invalid) return { valid: false, reason: 'SESSION_REVOKED' };

  const grant = (data.sensitiveDeskGrants || []).find(g => g.grantId === session.grantId);
  if (!isGrantValid(grant)) {
    return store.update(innerData => {
      const sIdx = (innerData.sensitiveDeskSessions || []).findIndex(s => s.sessionId === sessionId);
      if (sIdx >= 0) {
        innerData.sensitiveDeskSessions[sIdx].invalid = true;
        innerData.sensitiveDeskSessions[sIdx].invalidatedAt = new Date().toISOString();
      }
      return { valid: false, reason: 'GRANT_INVALID', grantStatus: grant ? grant.status : 'not_found' };
    });
  }

  return store.update(innerData => {
    const sIdx = (innerData.sensitiveDeskSessions || []).findIndex(s => s.sessionId === sessionId);
    if (sIdx >= 0) {
      innerData.sensitiveDeskSessions[sIdx].lastAccessedAt = new Date().toISOString();
    }
    return { valid: true, grantId: session.grantId, userId: session.userId, targetVaultBatchId: grant.targetVaultBatchId };
  });
}

function canViewSensitiveDetail(vaultBatch, viewer, grantId) {
  if (!viewer) return false;
  if (vaultSvc.canAccessVaultDetail(vaultBatch, viewer)) return true;

  if (grantId) {
    const data = store.read();
    const grant = (data.sensitiveDeskGrants || []).find(g => g.grantId === grantId);
    if (isGrantValid(grant) && grant.applicant === viewer && grant.targetVaultBatchId === vaultBatch.vaultBatchId) {
      return true;
    }
  }
  return false;
}

function applyForGrant(targetVaultBatchId, applicant, options) {
  if (!targetVaultBatchId) {
    return { error: 'INVALID_INPUT', message: '必须指定目标保险箱批次ID' };
  }
  if (!applicant) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定申请人' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === targetVaultBatchId);
  if (!vaultBatch) {
    return { error: 'BATCH_NOT_FOUND', message: '目标保险箱批次不存在' };
  }

  if (vaultSvc.canAccessVaultDetail(vaultBatch, applicant)) {
    return { error: 'ALREADY_AUTHORIZED', message: '该用户已是 owner 或审批员，无需申请授权' };
  }

  const config = data.sensitiveDeskConfig || {
    maxDurationMinutes: DEFAULT_MAX_DURATION_MINUTES,
    defaultDurationMinutes: DEFAULT_DEFAULT_DURATION_MINUTES
  };
  const requestedDuration = (options && options.durationMinutes) || config.defaultDurationMinutes;
  const cappedDuration = Math.min(requestedDuration, config.maxDurationMinutes);

  return store.update(innerData => {
    const grantId = uuidv4();
    const now = new Date().toISOString();

    const grant = {
      grantId,
      targetVaultBatchId,
      applicant,
      approver: null,
      reason: (options && options.reason) || '',
      status: 'pending',
      createdAt: now,
      approvedAt: null,
      revokedAt: null,
      expiresAt: null,
      durationMinutes: cappedDuration,
      revokeReason: '',
      requestedDurationMinutes: requestedDuration,
      maxDurationMinutes: config.maxDurationMinutes
    };

    if (!innerData.sensitiveDeskGrants) innerData.sensitiveDeskGrants = [];
    innerData.sensitiveDeskGrants.push(grant);

    pushAccessLog(innerData, grantId, applicant, 'apply', true, { targetVaultBatchId, requestedDuration, cappedDuration });

    return {
      grantId,
      targetVaultBatchId,
      applicant,
      status: 'pending',
      createdAt: now,
      durationMinutes: cappedDuration,
      requestedDurationMinutes: requestedDuration,
      maxDurationMinutes: config.maxDurationMinutes,
      message: requestedDuration > cappedDuration
        ? `申请时长 ${requestedDuration} 分钟超出上限 ${config.maxDurationMinutes} 分钟，已调整为 ${cappedDuration} 分钟`
        : '授权申请已提交，等待审批'
    };
  });
}

function approveGrant(grantId, approver, options) {
  if (!grantId) {
    return { error: 'INVALID_INPUT', message: '必须指定授权单ID' };
  }
  if (!approver) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定审批人' };
  }
  if (!authSvc.canApproveAndPublish(approver)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可审批授权单' };
  }

  const data = store.read();
  const grant = (data.sensitiveDeskGrants || []).find(g => g.grantId === grantId);
  if (!grant) {
    return { error: 'GRANT_NOT_FOUND', message: '授权单不存在' };
  }
  if (grant.status !== 'pending') {
    return { error: 'INVALID_STATUS', message: `授权单当前状态为 ${grant.status}，仅 pending 状态可审批` };
  }

  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === grant.targetVaultBatchId);
  if (!vaultBatch) {
    return { error: 'BATCH_NOT_FOUND', message: '目标保险箱批次不存在' };
  }
  if (!vaultSvc.canAccessVaultDetail(vaultBatch, approver)) {
    return { error: 'PERMISSION_DENIED', message: '仅批次 owner 或审批员可审批该授权单' };
  }

  return store.update(innerData => {
    const now = new Date().toISOString();
    const idx = (innerData.sensitiveDeskGrants || []).findIndex(g => g.grantId === grantId);
    if (idx < 0) return { error: 'GRANT_NOT_FOUND', message: '授权单不存在' };

    innerData.sensitiveDeskGrants[idx].status = 'approved';
    innerData.sensitiveDeskGrants[idx].approver = approver;
    innerData.sensitiveDeskGrants[idx].approvedAt = now;
    innerData.sensitiveDeskGrants[idx].expiresAt = new Date(Date.now() + innerData.sensitiveDeskGrants[idx].durationMinutes * 60000).toISOString();
    innerData.sensitiveDeskGrants[idx].approvalNotes = (options && options.notes) || '';

    pushAccessLog(innerData, grantId, approver, 'approve', true, { durationMinutes: innerData.sensitiveDeskGrants[idx].durationMinutes });

    return {
      grantId,
      status: 'approved',
      approver,
      approvedAt: now,
      expiresAt: innerData.sensitiveDeskGrants[idx].expiresAt,
      durationMinutes: innerData.sensitiveDeskGrants[idx].durationMinutes
    };
  });
}

function revokeGrant(grantId, operator, revokeReason) {
  if (!grantId) {
    return { error: 'INVALID_INPUT', message: '必须指定授权单ID' };
  }
  if (!operator) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定操作人' };
  }

  const data = store.read();
  const grant = (data.sensitiveDeskGrants || []).find(g => g.grantId === grantId);
  if (!grant) {
    return { error: 'GRANT_NOT_FOUND', message: '授权单不存在' };
  }
  if (grant.status !== 'approved' && grant.status !== 'pending') {
    return { error: 'INVALID_STATUS', message: `授权单当前状态为 ${grant.status}，仅 approved/pending 状态可撤销` };
  }

  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === grant.targetVaultBatchId);
  if (!vaultSvc.canAccessVaultDetail(vaultBatch, operator)) {
    return { error: 'PERMISSION_DENIED', message: '仅批次 owner 或审批员可撤销授权单' };
  }

  return store.update(innerData => {
    const now = new Date().toISOString();
    const idx = (innerData.sensitiveDeskGrants || []).findIndex(g => g.grantId === grantId);
    if (idx < 0) return { error: 'GRANT_NOT_FOUND', message: '授权单不存在' };

    innerData.sensitiveDeskGrants[idx].status = 'revoked';
    innerData.sensitiveDeskGrants[idx].revokedAt = now;
    innerData.sensitiveDeskGrants[idx].revokeReason = revokeReason || '';

    const invalidatedSessions = [];
    (innerData.sensitiveDeskSessions || []).forEach((s, sIdx) => {
      if (s.grantId === grantId && !s.invalid) {
        innerData.sensitiveDeskSessions[sIdx].invalid = true;
        innerData.sensitiveDeskSessions[sIdx].invalidatedAt = now;
        innerData.sensitiveDeskSessions[sIdx].invalidationReason = 'grant_revoked';
        invalidatedSessions.push(s.sessionId);
      }
    });

    pushAccessLog(innerData, grantId, operator, 'revoke', true, { revokeReason: revokeReason || '', invalidatedSessions: invalidatedSessions.length });

    return {
      grantId,
      status: 'revoked',
      revokedAt: now,
      revokeReason: revokeReason || '',
      invalidatedSessions: invalidatedSessions.length
    };
  });
}

function openSession(grantId, userId) {
  if (!grantId || !userId) {
    return { error: 'INVALID_INPUT', message: '必须指定授权单ID和用户' };
  }

  const data = store.read();
  const grant = (data.sensitiveDeskGrants || []).find(g => g.grantId === grantId);
  if (!isGrantValid(grant)) {
    return { error: 'GRANT_INVALID', message: '授权单无效、已过期或已撤销' };
  }
  if (grant.applicant !== userId) {
    return { error: 'PERMISSION_DENIED', message: '授权单申请人与当前用户不匹配' };
  }

  return store.update(innerData => {
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    const session = {
      sessionId,
      grantId,
      userId,
      createdAt: now,
      lastAccessedAt: now,
      invalid: false,
      invalidatedAt: null,
      invalidationReason: null
    };

    if (!innerData.sensitiveDeskSessions) innerData.sensitiveDeskSessions = [];
    innerData.sensitiveDeskSessions.push(session);

    pushAccessLog(innerData, grantId, userId, 'open_session', true, { sessionId });

    return {
      sessionId,
      grantId,
      userId,
      createdAt: now,
      expiresAt: grant.expiresAt
    };
  });
}

function getGrants(filters) {
  const data = store.read();
  let grants = [...(data.sensitiveDeskGrants || [])];

  if (filters && filters.targetVaultBatchId) {
    grants = grants.filter(g => g.targetVaultBatchId === filters.targetVaultBatchId);
  }
  if (filters && filters.applicant) {
    grants = grants.filter(g => g.applicant === filters.applicant);
  }
  if (filters && filters.approver) {
    grants = grants.filter(g => g.approver === filters.approver);
  }
  if (filters && filters.status) {
    grants = grants.filter(g => g.status === filters.status);
  }

  grants.forEach(g => checkGrantExpired(g));

  return grants.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getGrant(grantId, viewer) {
  if (!grantId) return null;
  const data = store.read();
  const grant = (data.sensitiveDeskGrants || []).find(g => g.grantId === grantId);
  if (!grant) return null;

  checkGrantExpired(grant);

  const canSeeDetail = viewer &&
    (grant.applicant === viewer ||
     authSvc.canApproveAndPublish(viewer));

  if (!canSeeDetail) {
    return applyDeskRedaction(grant, 'summary');
  }
  return { ...grant, _redacted: false };
}

function getSensitiveDetail(vaultBatchId, viewer, grantId) {
  if (!vaultBatchId || !viewer) {
    return { error: 'INVALID_INPUT', message: '必须指定保险箱批次ID和查看人' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) {
    return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };
  }

  const canAccess = canViewSensitiveDetail(vaultBatch, viewer, grantId);

  return store.update(innerData => {
    pushAccessLog(innerData, grantId || null, viewer, 'view_detail', canAccess, { vaultBatchId, grantId: grantId || null });

    if (!canAccess) {
      const sourceBatch = batchSvc.getBatch(vaultBatch.sourceBatchId, null);
      return applyDeskRedaction({
        ...vaultBatch,
        sourceBatch: sourceBatch ? applyDeskRedaction(sourceBatch, 'summary') : null
      }, 'summary');
    }

    const sourceBatch = batchSvc.getBatch(vaultBatch.sourceBatchId, viewer);
    return {
      ...vaultBatch,
      sourceBatch,
      _redacted: false,
      _accessVia: grantId ? 'grant' : 'owner'
    };
  });
}

function getSensitiveLogs(vaultBatchId, viewer, grantId) {
  if (!vaultBatchId || !viewer) {
    return { error: 'INVALID_INPUT', message: '必须指定保险箱批次ID和查看人' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) {
    return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };
  }

  const canAccess = canViewSensitiveDetail(vaultBatch, viewer, grantId);

  return store.update(innerData => {
    pushAccessLog(innerData, grantId || null, viewer, 'view_logs', canAccess, { vaultBatchId, grantId: grantId || null });

    const logs = batchSvc.getLogsByBatch(vaultBatch.sourceBatchId);

    if (!canAccess) {
      return logs.map(log => applyDeskRedaction(log, 'summary'));
    }

    return logs;
  });
}

function exportSensitivePackage(vaultBatchId, viewer, grantId) {
  if (!vaultBatchId || !viewer) {
    return { error: 'INVALID_INPUT', message: '必须指定保险箱批次ID和导出人' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) {
    return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };
  }

  const canAccess = canViewSensitiveDetail(vaultBatch, viewer, grantId);
  if (!canAccess) {
    return { error: 'PERMISSION_DENIED', message: '无权导出该批次审计包' };
  }

  const sourceBatch = batchSvc.getBatch(vaultBatch.sourceBatchId, viewer);
  const logs = batchSvc.getLogsByBatch(vaultBatch.sourceBatchId);
  const playbacks = batchSvc.getPlaybacksByBatch(vaultBatch.sourceBatchId);
  const accessTrail = vaultSvc.getVaultAccessTrail(vaultBatchId, viewer);

  const grants = (data.sensitiveDeskGrants || [])
    .filter(g => g.targetVaultBatchId === vaultBatchId)
    .map(g => ({
      grantId: g.grantId,
      applicant: g.applicant,
      approver: g.approver,
      status: g.status,
      reason: g.reason,
      createdAt: g.createdAt,
      approvedAt: g.approvedAt,
      expiresAt: g.expiresAt,
      durationMinutes: g.durationMinutes,
      revokeReason: g.revokeReason
    }));

  const now = new Date().toISOString();
  const packageData = {
    packageVersion: '1.0',
    packageType: 'sensitive-desk-export',
    exportedAt: now,
    exportedBy: viewer,
    vaultBatchId,
    vaultBatch: {
      ...vaultBatch,
      _exportContext: { exportFingerprint: '', exportChain: [] }
    },
    sourceBatch,
    logs,
    playbacks,
    accessTrail: accessTrail.trail || [],
    grants,
    exportVia: grantId ? 'grant' : 'owner',
    grantId: grantId || null
  };

  const fingerprint = computePackageFingerprint(packageData);
  packageData.vaultBatch._exportContext.exportFingerprint = fingerprint;

  return store.update(innerData => {
    if (!innerData.sensitiveDeskImportPackages) innerData.sensitiveDeskImportPackages = [];
    innerData.sensitiveDeskImportPackages.push({
      id: uuidv4(),
      packageId: fingerprint,
      type: 'export',
      vaultBatchId,
      exportedBy: viewer,
      exportedAt: now,
      fingerprint,
      status: 'exported',
      grantId: grantId || null
    });

    pushAccessLog(innerData, grantId || null, viewer, 'export', true, { fingerprint, grantId: grantId || null });

    return {
      packageData,
      filename: `sensitive-desk-${vaultBatchId.slice(0, 8)}-${Date.now()}.json`,
      fingerprint
    };
  });
}

function importSensitivePackage(packageData, importer, options) {
  if (!importer) {
    return { error: 'OPERATOR_REQUIRED', message: '必须指定导入操作人身份' };
  }
  if (!authSvc.canApproveAndPublish(importer)) {
    return { error: 'PERMISSION_DENIED', message: '仅审批员可导入敏感审计包' };
  }
  if (!packageData || typeof packageData !== 'object') {
    return { error: 'INVALID_PACKAGE', message: '无效的审计包格式' };
  }
  if (packageData.packageType !== 'sensitive-desk-export') {
    return { error: 'INVALID_PACKAGE', message: '不是有效的敏感审计借阅台导出包' };
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

    const existingPackage = (data.sensitiveDeskImportPackages || []).find(
      p => p.fingerprint === packageFingerprint && p.type === 'import'
    );

    if (existingPackage) {
      conflicts.push({
        type: 'PACKAGE_DUPLICATE',
        message: `该审计包已于 ${existingPackage.importedAt} 由 ${existingPackage.importer} 导入`,
        existingPackageId: existingPackage.id,
        existingImporter: existingPackage.importer,
        existingImportedAt: existingPackage.importedAt
      });

      if (options.conflictStrategy === 'skip') {
        if (!data.sensitiveDeskImportPackages) data.sensitiveDeskImportPackages = [];
        data.sensitiveDeskImportPackages.push({
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
          force: false,
          grantId: packageData.grantId || null
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
            exporter: existingPackage.exportedBy,
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
    }

    if (packageData.sourceBatch) {
      const existingSourceBatch = batchSvc.getBatch(packageData.sourceBatch.batchId, importer);
      if (!existingSourceBatch || existingSourceBatch._redacted) {
        const sourceBatchResult = batchSvc.createBatch(
          packageData.logs || [],
          importer,
          {
            source: packageData.sourceBatch.sourceFile || `导入敏感审计包-${packageFingerprint.slice(0, 8)}`,
            notes: `从敏感审计包导入，原批次: ${packageData.sourceBatch.batchId}`,
            conflictStrategy: options.sourceBatchStrategy || 'merge'
          }
        );
        if (!sourceBatchResult.error) {
          imported.push({ type: 'sourceBatch', id: sourceBatchResult.batchId });
        }
      }
    }

    if (packageData.grants && Array.isArray(packageData.grants)) {
      packageData.grants.forEach(exportedGrant => {
        const existingGrant = (data.sensitiveDeskGrants || []).find(
          g => g.grantId === exportedGrant.grantId
        );
        if (!existingGrant) {
          const restoredGrant = {
            ...exportedGrant,
            _importedFromPackage: packageFingerprint,
            _importedBy: importer,
            _importedAt: now
          };
          if (!data.sensitiveDeskGrants) data.sensitiveDeskGrants = [];
          data.sensitiveDeskGrants.push(restoredGrant);
          imported.push({ type: 'grant', id: exportedGrant.grantId });
        }
      });
    }

    if (!data.sensitiveDeskImportPackages) data.sensitiveDeskImportPackages = [];
    data.sensitiveDeskImportPackages.push({
      id: importId,
      packageId: packageFingerprint,
      type: 'import',
      vaultBatchId: sourceVaultBatchId,
      exportedBy: packageData.exportedBy,
      exportedAt: packageData.exportedAt,
      importer,
      importedAt: now,
      fingerprint: packageFingerprint,
      status: importStatus,
      conflicts,
      importedItems: imported,
      conflictStrategy: options.conflictStrategy || 'reject',
      force: options.conflictStrategy === 'force',
      grantId: packageData.grantId || null
    });

    pushAccessLog(data, null, importer, 'import_package', true, { fingerprint: packageFingerprint, importId });

    return {
      importId,
      status: importStatus,
      vaultBatchId: sourceVaultBatchId,
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

function getImportedPackages(filters) {
  const data = store.read();
  let packages = [...(data.sensitiveDeskImportPackages || [])];

  if (filters && filters.importer) {
    packages = packages.filter(p => p.importer === filters.importer);
  }
  if (filters && filters.type) {
    packages = packages.filter(p => p.type === filters.type);
  }
  if (filters && filters.status) {
    packages = packages.filter(p => p.status === filters.status);
  }
  if (filters && filters.fingerprint) {
    packages = packages.filter(p => p.fingerprint === filters.fingerprint);
  }

  return packages.sort((a, b) => new Date(b.importedAt || b.exportedAt) - new Date(a.importedAt || a.exportedAt));
}

function getAccessLogs(filters) {
  const data = store.read();
  let logs = [...(data.sensitiveDeskAccessLogs || [])];

  if (filters && filters.userId) {
    logs = logs.filter(l => l.userId === filters.userId);
  }
  if (filters && filters.grantId) {
    logs = logs.filter(l => l.grantId === filters.grantId);
  }
  if (filters && filters.action) {
    logs = logs.filter(l => l.action === filters.action);
  }
  if (filters && filters.granted !== undefined) {
    logs = logs.filter(l => l.granted === filters.granted);
  }
  if (filters && filters.since) {
    logs = logs.filter(l => new Date(l.accessedAt) >= new Date(filters.since));
  }

  return logs.sort((a, b) => new Date(b.accessedAt) - new Date(a.accessedAt));
}

function expireGrants() {
  return store.update(data => {
    const now = new Date();
    let expiredCount = 0;

    (data.sensitiveDeskGrants || []).forEach(grant => {
      if (grant.status === 'approved' && grant.expiresAt && new Date(grant.expiresAt) <= now) {
        grant.status = 'expired';

        (data.sensitiveDeskSessions || []).forEach(session => {
          if (session.grantId === grant.grantId && !session.invalid) {
            session.invalid = true;
            session.invalidatedAt = now.toISOString();
            session.invalidationReason = 'grant_expired';
          }
        });

        pushAccessLog(data, grant.grantId, 'system', 'grant_expired', true, {});
        expiredCount++;
      }
    });

    return { expiredCount };
  });
}

function getSensitivePlaybacks(vaultBatchId, viewer, grantId) {
  if (!vaultBatchId || !viewer) {
    return { error: 'INVALID_INPUT', message: '必须指定保险箱批次ID和查看人' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) {
    return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };
  }

  const canAccess = canViewSensitiveDetail(vaultBatch, viewer, grantId);

  return store.update(innerData => {
    pushAccessLog(innerData, grantId || null, viewer, 'view_playbacks', canAccess, { vaultBatchId, grantId: grantId || null });

    const playbacks = batchSvc.getPlaybacksByBatch(vaultBatch.sourceBatchId);

    if (!canAccess) {
      return playbacks.map(p => applyDeskRedaction(p, 'summary'));
    }

    return playbacks;
  });
}

function getSensitiveNotes(vaultBatchId, viewer, grantId) {
  if (!vaultBatchId || !viewer) {
    return { error: 'INVALID_INPUT', message: '必须指定保险箱批次ID和查看人' };
  }

  const data = store.read();
  const vaultBatch = (data.vaultBatches || []).find(b => b.vaultBatchId === vaultBatchId);
  if (!vaultBatch) {
    return { error: 'BATCH_NOT_FOUND', message: '保险箱批次不存在' };
  }

  const canAccess = canViewSensitiveDetail(vaultBatch, viewer, grantId);

  return store.update(innerData => {
    pushAccessLog(innerData, grantId || null, viewer, 'view_notes', canAccess, { vaultBatchId, grantId: grantId || null });

    if (!canAccess) {
      return {
        vaultBatchId,
        notes: null,
        _redacted: true,
        _redactionLevel: 'summary'
      };
    }

    return {
      vaultBatchId,
      notes: vaultBatch.notes,
      createdAt: vaultBatch.createdAt,
      updatedAt: vaultBatch.updatedAt,
      _redacted: false
    };
  });
}

module.exports = {
  applyDeskRedaction,
  applyForGrant,
  approveGrant,
  revokeGrant,
  openSession,
  validateSession,
  getGrants,
  getGrant,
  getSensitiveDetail,
  getSensitiveLogs,
  getSensitivePlaybacks,
  getSensitiveNotes,
  exportSensitivePackage,
  importSensitivePackage,
  getImportedPackages,
  getAccessLogs,
  getDeskConfig,
  updateDeskConfig,
  expireGrants,
  isGrantValid,
  canViewSensitiveDetail,
  computePackageFingerprint
};
