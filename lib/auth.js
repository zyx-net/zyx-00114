const ROLES = {
  EDITOR: 'editor',
  APPROVER: 'approver'
};

const DEFAULT_USERS = [
  { id: 'zhang-editor', name: '张编辑', role: ROLES.EDITOR },
  { id: 'li-editor', name: '李编辑', role: ROLES.EDITOR },
  { id: 'wang-editor', name: '王编辑', role: ROLES.EDITOR },
  { id: 'li-approver', name: '李审批', role: ROLES.APPROVER },
  { id: 'zhao-approver', name: '赵审批', role: ROLES.APPROVER }
];

function getUsers() {
  return DEFAULT_USERS;
}

function getUserByName(name) {
  return DEFAULT_USERS.find(u => u.name === name) || null;
}

function getUserById(id) {
  return DEFAULT_USERS.find(u => u.id === id) || null;
}

function getUserRole(name) {
  const user = getUserByName(name);
  return user ? user.role : null;
}

function canSubmitRevision(operatorName) {
  return true;
}

function canApproveAndPublish(operatorName) {
  const role = getUserRole(operatorName);
  return role === ROLES.APPROVER;
}

function canWithdraw(operatorName) {
  const role = getUserRole(operatorName);
  return role === ROLES.APPROVER;
}

function canEditDraft(draftCreatedBy, operatorName) {
  return draftCreatedBy === operatorName;
}

function canDeleteDraft(draftCreatedBy, operatorName) {
  return draftCreatedBy === operatorName;
}

function canViewSnapshot(snapshotCreatedBy, operatorName) {
  return snapshotCreatedBy === operatorName;
}

function canViewAllDrafts(operatorName) {
  const role = getUserRole(operatorName);
  return role === ROLES.APPROVER;
}

function canRestoreSnapshot(snapshotCreatedBy, operatorName) {
  return snapshotCreatedBy === operatorName;
}

function canDeleteSnapshot(snapshotCreatedBy, operatorName) {
  return snapshotCreatedBy === operatorName;
}

function isSamePersonSubmitAndApprove(submittedBy, approver) {
  return submittedBy === approver;
}

function canViewBatchDetail(batchImportedBy, viewer) {
  if (!viewer) return false;
  if (batchImportedBy === viewer) return true;
  return canApproveAndPublish(viewer);
}

function canExportBatchAudit(batchImportedBy, viewer) {
  if (!viewer) return false;
  if (batchImportedBy === viewer) return true;
  return canApproveAndPublish(viewer);
}

module.exports = {
  ROLES,
  DEFAULT_USERS,
  getUsers,
  getUserByName,
  getUserById,
  getUserRole,
  canSubmitRevision,
  canApproveAndPublish,
  canWithdraw,
  canEditDraft,
  canDeleteDraft,
  canViewSnapshot,
  canViewAllDrafts,
  canRestoreSnapshot,
  canDeleteSnapshot,
  isSamePersonSubmitAndApprove,
  canViewBatchDetail,
  canExportBatchAudit
};
