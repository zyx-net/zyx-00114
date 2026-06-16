(function () {
  const API = '/api';

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function toast(msg, type) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || 'success');
    setTimeout(() => t.className = 'toast', 3000);
  }

  function showResult(el, msg, type) {
    el.textContent = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg;
    el.className = 'result-area show ' + type;
  }

  function shortId(id) {
    return id ? id.slice(0, 8) + '...' : '-';
  }

  function fmtTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('zh-CN');
  }

  async function api(path, opts) {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  function getOperator() {
    return $('#operatorName').value || '未知';
  }

  function getRole() {
    return $('#roleSelect').value;
  }

  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = $('#tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
      if (['revision', 'diff', 'approval', 'archives', 'log', 'drafts', 'audit'].includes(tab.dataset.tab)) {
        loadDocSelects();
      }
      if (tab.dataset.tab === 'drafts') loadDrafts();
      if (tab.dataset.tab === 'audit') {
        loadAuditDocSelect();
        refreshAuditBatches();
        refreshAuditPlaybacks();
      }
      if (tab.dataset.tab === 'batch') {
        refreshBatchList();
      }
    });
  });

  $('#switchRoleBtn').addEventListener('click', () => {
    const role = getRole();
    const nameInput = $('#operatorName');
    if (role === 'editor') {
      nameInput.value = nameInput.value.includes('编辑') ? nameInput.value : '张编辑';
    } else {
      nameInput.value = nameInput.value.includes('审批') ? nameInput.value : '李审批';
    }
    toast('已切换角色为：' + (role === 'editor' ? '编辑员' : '审批员'));
  });

  $('#roleSelect').addEventListener('change', () => {
    const role = getRole();
    $('#operatorName').value = role === 'editor' ? '张编辑' : '李审批';
  });

  const SAMPLE_DOC = `第一章 总则

第一条 为加强信息安全管理，保障公司信息资产安全，特制定本制度。

第二条 本制度适用于公司全体员工及外部合作人员。

第三条 信息安全管理工作坚持"预防为主、综合治理"的原则。

第二章 管理职责

第四条 信息技术部负责信息安全技术防护体系的建设与运维。

第五条 各部门负责人为本部门信息安全第一责任人。

第六条 全体员工应自觉遵守信息安全相关规定，发现安全隐患应及时报告。`;

  $('#loadSampleBtn').addEventListener('click', () => {
    $('#importTitle').value = '信息安全管理制度';
    $('#importContent').value = SAMPLE_DOC;
    toast('样例文档已加载', 'success');
  });

  $('#importBtn').addEventListener('click', async () => {
    const title = $('#importTitle').value.trim();
    const content = $('#importContent').value;
    if (!title || content === undefined) {
      return toast('请填写标题和内容', 'error');
    }
    const { ok, data } = await api('/documents', {
      method: 'POST',
      body: JSON.stringify({ title, content, operator: getOperator() })
    });
    const el = $('#importResult');
    if (ok) {
      showResult(el, '导入成功！文档ID: ' + data.document.id + '，版本: ' + data.version.versionNumber, 'success');
      toast('文档导入成功');
    } else {
      showResult(el, '导入失败: ' + (data.error || '未知错误'), 'error');
    }
  });

  $('#refreshDocsBtn').addEventListener('click', loadDocuments);

  async function loadDocuments() {
    const { data } = await api('/documents');
    const tbody = $('#docsTable tbody');
    tbody.innerHTML = '';
    (data || []).forEach(doc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="id-short" title="${doc.id}">${shortId(doc.id)}</td>
        <td>${doc.title}</td>
        <td>${doc.currentVersionNumber}</td>
        <td>${fmtTime(doc.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="app.viewDoc('${doc.id}')">查看</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadDocSelects() {
    const { data } = await api('/documents');
    const selects = [
      '#revisionDocSelect', '#diffDocSelect', '#archiveDocSelect', '#logDocSelect', '#draftDocSelect'
    ];
    selects.forEach(sel => {
      const s = $(sel);
      if (!s) return;
      const cur = s.value;
      s.innerHTML = '<option value="">-- 请选择 --</option>';
      (data || []).forEach(doc => {
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = doc.title + ' (v' + doc.currentVersionNumber + ')';
        s.appendChild(opt);
      });
      if (cur) s.value = cur;
    });
  }

  window.app = {};

  window.app.viewDoc = async function (docId) {
    const { data } = await api('/documents/' + docId);
    if (data && data.currentVersion) {
      toast('当前版本: v' + data.currentVersion.versionNumber + '，内容长度: ' + data.currentVersion.content.length + ' 字符');
    }
  };

  $('#loadCurrentBtn').addEventListener('click', async () => {
    const docId = $('#revisionDocSelect').value;
    if (!docId) return toast('请先选择文档', 'error');
    const { data } = await api('/documents/' + docId);
    if (data && data.currentVersion) {
      $('#revisionContent').value = data.currentVersion.content;
      toast('已加载当前版本 v' + data.currentVersion.versionNumber);
    }
  });

  $('#previewDiffBtn').addEventListener('click', async () => {
    const docId = $('#revisionDocSelect').value;
    if (!docId) return toast('请先选择文档', 'error');
    const newContent = $('#revisionContent').value;
    const { data: docData } = await api('/documents/' + docId);
    if (!docData || !docData.currentVersion) return toast('无法获取当前版本', 'error');

    const { data: diffData } = await api('/diff', {
      method: 'POST',
      body: JSON.stringify({
        oldContent: docData.currentVersion.content,
        newContent
      })
    });
    renderDiff($('#diffPreview'), diffData);
  });

  $('#submitRevisionBtn').addEventListener('click', async () => {
    const docId = $('#revisionDocSelect').value;
    const reason = $('#revisionReason').value.trim();
    const content = $('#revisionContent').value;
    const el = $('#revisionResult');

    const { ok, data } = await api('/documents/' + docId + '/revisions', {
      method: 'POST',
      body: JSON.stringify({ content, reason, operator: getOperator() })
    });

    if (ok) {
      showResult(el, '修订提交成功！修订ID: ' + shortId(data.revision.id) +
        '，版本: ' + data.revision.oldVersionNumber + ' → ' + data.revision.newVersionNumber, 'success');
      toast('修订已提交');
    } else {
      showResult(el, '提交失败: ' + (data.message || data.error), 'error');
    }
  });

  $('#saveDraftBtn').addEventListener('click', async () => {
    const docId = $('#revisionDocSelect').value;
    const reason = $('#revisionReason').value.trim();
    const content = $('#revisionContent').value;
    const el = $('#revisionResult');

    if (!docId) return toast('请先选择文档', 'error');
    if (!content) return toast('修订内容不能为空', 'error');

    const { ok, data } = await api('/drafts', {
      method: 'POST',
      body: JSON.stringify({ documentId: docId, content, reason, operator: getOperator() })
    });

    if (ok) {
      showResult(el, '草稿保存成功！草稿ID: ' + shortId(data.draft.id) +
        (data.isNew ? '（新建）' : '（更新已有草稿）'), 'success');
      toast('草稿已保存');
    } else {
      showResult(el, '保存草稿失败: ' + (data.message || data.error), 'error');
    }
  });

  let currentDraftId = null;

  $('#refreshDraftsBtn').addEventListener('click', loadDrafts);

  async function loadDrafts() {
    const docId = $('#draftDocSelect').value;
    const operator = getOperator();
    const container = $('#draftList');
    container.innerHTML = '';

    let drafts = [];
    if (docId) {
      const { data } = await api('/drafts?documentId=' + docId);
      drafts = data || [];
    } else {
      const { data } = await api('/drafts?operator=' + encodeURIComponent(operator));
      drafts = data || [];
    }

    if (drafts.length === 0) {
      container.innerHTML = '<p style="color:#999">暂无草稿</p>';
      $('#draftEditArea').style.display = 'none';
      return;
    }

    drafts.filter(d => d.status === 'draft').forEach(d => {
      const div = document.createElement('div');
      div.className = 'draft-card' + (d.id === currentDraftId ? ' active' : '');
      div.innerHTML = `
        <strong>${escapeHtml(d.reason || '无理由')}</strong>
        <span class="draft-baseline">基线 v${d.baselineVersionNumber}</span>
        <div class="meta">
          创建人: ${d.createdBy} | 更新: ${fmtTime(d.updatedAt)} | 内容长度: ${d.content.length} 字符
        </div>`;
      div.addEventListener('click', () => openDraft(d.id));
      container.appendChild(div);
    });
  }

  async function openDraft(draftId) {
    const { data: draft } = await api('/drafts/' + draftId);
    if (!draft) return toast('草稿不存在', 'error');

    currentDraftId = draftId;
    $('#draftReason').value = draft.reason || '';
    $('#draftContent').value = draft.content || '';
    $('#draftEditArea').style.display = 'block';
    $('#draftConflictWarning').style.display = 'none';
    $('#snapshotConflictWarning').style.display = 'none';

    const isOwner = draft.createdBy === getOperator();
    $('#draftUpdateBtn').style.display = isOwner ? '' : 'none';
    $('#draftDeleteBtn').style.display = isOwner ? '' : 'none';
    $('#draftSubmitBtn').style.display = isOwner ? '' : 'none';
    $('#refreshSnapshotsBtn').style.display = isOwner ? '' : 'none';

    if (!isOwner) {
      $('#draftResult').textContent = '此草稿由 ' + draft.createdBy + ' 创建，您只能查看';
      $('#draftResult').className = 'result-area show info';
    }

    const { data: conflict } = await api('/drafts/' + draftId + '/conflict');
    if (conflict && conflict.hasConflict) {
      const warningEl = $('#draftConflictWarning');
      warningEl.innerHTML = '<strong>⚠ 基线版本冲突</strong><br>' +
        '此草稿基于版本 <strong>v' + conflict.baselineVersion + '</strong>，但文档当前版本已更新为 <strong>v' + conflict.currentVersion + '</strong>。<br>' +
        '提交此草稿将被拦截。请基于最新版本重新创建草稿。';
      warningEl.style.display = 'block';
    }

    if (isOwner) {
      loadSnapshots();
    } else {
      $('#snapshotList').innerHTML = '<p style="color:#999">仅草稿创建者可查看和管理快照</p>';
    }

    loadDrafts();
  }

  $('#draftUpdateBtn').addEventListener('click', async () => {
    if (!currentDraftId) return toast('请先选择草稿', 'error');
    const { ok, data } = await api('/drafts/' + currentDraftId, {
      method: 'PUT',
      body: JSON.stringify({
        content: $('#draftContent').value,
        reason: $('#draftReason').value,
        operator: getOperator()
      })
    });
    const el = $('#draftResult');
    if (ok) {
      showResult(el, '草稿已更新，快照已自动创建', 'success');
      toast('草稿已保存');
      loadDrafts();
      loadSnapshots();
    } else {
      showResult(el, '更新失败: ' + (data.message || data.error), 'error');
    }
  });

  $('#draftSubmitBtn').addEventListener('click', async () => {
    if (!currentDraftId) return toast('请先选择草稿', 'error');
    const { ok, status, data } = await api('/drafts/' + currentDraftId + '/submit', {
      method: 'POST',
      body: JSON.stringify({ operator: getOperator() })
    });
    const el = $('#draftResult');
    if (ok) {
      showResult(el, '从草稿提交修订成功！版本: ' + data.revision.oldVersionNumber + ' → ' + data.revision.newVersionNumber, 'success');
      toast('修订已提交');
      currentDraftId = null;
      $('#draftEditArea').style.display = 'none';
      loadDrafts();
    } else if (status === 409) {
      const warningEl = $('#draftConflictWarning');
      warningEl.innerHTML = '<strong>⚠ 基线版本冲突 - 提交被拦截</strong><br>' +
        (data.message || '草稿基于的版本与当前版本不一致，无法提交') + '<br>' +
        '请基于最新版本重新创建草稿。';
      warningEl.style.display = 'block';
      showResult(el, '提交失败: ' + (data.message || '基线版本冲突'), 'error');
    } else {
      showResult(el, '提交失败: ' + (data.message || data.error), 'error');
    }
  });

  $('#draftDeleteBtn').addEventListener('click', async () => {
    if (!currentDraftId) return toast('请先选择草稿', 'error');
    if (!confirm('确定删除此草稿？')) return;
    const { ok, data } = await api('/drafts/' + currentDraftId, {
      method: 'DELETE',
      body: JSON.stringify({ operator: getOperator() })
    });
    const el = $('#draftResult');
    if (ok) {
      showResult(el, '草稿已删除', 'success');
      toast('草稿已删除');
      currentDraftId = null;
      $('#draftEditArea').style.display = 'none';
      loadDrafts();
    } else {
      showResult(el, '删除失败: ' + (data.message || data.error), 'error');
    }
  });

  $('#refreshRevisionsBtn').addEventListener('click', loadRevisions);

  async function loadRevisions() {
    const { data: docs } = await api('/documents');
    const allRevs = [];
    for (const doc of (docs || [])) {
      const { data: revs } = await api('/documents/' + doc.id + '/revisions');
      (revs || []).forEach(r => allRevs.push({ ...r, docTitle: doc.title }));
    }

    const tbody = $('#revisionsTable tbody');
    tbody.innerHTML = '';
    allRevs.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const role = getRole();

    allRevs.forEach(rev => {
      const tr = document.createElement('tr');
      let actions = '';
      if (rev.status === 'submitted' && role === 'approver') {
        actions = `<button class="btn btn-sm btn-success" onclick="app.approve('${rev.id}')">审批发布</button>`;
      }
      if (rev.status === 'published' && role === 'approver') {
        actions = `<button class="btn btn-sm btn-danger" onclick="app.withdraw('${rev.id}')">撤回</button>`;
      }
      tr.innerHTML = `
        <td class="id-short" title="${rev.id}">${shortId(rev.id)}</td>
        <td>${rev.docTitle}</td>
        <td>${rev.oldVersionNumber} → ${rev.newVersionNumber}</td>
        <td>${rev.reason || '-'}</td>
        <td><span class="status-badge status-${rev.status}">${statusLabel(rev.status)}</span></td>
        <td>${rev.submittedBy || '-'}</td>
        <td>${actions}</td>`;
      tbody.appendChild(tr);
    });
  }

  function statusLabel(s) {
    return { submitted: '待审批', published: '已发布', withdrawn: '已撤回', draft: '草稿' }[s] || s;
  }

  window.app.approve = async function (revId) {
    const { ok, data } = await api('/revisions/' + revId + '/approve', {
      method: 'POST',
      body: JSON.stringify({ approver: getOperator() })
    });
    const el = $('#approvalResult');
    if (ok) {
      showResult(el, '审批发布成功！版本已生效', 'success');
      toast('发布成功');
      loadRevisions();
    } else {
      showResult(el, '审批失败: ' + (data.message || data.error), 'error');
      toast(data.message || '审批失败', 'error');
    }
  };

  window.app.withdraw = async function (revId) {
    const { ok, data } = await api('/revisions/' + revId + '/withdraw', {
      method: 'POST',
      body: JSON.stringify({ operator: getOperator() })
    });
    const el = $('#approvalResult');
    if (ok) {
      showResult(el, '撤回成功！已恢复上一版本为当前有效版本', 'success');
      toast('已撤回');
      loadRevisions();
    } else {
      showResult(el, '撤回失败: ' + (data.message || data.error), 'error');
    }
  };

  $('#showVersionsBtn').addEventListener('click', async () => {
    const docId = $('#diffDocSelect').value;
    if (!docId) return toast('请先选择文档', 'error');
    const { data: versions } = await api('/documents/' + docId + '/versions');
    const { data: doc } = await api('/documents/' + docId);

    const list = $('#versionList');
    list.innerHTML = '';

    const oldSel = $('#diffOldVer');
    const newSel = $('#diffNewVer');
    oldSel.innerHTML = '';
    newSel.innerHTML = '';

    (versions || []).forEach(v => {
      const isCurrent = doc && doc.document && v.id === doc.document.currentVersionId;
      const div = document.createElement('div');
      div.className = 'version-item' + (isCurrent ? ' current' : '');
      div.innerHTML = `
        <span>v${v.versionNumber} - ${fmtTime(v.createdAt)} ${isCurrent ? '(当前)' : ''}</span>
        <span class="id-short">${shortId(v.id)}</span>`;
      list.appendChild(div);

      oldSel.innerHTML += `<option value="${v.id}">v${v.versionNumber}</option>`;
      newSel.innerHTML += `<option value="${v.id}">v${v.versionNumber}</option>`;
    });

    if (versions && versions.length >= 2) {
      oldSel.value = versions[0].id;
      newSel.value = versions[versions.length - 1].id;
    }
  });

  $('#generateDiffBtn').addEventListener('click', async () => {
    const oldVerId = $('#diffOldVer').value;
    const newVerId = $('#diffNewVer').value;
    if (!oldVerId || !newVerId) return toast('请选择两个版本', 'error');

    const [{ data: oldVer }, { data: newVer }] = await Promise.all([
      api('/versions/' + oldVerId),
      api('/versions/' + newVerId)
    ]);

    if (!oldVer || !newVer) return toast('版本获取失败', 'error');

    const { data: diffData } = await api('/diff', {
      method: 'POST',
      body: JSON.stringify({ oldContent: oldVer.content, newContent: newVer.content })
    });

    diffData.oldVersionNumber = oldVer.versionNumber;
    diffData.newVersionNumber = newVer.versionNumber;
    renderDiff($('#diffResult'), diffData);
  });

  function renderDiff(container, diffData) {
    if (!diffData) { container.innerHTML = '<p>无差异</p>'; return; }

    let html = '';

    if (!diffData.hasChanges) {
      html = '<div class="diff-summary">两个版本内容完全相同，无差异</div>';
      container.innerHTML = html;
      return;
    }

    html += `<div class="diff-summary">差异摘要：+${diffData.summary.added} 行新增，-${diffData.summary.removed} 行删除，${diffData.summary.unchanged} 行未变</div>`;

    html += '<div class="diff-container">';
    if (diffData.oldVersionNumber) {
      html += `<div class="diff-header">对比: v${diffData.oldVersionNumber} → v${diffData.newVersionNumber}</div>`;
    }
    (diffData.hunks || []).forEach(hunk => {
      (hunk.lines || []).forEach(line => {
        const cls = line.type === 'removed' ? 'removed' : line.type === 'added' ? 'added' : 'context';
        const prefix = line.type === 'removed' ? '- ' : line.type === 'added' ? '+ ' : '  ';
        html += `<div class="diff-line ${cls}">${prefix}${escapeHtml(line.content)}</div>`;
      });
    });
    html += '</div>';

    container.innerHTML = html;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  $('#loadArchivesBtn').addEventListener('click', async () => {
    const docId = $('#archiveDocSelect').value;
    if (!docId) return toast('请先选择文档', 'error');
    const { data } = await api('/documents/' + docId + '/archives');
    const container = $('#archiveList');
    container.innerHTML = '';

    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color:#999">暂无归档记录</p>';
      return;
    }

    data.forEach(arc => {
      const div = document.createElement('div');
      div.className = 'archive-card';
      div.innerHTML = `
        <strong>归档版本: v${arc.versionNumber}</strong>
        <span class="meta"> | 归档时间: ${fmtTime(arc.archivedAt)}</span>
        <div class="meta">修订理由: ${arc.reason || '-'}</div>
        <div class="meta">版本ID: ${shortId(arc.versionId)}</div>`;
      container.appendChild(div);
    });
  });

  $('#exportLogBtn').addEventListener('click', loadFilteredLog);

  async function loadFilteredLog() {
    const docId = $('#logDocSelect').value;
    if (!docId) return toast('请先选择文档', 'error');

    const params = new URLSearchParams();
    const action = $('#logFilterAction').value;
    const operator = $('#logFilterOperator').value.trim();
    const status = $('#logFilterStatus').value;

    if (action) params.set('action', action);
    if (operator) params.set('operator', operator);
    if (status) params.set('status', status);

    const qs = params.toString();
    const url = '/documents/' + docId + '/revision-log' + (qs ? '?' + qs : '');
    const { data } = await api(url);
    const container = $('#logResult');
    container.innerHTML = '';

    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color:#999">无匹配的修订日志</p>';
      return;
    }

    data.forEach(log => {
      const div = document.createElement('div');
      div.className = 'log-entry action-' + log.action;
      const actionLabel = {
        import: '导入', submit: '提交修订', publish: '审批发布', withdraw: '撤回',
        draft_save: '保存草稿', draft_delete: '删除草稿',
        draft_snapshot_restore: '恢复草稿快照', draft_snapshot_restore_conflict: '快照恢复冲突拦截', draft_snapshot_delete: '删除草稿快照'
      }[log.action] || log.action;

      let detail = '';
      if (log.detail) {
        if (log.detail.from && log.detail.to) {
          detail = `版本: ${log.detail.from} → ${log.detail.to}`;
        }
        if (log.detail.versionNumber) {
          detail = `初始版本: ${log.detail.versionNumber}`;
        }
        if (log.detail.reason) {
          detail += ` | 理由: ${log.detail.reason}`;
        }
        if (log.detail.baselineVersion) {
          detail += ` | 基线: v${log.detail.baselineVersion}`;
        }
        if (log.detail.fromDraft) {
          detail += ' | 来源: 草稿';
        }
        if (log.detail.snapshotId) {
          detail += ` | 快照ID: ${log.detail.snapshotId.slice(0, 8)}...`;
        }
        if (log.detail.snapshotBaselineVersion) {
          detail += ` | 快照基线: v${log.detail.snapshotBaselineVersion}`;
        }
        if (log.detail.currentVersion) {
          detail += ` | 当前版本: v${log.detail.currentVersion}`;
        }
      }

      div.innerHTML = `
        <span class="log-action">[${actionLabel}]</span>
        <span class="log-time">${fmtTime(log.timestamp)}</span>
        <span>操作人: ${log.operator}</span>
        <div class="log-detail">${detail}</div>`;
      container.appendChild(div);
    });

    toast('已查询 ' + data.length + ' 条日志');
  }

  $('#exportCsvBtn').addEventListener('click', () => {
    const docId = $('#logDocSelect').value;
    if (!docId) return toast('请先选择文档', 'error');

    const params = new URLSearchParams();
    params.set('documentId', docId);
    const action = $('#logFilterAction').value;
    const operator = $('#logFilterOperator').value.trim();
    const status = $('#logFilterStatus').value;

    if (action) params.set('action', action);
    if (operator) params.set('operator', operator);
    if (status) params.set('status', status);

    const url = API + '/revision-log/export.csv?' + params.toString();
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revision-log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('CSV 文件已下载');
  });

  $('#checkConsistencyBtn').addEventListener('click', async () => {
    const { data } = await api('/consistency');
    const el = $('#consistencyResult');
    if (data.consistent) {
      showResult(el, '一致性校验通过：活动版本指针、历史归档和导出结果一致', 'success');
    } else {
      showResult(el, '一致性校验失败：\n' + data.issues.join('\n'), 'error');
    }
  });

  $('#exportDataBtn').addEventListener('click', () => {
    const url = API + '/export';
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('数据已导出为 JSON 文件');
  });

  $('#importDataFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const el = $('#importDataResult');
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const { ok, data } = await api('/import', {
        method: 'POST',
        body: JSON.stringify(imported)
      });
      if (ok && data.success) {
        showResult(el, '数据导入成功！已有数据未被覆盖，新增数据已合并。', 'success');
        toast('数据导入成功');
        loadDocuments();
        loadDrafts();
      } else {
        showResult(el, '导入失败: ' + (data.error || '未知错误'), 'error');
      }
    } catch (err) {
      showResult(el, '导入失败: 无法解析 JSON 文件 — ' + err.message, 'error');
    }
    e.target.value = '';
  });

  $('#refreshSnapshotsBtn').addEventListener('click', loadSnapshots);

  async function loadSnapshots() {
    if (!currentDraftId) return;
    const container = $('#snapshotList');
    container.innerHTML = '<p style="color:#999">加载中...</p>';
    $('#snapshotConflictWarning').style.display = 'none';

    const { data: snapshots } = await api('/drafts/' + currentDraftId + '/snapshots?operator=' + encodeURIComponent(getOperator()));
    if (!snapshots || snapshots.length === 0) {
      container.innerHTML = '<p style="color:#999">暂无快照，下次保存草稿时自动创建</p>';
      return;
    }

    container.innerHTML = '';
    snapshots.forEach(s => {
      const div = document.createElement('div');
      div.className = 'snapshot-card';
      const isOwner = !s._redacted;
      const preview = isOwner && s.content ? (s.content.length > 80 ? s.content.slice(0, 80) + '...' : s.content) : '（无权限查看）';
      const reason = isOwner ? escapeHtml(s.reason || '无') : '（无权限查看）';
      div.innerHTML = `
        <div class="snapshot-header">
          <span class="snapshot-time">${fmtTime(s.createdAt)}</span>
          <span class="draft-baseline">基线 v${s.baselineVersionNumber}</span>
          <span class="snapshot-actions">
            ${isOwner ? `<button class="btn btn-sm btn-secondary" data-action="view" data-id="${s.id}">查看</button>
            <button class="btn btn-sm btn-primary" data-action="restore" data-id="${s.id}">恢复</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${s.id}">删除</button>` : '<span style="color:#999;font-size:12px">非草稿创建人，仅可见摘要</span>'}
          </span>
        </div>
        <div class="snapshot-reason"><strong>理由：</strong>${reason}</div>
        <div class="snapshot-preview"><strong>内容预览：</strong>${escapeHtml(preview)}</div>
        ${isOwner ? `<div class="snapshot-detail" id="snapshot-detail-${s.id}" style="display:none;margin-top:8px">
          <div class="snapshot-full-content" style="white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:4px;max-height:200px;overflow:auto">${escapeHtml(s.content || '')}</div>
        </div>` : ''}`;
      container.appendChild(div);
    });

    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const snapshotId = btn.dataset.id;
        if (action === 'view') toggleSnapshotDetail(snapshotId);
        else if (action === 'restore') restoreSnapshot(snapshotId);
        else if (action === 'delete') deleteSnapshot(snapshotId);
      });
    });
  }

  function toggleSnapshotDetail(snapshotId) {
    const el = document.getElementById('snapshot-detail-' + snapshotId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  async function restoreSnapshot(snapshotId) {
    if (!confirm('确定恢复到此快照？当前草稿内容将先自动保存为快照。')) return;
    const { ok, status, data } = await api('/snapshots/' + snapshotId + '/restore', {
      method: 'POST',
      body: JSON.stringify({ operator: getOperator() })
    });
    const el = $('#draftResult');
    if (ok) {
      $('#draftReason').value = data.draft.reason || '';
      $('#draftContent').value = data.draft.content || '';
      showResult(el, '快照恢复成功，内容已加载', 'success');
      toast('快照已恢复');
      loadSnapshots();
    } else if (status === 409) {
      const warningEl = $('#snapshotConflictWarning');
      warningEl.innerHTML = '<strong>⚠ 快照恢复被拦截（基线版本冲突）</strong><br>' +
        (data.message || '快照基线与当前文档版本不一致') + '<br>' +
        '请基于最新版本重新创建草稿。';
      warningEl.style.display = 'block';
      showResult(el, '恢复被拦截: ' + (data.message || '基线版本冲突'), 'error');
    } else {
      showResult(el, '恢复失败: ' + (data.message || data.error), 'error');
    }
  }

  async function deleteSnapshot(snapshotId) {
    if (!confirm('确定删除此快照？此操作不可撤销。')) return;
    const { ok, data } = await api('/snapshots/' + snapshotId, {
      method: 'DELETE',
      body: JSON.stringify({ operator: getOperator() })
    });
    if (ok) {
      toast('快照已删除');
      loadSnapshots();
    } else {
      toast('删除失败: ' + (data.message || data.error), 'error');
    }
  }

  let currentAuditBatchId = null;
  let pendingAuditLogs = null;

  async function loadAuditDocSelect() {
    const { data } = await api('/documents');
    const s = $('#auditPlayDocSelect');
    if (!s) return;
    const cur = s.value;
    s.innerHTML = '<option value="">-- 请选择 --</option>';
    (data || []).forEach(doc => {
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = doc.title + ' (v' + doc.currentVersionNumber + ')';
      s.appendChild(opt);
    });
    if (cur) s.value = cur;
  }

  $('#auditImportFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#auditImportFileName').textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    pendingAuditLogs = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (Array.isArray(parsed)) {
          pendingAuditLogs = parsed;
        } else if (parsed && parsed.revisionLogs && Array.isArray(parsed.revisionLogs)) {
          pendingAuditLogs = parsed.revisionLogs;
        } else if (parsed && Array.isArray(parsed.logs)) {
          pendingAuditLogs = parsed.logs;
        } else {
          toast('文件格式不支持：无法识别日志数组', 'error');
        }
      } catch (err) {
        toast('文件解析失败: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  $('#auditImportBtn').addEventListener('click', async () => {
    const el = $('#auditImportResult');
    if (!pendingAuditLogs || pendingAuditLogs.length === 0) {
      return showResult(el, '请先选择有效的日志 JSON 文件', 'error');
    }
    const operator = getOperator();
    if (!operator || operator === '未知') {
      return showResult(el, '导入被拒绝：必须明确操作者身份（填写姓名）', 'error');
    }
    showResult(el, '导入中...', 'info');
    const { ok, status, data } = await api('/revision-log/import', {
      method: 'POST',
      body: JSON.stringify({
        logs: pendingAuditLogs,
        operator,
        source: $('#auditImportSource').value || 'frontend',
        notes: $('#auditImportNotes').value || ''
      })
    });
    currentAuditBatchId = data.batchId || null;
    if (ok) {
      if (status === 202) {
        showResult(el, '⚠ 部分导入：共 ' + data.totalCount + ' 条，成功 ' + data.insertedCount + ' 条，冲突 ' + data.conflictCount + ' 条（未覆盖现有日志）。请在下方选择冲突处理策略。', 'error');
        renderAuditConflicts(data.conflicts || []);
      } else {
        showResult(el, '✅ 日志导入成功！批次ID: ' + shortId(data.batchId) + '，共导入 ' + data.insertedCount + ' 条日志', 'success');
        $('#auditConflictArea').style.display = 'none';
      }
      toast('导入完成');
      refreshAuditBatches();
    } else {
      showResult(el, '导入失败: ' + (data.message || data.error), 'error');
      $('#auditConflictArea').style.display = 'none';
    }
  });

  function renderAuditConflicts(conflicts) {
    if (!conflicts || conflicts.length === 0) {
      $('#auditConflictArea').style.display = 'none';
      return;
    }
    const list = $('#auditConflictList');
    list.innerHTML = conflicts.map(c => `
      <div style="padding:6px 0;border-bottom:1px dashed #ffd43b">
        <div><strong>日志ID:</strong> ${shortId(c.logId)} | <strong>原因:</strong> ${c.reason}</div>
        ${c.existingLog ? `<div style="color:#888;font-size:12px">现有记录: ${c.existingLog.action} @ ${c.existingLog.timestamp} by ${c.existingLog.operator}</div>` : ''}
      </div>
    `).join('');
    $('#auditConflictArea').style.display = 'block';
  }

  $('#auditReimportBtn').addEventListener('click', async () => {
    if (!currentAuditBatchId) return toast('没有待处理的批次', 'error');
    const strategy = $('#auditConflictStrategy').value;
    const el = $('#auditReimportResult');
    if (getRole() !== 'approver') {
      return showResult(el, '冲突重导入被拒绝：仅审批员可执行此操作', 'error');
    }
    const { ok, data } = await api('/revision-log/imported/' + currentAuditBatchId + '/reimport', {
      method: 'POST',
      body: JSON.stringify({ strategy, operator: getOperator() })
    });
    if (ok) {
      showResult(el, '重导入完成: ' + (data.message || '') + '（策略: ' + strategy + '）', 'success');
      $('#auditConflictArea').style.display = 'none';
      toast('重导入完成');
    } else {
      showResult(el, '重导入失败: ' + (data.message || data.error), 'error');
    }
  });

  $('#auditPlaybackSource').addEventListener('change', () => {
    const v = $('#auditPlaybackSource').value;
    $('#auditBatchSelectWrap').style.display = v === 'batch' ? '' : 'none';
    $('#auditPlayDocWrap').style.display = v === 'doc' ? '' : 'none';
    $('#auditManualWrap').style.display = v === 'manual' ? '' : 'none';
  });

  $('#auditPlaybackBtn').addEventListener('click', async () => {
    const el = $('#auditPlaybackResult');
    const operator = getOperator();
    if (getRole() !== 'approver') {
      return showResult(el, '回放被拒绝：仅审批员可执行审计回放', 'error');
    }
    let logIds = [];
    const source = $('#auditPlaybackSource').value;
    if (source === 'batch') {
      const batchId = $('#auditBatchSelect').value;
      if (!batchId) return showResult(el, '请选择导入批次', 'error');
      const { data } = await api('/revision-log/imported/' + batchId + '/logs');
      logIds = (data || []).map(l => l.id);
    } else if (source === 'doc') {
      const docId = $('#auditPlayDocSelect').value;
      if (!docId) return showResult(el, '请选择文档', 'error');
      const { data } = await api('/documents/' + docId + '/revision-log');
      logIds = (data || []).map(l => l.id);
    } else {
      const raw = $('#auditManualIds').value.trim();
      if (!raw) return showResult(el, '请输入日志ID', 'error');
      logIds = raw.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (logIds.length === 0) return showResult(el, '没有可回放的日志', 'error');
    showResult(el, '回放执行中...', 'info');
    const { ok, data } = await api('/revision-log/playback', {
      method: 'POST',
      body: JSON.stringify({
        logIds,
        operator,
        notes: $('#auditPlayNotes').value || '',
        mode: 'audit'
      })
    });
    if (ok) {
      let summary = `✅ 回放完成！记录ID: ${shortId(data.recordId)}\n`;
      summary += `回放日志: ${data.logCount} 条，未找到: ${data.missingCount} 条\n`;
      if (data.summary && data.summary.actionBreakdown) {
        summary += '动作分布: ' + Object.entries(data.summary.actionBreakdown).map(([k, v]) => k + '×' + v).join(', ') + '\n';
      }
      if (data.summary && data.summary.operatorBreakdown) {
        summary += '操作人分布: ' + Object.entries(data.summary.operatorBreakdown).map(([k, v]) => k + '×' + v).join(', ') + '\n';
      }
      if (data.items && data.items.length > 0) {
        summary += '\n回放明细（前5条快照权限验证）:\n';
        data.items.slice(0, 5).forEach(item => {
          if (item.snapshotId) {
            summary += `  - 快照${shortId(item.snapshotId)}: 访问${item.snapshotAccessible ? '✅已授权' : '⛔已拦截（非草稿owner）'}\n`;
          }
        });
      }
      showResult(el, summary, 'success');
      refreshAuditPlaybacks();
    } else {
      showResult(el, '回放失败: ' + (data.message || data.error), 'error');
    }
  });

  $('#auditRefreshBatches').addEventListener('click', refreshAuditBatches);
  $('#auditRefreshPlaybacks').addEventListener('click', refreshAuditPlaybacks);

  async function refreshAuditBatches() {
    const { data } = await api('/revision-log/imported');
    const sel = $('#auditBatchSelect');
    if (sel) {
      sel.innerHTML = '<option value="">-- 选择导入批次 --</option>';
      (data || []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.importBatchId;
        opt.textContent = `${fmtTime(b.importedAt)} | by ${b.importedBy} | 成功${b.insertedCount} 冲突${b.conflictCount}`;
        sel.appendChild(opt);
      });
    }
    const listEl = $('#auditBatchesList');
    if (listEl) {
      if (!data || data.length === 0) {
        listEl.innerHTML = '<p style="color:#999">暂无导入批次</p>';
      } else {
        listEl.innerHTML = (data || []).map(b => `
          <div style="padding:10px;border:1px solid #eee;border-radius:6px;margin-bottom:8px">
            <div><strong>${fmtTime(b.importedAt)}</strong> by <strong>${escapeHtml(b.importedBy)}</strong></div>
            <div style="font-size:12px;color:#666;margin-top:4px">
              批次 ${shortId(b.importBatchId)} | 总计 ${b.totalCount} | ✅ ${b.insertedCount} | ⚠ ${b.conflictCount} | ❌ ${b.invalidCount}
              ${b.source ? ` | 来源: ${escapeHtml(b.source)}` : ''}
            </div>
            ${b.notes ? `<div style="font-size:12px;color:#888;margin-top:2px">备注: ${escapeHtml(b.notes)}</div>` : ''}
            ${b.insertedCount > 0 ? `<div style="font-size:11px;color:#2f9e44;margin-top:2px">此批次日志可用于审计回放核对</div>` : ''}
          </div>
        `).join('');
      }
    }
  }

  async function refreshAuditPlaybacks() {
    const { data } = await api('/revision-log/playback-records');
    const listEl = $('#auditPlaybacksList');
    if (!listEl) return;
    if (!data || data.length === 0) {
      listEl.innerHTML = '<p style="color:#999">暂无回放记录</p>';
      return;
    }
    listEl.innerHTML = (data || []).map(r => {
      const actions = r.summary && r.summary.actionBreakdown
        ? Object.entries(r.summary.actionBreakdown).map(([k, v]) => k + '×' + v).join(', ')
        : '-';
      const operators = r.summary && r.summary.operatorBreakdown
        ? Object.entries(r.summary.operatorBreakdown).map(([k, v]) => k + '×' + v).join(', ')
        : '-';
      return `
        <div style="padding:10px;border:1px solid #e7f5ff;border-radius:6px;margin-bottom:8px;background:#f8f9fa">
          <div><strong>${fmtTime(r.playbackAt)}</strong> by <strong>${escapeHtml(r.playbackBy)}</strong></div>
          <div style="font-size:12px;color:#666;margin-top:4px">
            记录 ${shortId(r.id)} | 回放 ${r.logCount} 条日志 | 缺失 ${r.missingCount} 条
          </div>
          <div style="font-size:12px;color:#495057;margin-top:2px">动作: ${escapeHtml(actions)}</div>
          <div style="font-size:12px;color:#495057">操作人: ${escapeHtml(operators)}</div>
          ${r.summary && r.summary.timeRange ? `<div style="font-size:11px;color:#888;margin-top:2px">时间范围: ${fmtTime(r.summary.timeRange.start)} ~ ${fmtTime(r.summary.timeRange.end)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  let pendingBatchLogs = null;
  let currentBatchId = null;

  $('#batchImportFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#batchImportFileName').textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    pendingBatchLogs = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (Array.isArray(parsed)) {
          pendingBatchLogs = parsed;
        } else if (parsed && parsed.revisionLogs && Array.isArray(parsed.revisionLogs)) {
          pendingBatchLogs = parsed.revisionLogs;
        } else if (parsed && Array.isArray(parsed.logs)) {
          pendingBatchLogs = parsed.logs;
        } else {
          toast('文件格式不支持', 'error');
        }
      } catch (err) {
        toast('文件解析失败: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  $('#batchImportBtn').addEventListener('click', async () => {
    const el = $('#batchImportResult');
    if (!pendingBatchLogs || pendingBatchLogs.length === 0) {
      return showResult(el, '请先选择有效的日志 JSON 文件', 'error');
    }
    const operator = getOperator();
    if (!operator || operator === '未知') {
      return showResult(el, '导入被拒绝：必须明确操作者身份', 'error');
    }
    if (getRole() !== 'approver') {
      return showResult(el, '导入被拒绝：仅审批员可执行批次导入', 'error');
    }
    showResult(el, '导入中...', 'info');
    const { ok, status, data } = await api('/batch-trace/import', {
      method: 'POST',
      body: JSON.stringify({
        logs: pendingBatchLogs,
        operator,
        source: $('#batchImportSource').value || 'frontend',
        notes: $('#batchImportNotes').value || '',
        conflictStrategy: $('#batchConflictStrategy').value || 'reject'
      })
    });
    currentBatchId = data.batchId || null;
    if (ok) {
      if (status === 202) {
        showResult(el, '⚠ 部分导入：共 ' + data.recordCount + ' 条，成功 ' + data.insertedCount + ' 条，冲突 ' + data.conflictCount + ' 条。请在下方选择冲突处理策略。', 'error');
        renderBatchConflicts(data.conflicts || []);
        currentBatchId = data.batchId;
      } else {
        showResult(el, '✅ 批次导入成功！批次ID: ' + shortId(data.batchId) + '，共导入 ' + data.insertedCount + ' 条日志\n指纹: ' + (data.contentFingerprint || '-'), 'success');
        $('#batchConflictArea').style.display = 'none';
      }
      toast('导入完成');
      refreshBatchList();
    } else if (status === 409) {
      showResult(el, '⛔ 重复导入被拦截：' + (data.message || '内容指纹与已有批次相同') + '\n请选择 skip 或 merge 策略后重新导入', 'error');
    } else if (status === 200 && data.skipped) {
      showResult(el, '⏭ 已按 skip 策略跳过重复导入：' + data.message, 'info');
    } else {
      showResult(el, '导入失败: ' + (data.message || data.error), 'error');
    }
  });

  function renderBatchConflicts(conflicts) {
    if (!conflicts || conflicts.length === 0) {
      $('#batchConflictArea').style.display = 'none';
      return;
    }
    const list = $('#batchConflictList');
    list.innerHTML = conflicts.map(c => `
      <div style="padding:6px 0;border-bottom:1px dashed #ffd43b">
        <div><strong>日志ID:</strong> ${shortId(c.logId)} | <strong>原因:</strong> ${c.reason}</div>
        ${c.existingLog ? `<div style="color:#888;font-size:12px">现有记录: ${c.existingLog.action} @ ${c.existingLog.timestamp} by ${c.existingLog.operator}</div>` : ''}
      </div>
    `).join('');
    $('#batchConflictArea').style.display = 'block';
  }

  $('#batchReimportBtn').addEventListener('click', async () => {
    if (!currentBatchId) return toast('没有待处理的批次', 'error');
    const strategy = $('#batchConflictReimportStrategy').value;
    const el = $('#batchReimportResult');
    if (getRole() !== 'approver') {
      return showResult(el, '冲突重导入被拒绝：仅审批员可执行此操作', 'error');
    }
    const { ok, data } = await api('/batch-trace/batches/' + currentBatchId + '/reimport', {
      method: 'POST',
      body: JSON.stringify({ strategy, operator: getOperator() })
    });
    if (ok) {
      showResult(el, '重导入完成: ' + (data.message || '') + '（策略: ' + strategy + '）', 'success');
      $('#batchConflictArea').style.display = 'none';
      toast('重导入完成');
    } else {
      showResult(el, '重导入失败: ' + (data.message || data.error), 'error');
    }
  });

  $('#batchRefreshBtn').addEventListener('click', refreshBatchList);

  async function refreshBatchList() {
    const importer = $('#batchFilterImporter').value.trim();
    const hasConflicts = $('#batchFilterConflicts').value;
    const params = new URLSearchParams();
    if (importer) params.set('importedBy', importer);
    if (hasConflicts) params.set('hasConflicts', hasConflicts);
    const qs = params.toString();
    const { data } = await api('/batch-trace/batches' + (qs ? '?' + qs : ''));
    const listEl = $('#batchList');
    if (!data || data.length === 0) {
      listEl.innerHTML = '<p style="color:#999">暂无导入批次</p>';
      return;
    }
    listEl.innerHTML = data.map(b => {
      const isRedacted = b._redacted;
      return `
        <div class="batch-card" style="padding:10px;border:1px solid #eee;border-radius:6px;margin-bottom:8px;cursor:pointer" data-batch-id="${b.batchId}">
          <div><strong>${fmtTime(b.importedAt)}</strong> by <strong>${escapeHtml(b.importedBy)}</strong></div>
          <div style="font-size:12px;color:#666;margin-top:4px">
            批次 ${shortId(b.batchId)} | 总计 ${b.recordCount} | ✅ ${b.insertedCount} | ⚠ ${b.conflictCount} | ❌ ${b.invalidCount || 0}
            ${b.sourceFile ? ' | 来源: ' + escapeHtml(b.sourceFile) : ''}
            ${isRedacted ? ' | <span style="color:#e03131">脱敏视图</span>' : ''}
          </div>
          ${!isRedacted && b.contentFingerprint ? `<div style="font-size:11px;color:#888;margin-top:2px">指纹: ${b.contentFingerprint}</div>` : ''}
          ${!isRedacted && b.sourceDigest ? `<div style="font-size:11px;color:#888">来源摘要: ${b.sourceDigest}</div>` : ''}
          ${!isRedacted && b.mergedFrom ? `<div style="font-size:11px;color:#2f9e44">合并自批次: ${shortId(b.mergedFrom)}</div>` : ''}
          ${!isRedacted && b._reimport ? `<div style="font-size:11px;color:#888;margin-top:2px">重导入: 策略=${b._reimport.strategy} by ${b._reimport.by}</div>` : ''}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.batch-card').forEach(card => {
      card.addEventListener('click', () => loadBatchDetail(card.dataset.batchId));
    });
  }

  async function loadBatchDetail(batchId) {
    currentBatchId = batchId;
    const operator = getOperator();
    const { data } = await api('/batch-trace/batches/' + batchId + '?viewer=' + encodeURIComponent(operator));
    if (!data || data.batchId !== batchId) {
      toast('批次不存在', 'error');
      return;
    }

    const section = $('#batchDetailSection');
    const content = $('#batchDetailContent');
    section.style.display = 'block';
    const isRedacted = data._redacted;

    let html = `
      <div class="batch-detail-card" style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
          <div><strong>批次ID:</strong> ${data.batchId}</div>
          <div><strong>导入人:</strong> ${escapeHtml(data.importedBy)}</div>
          <div><strong>导入时间:</strong> ${fmtTime(data.importedAt)}</div>
          <div><strong>来源:</strong> ${escapeHtml(data.sourceFile || '-')}</div>
          <div><strong>总计:</strong> ${data.recordCount}</div>
          <div><strong>成功:</strong> ${data.insertedCount}</div>
          <div><strong>冲突:</strong> ${data.conflictCount}</div>
          <div><strong>无效:</strong> ${data.invalidCount || 0}</div>
          ${!isRedacted ? `
          <div><strong>内容指纹:</strong> ${data.contentFingerprint || '-'}</div>
          <div><strong>来源摘要:</strong> ${data.sourceDigest || '-'}</div>
          <div><strong>冲突策略:</strong> ${data.conflictStrategy || '-'}</div>
          <div><strong>合并自:</strong> ${data.mergedFrom ? shortId(data.mergedFrom) : '无'}</div>
          ` : '<div style="color:#e03131">⚠ 您无权查看详细指纹和摘要信息（非批次 owner）</div>'}
        </div>
        ${data.notes ? `<div style="margin-top:8px;font-size:12px;color:#888">备注: ${escapeHtml(data.notes)}</div>` : ''}
      </div>
    `;

    if (!isRedacted && data.conflicts && data.conflicts.length > 0) {
      html += `<h4 style="margin-top:16px">冲突明细 (${data.conflicts.length})</h4>`;
      html += '<div style="max-height:200px;overflow:auto;font-size:12px">';
      data.conflicts.forEach(c => {
        html += `<div style="padding:4px 0;border-bottom:1px dashed #eee">${shortId(c.logId)}: ${c.reason} (${c.conflictType})</div>`;
      });
      html += '</div>';
    }

    if (!isRedacted && data.invalidLogs && data.invalidLogs.length > 0) {
      html += `<h4 style="margin-top:12px">失败明细 (${data.invalidLogs.length})</h4>`;
      html += '<div style="max-height:150px;overflow:auto;font-size:12px">';
      data.invalidLogs.forEach(l => {
        html += `<div style="padding:4px 0;border-bottom:1px dashed #eee">第 ${l.index} 条: ${l.reason}</div>`;
      });
      html += '</div>';
    }

    content.innerHTML = html;
    $('#batchDetailPlaybacks').innerHTML = '<p style="color:#999">点击"加载回放"查看</p>';
  }

  $('#batchDetailPlaybacksBtn').addEventListener('click', async () => {
    if (!currentBatchId) return toast('请先选择批次', 'error');
    const operator = getOperator();
    const { data } = await api('/batch-trace/batches/' + currentBatchId + '/playbacks?viewer=' + encodeURIComponent(operator));
    const listEl = $('#batchDetailPlaybacks');
    if (!data || data.length === 0) {
      listEl.innerHTML = '<p style="color:#999">此批次暂无关联回放记录</p>';
      return;
    }
    listEl.innerHTML = data.map(r => {
      const isRedacted = r._redacted;
      return `
        <div style="padding:8px;border:1px solid #e7f5ff;border-radius:4px;margin-bottom:6px;background:#f8f9fa;font-size:12px">
          <strong>${fmtTime(r.playbackAt)}</strong> by ${escapeHtml(r.playbackBy)} | ${r.logCount} 条日志
          ${isRedacted ? ' | <span style="color:#e03131">脱敏</span>' : ''}
        </div>
      `;
    }).join('');
  });

  $('#batchExportAuditBtn').addEventListener('click', async () => {
    if (!currentBatchId) return toast('请先选择批次', 'error');
    const operator = getOperator();
    const el = $('#batchExportResult');
    const { ok, status, data } = await api('/batch-trace/batches/' + currentBatchId + '/export-audit?viewer=' + encodeURIComponent(operator));
    if (ok) {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'batch-audit-' + currentBatchId.slice(0, 8) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showResult(el, '✅ 审计摘要已导出', 'success');
      toast('审计摘要已下载');
    } else if (status === 403) {
      showResult(el, '⛔ 导出被拒绝：' + (data.message || '仅批次 owner 或审批员可导出'), 'error');
    } else {
      showResult(el, '导出失败: ' + (data.message || data.error), 'error');
    }
  });

  $('#batchFilterImporter').addEventListener('input', () => { refreshBatchList(); });
  $('#batchFilterConflicts').addEventListener('change', () => { refreshBatchList(); });

  loadDocuments();
})();
