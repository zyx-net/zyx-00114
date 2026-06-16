const ROLES = {
  EDITOR: 'editor',
  APPROVER: 'approver'
};

const DEFAULT_USERS = [
  { id: 'zhang-editor', name: '张编辑', role: ROLES.EDITOR },
  { id: 'li-approver', name: '李审批', role: ROLES.APPROVER }
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

function canRestoreSnapshot(snapshotCreatedBy, operatorName) {
  return snapshotCreatedBy === operatorName;
}

function canDeleteSnapshot(snapshotCreatedBy, operatorName) {
  return snapshotCreatedBy === operatorName;
}

function isSamePersonSubmitAndApprove(submittedBy, approver) {
  return submittedBy === approver;
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
  canRestoreSnapshot,
  canDeleteSnapshot,
  isSamePersonSubmitAndApprove
};
