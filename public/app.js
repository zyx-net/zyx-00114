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
      if (['revision', 'diff', 'approval', 'archives', 'log'].includes(tab.dataset.tab)) {
        loadDocSelects();
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
      '#revisionDocSelect', '#diffDocSelect', '#archiveDocSelect', '#logDocSelect'
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

    allRevs.forEach(rev => {
      const tr = document.createElement('tr');
      let actions = '';
      if (rev.status === 'submitted') {
        actions = `<button class="btn btn-sm btn-success" onclick="app.approve('${rev.id}')">审批发布</button>`;
      }
      if (rev.status === 'published') {
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
    return { submitted: '待审批', published: '已发布', withdrawn: '已撤回' }[s] || s;
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

  $('#exportLogBtn').addEventListener('click', async () => {
    const docId = $('#logDocSelect').value;
    if (!docId) return toast('请先选择文档', 'error');
    const { data } = await api('/documents/' + docId + '/revision-log');
    const container = $('#logResult');
    container.innerHTML = '';

    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color:#999">暂无修订日志</p>';
      return;
    }

    data.forEach(log => {
      const div = document.createElement('div');
      div.className = 'log-entry action-' + log.action;
      const actionLabel = {
        import: '导入', submit: '提交修订', publish: '审批发布', withdraw: '撤回'
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
      }

      div.innerHTML = `
        <span class="log-action">[${actionLabel}]</span>
        <span class="log-time">${fmtTime(log.timestamp)}</span>
        <span>操作人: ${log.operator}</span>
        <div class="log-detail">${detail}</div>`;
      container.appendChild(div);
    });

    toast('修订日志已导出');
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

  loadDocuments();
})();
