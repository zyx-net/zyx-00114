# 制度文档修订对比与发布台

本地多文件项目，覆盖：文档导入 → 版本对比 → 草稿箱 → 修订申请 → 基线冲突检测 → 审批发布 → 撤回 → 归档 → 修订日志筛选导出（CSV）。

---

## 1. 环境准备

要求 Node.js 18+。

```bash
# 进入项目根目录
cd zyx-00114

# 安装依赖（express + uuid）
npm install
```

依赖安装完成后，目录应包含 `node_modules/` 和 `package-lock.json`。

---

## 2. 启动服务

```bash
# 默认端口 3200
npm start
```

看到如下输出即为启动成功：

```
制度文档修订对比与发布台已启动: http://localhost:3200
```

浏览器打开 http://localhost:3200 即可使用。

---

## 3. 样例文档从哪里拿

仓库内自带一份样例，位于 `samples/sample-doc.txt`，内容为《信息安全管理制度》。

如果需要自制样例，满足任一即可：
- 纯文本 `.txt` 文件，UTF-8 编码，多行内容
- 把内容直接粘贴进前端"文档内容"文本框

---

## 4. 跑通一次主流程（导入 → 修订 → 发布 → 导出日志）

### 4.1 导入样例文档

1. 打开 http://localhost:3200
2. 顶部角色栏保持 **编辑员 / 张编辑**（默认）
3. 进入"**文档导入**"标签
4. 点击"**加载样例文档**"按钮（标题和内容会自动从前端内置样例填充，与仓库 `samples/sample-doc.txt` 内容一致）
5. 点击"**导入文档**"
6. 下方绿色提示出现，记下文档 ID

或使用命令行直接导入 `samples/sample-doc.txt`：

```bash
node scripts/import-sample.js
```

### 4.2 提交修订

1. 切换到"**修订提交**"标签
2. "选择文档"下拉里选刚导入的文档
3. "修订理由"必填，例如写：`扩展适用范围至外部合作人员`
4. 点击"**加载当前版本内容**"把旧内容载入编辑框
5. 修改正文（例如在第二条里加上"及外部合作人员"）
6. 可点"**预览差异**"查看高亮对比
7. 点"**提交修订**"直接提交，或点"**保存草稿**"先存为草稿稍后继续编辑

失败情况（系统会自动拦截）：
- 修订理由为空 → 提示 `修订理由不能为空，无法提交`
- 内容完全没改却提交 → 提示 `内容完全相同，属于无效变更`

#### 草稿快照（自动记录 + 一键回退）

保存草稿后，进入"**草稿箱**"标签，打开草稿进行编辑时，页面下方会出现"**快照历史**"区域：

- 每次点击"**保存修改**"，系统会自动把修改前的内容存为一条快照，最多保留最近 10 条；
- 每条快照显示保存时间、基线版本、理由、内容预览；
- 点"查看"可展开完整快照内容；
- 点"恢复"可将草稿回退到该快照——恢复前当前内容会再自动存一份快照，防止误操作；
- 点"删除"可移除单条快照；
- 如果别人已经把文档发布到新版本，恢复旧快照时会被系统拦截（基线冲突），不会覆盖新版本。

### 4.3 审批发布

1. 右上角切换角色为 **审批员 / 李审批**（点"切换"按钮）
2. 进入"**审批发布**"标签
3. 点"**刷新**"，列表里会出现刚才提交的修订，状态为"待审批"
4. 只有审批员角色才能看到"审批发布"和"撤回"按钮
5. 点该行"**审批发布**"按钮
6. 发布成功后，文档当前版本自动递增（例如 1.0 → 1.1）

失败情况（系统会自动拦截）：
- 编辑员角色看不到审批和撤回按钮，直接调用 API 也会被拒绝
- 提交人（张编辑）用自己的身份审批 → 提示 `提交人与批准人不能是同一权限角色`
- 已发布的修订重复点发布 → 提示 `同一修订重复发布不会多写历史`

### 4.4 导出修订日志

1. 进入"**修订日志**"标签
2. 下拉选中文档
3. 可使用筛选条件：按操作人、按动作类型（导入/提交/发布/撤回/保存草稿/删除草稿）、按状态（已提交/已发布/已撤回/草稿）
4. 点"**查询日志**"查看筛选结果
5. 点"**导出 CSV**"下载筛选后的 CSV 文件（中文兼容，可直接用 Excel 打开）

命令行导出（JSON）：

```bash
node scripts/export-log.js <文档ID>
```

导出的 JSON 会打印到 stdout，可管道重定向到文件。

---

## 5. 撤回已发布版本

1. "审批发布"标签下，已发布的修订行有"**撤回**"按钮
2. 撤回后：
   - 文档当前版本指针自动恢复为上一版
   - 被撤回的版本仍保留在版本列表和归档中
   - 修订日志新增一条"撤回"记录

撤回后不可对同一修订再次撤回。

---

## 6. 关键特性说明

- **已发布版本不会被原地覆盖**：每次发布创建新的版本对象（UUID），旧版本对象永远保留，只移动 `currentVersionId` 指针。
- **修订理由留档**：每条修订的 `reason` 字段会保存在修订记录和归档记录中，导出日志可查。
- **提交人与批准人角色分离**：`revision.submittedBy === approver` 时直接拒绝。
- **重复发布幂等**：同一修订二次发布不会新增日志、不会重复写归档。
- **重启一致性**：数据持久化在 `data/db.json`，使用先写 `.tmp` 再 rename 的原子写入。重启后通过 `GET /api/consistency` 可校验版本指针、归档、日志三者一致。

### 6.1 草稿箱与多人接力

- **草稿持久化**：提交修订前可先存为草稿，数据写入 `data/db.json`，服务重启后可继续打开同一份草稿。
- **每人每文档一份草稿**：同一用户对同一文档只有一份活跃草稿，再次保存自动更新，避免草稿泛滥。
- **草稿动作留痕**：保存草稿、删除草稿都会写入修订日志，可追溯。

### 6.2 草稿快照历史与恢复

- **自动快照**：每次更新草稿时，系统自动将更新前的内容保存为快照，记录内容、理由、时间和基线版本。
- **保留最近 N 次**：每个草稿最多保留最近 10 个快照，超出自动清理最旧的，避免数据无限增长。
- **一键恢复**：草稿 owner 可以从快照列表中选择任意一条快照恢复，恢复前当前内容会自动再存一份快照，防止误操作。
- **恢复冲突拦截**：如果恢复的快照基线版本与文档当前正式版本不一致（别人已经发布了新版本），恢复会被 `BASELINE_CONFLICT` 拦截，**不会悄悄覆盖新版本**，确保多人协作安全。
- **权限严格**：只有草稿 owner 能查看快照内容/理由/创建人、恢复、删除自己的快照；非 owner 只能看到快照条目（时间、基线版本），内容被脱敏（`_redacted: true`），审批人不能操作别人的快照（和草稿权限一致，不放松）。
- **持久化**：快照和草稿一起存放在 `data/db.json`，服务重启后快照仍然存在，可继续恢复。
- **全链路留痕**：快照保存、恢复、冲突拦截、删除都会写入修订日志，支持按状态（draft）筛选，并可随 CSV 一起导出。
- **导出再导入**：通过「修订日志」标签页底部的"导出全部数据 (JSON)"和"导入数据 (JSON)"按钮，可将完整数据导出为 JSON 文件，在另一个环境导入恢复。导入按 ID 去重，已有数据不会被覆盖，不同操作人的草稿和快照不会串线。

### 6.3 基线版本冲突拦截

- **冲突检测**：草稿保存时记录基线版本 ID，提交前会校验文档当前版本是否与基线一致。
- **明确提示**：如果他人已发布新版本，旧草稿再次提交时会返回 `BASELINE_CONFLICT` 错误，明确告知基线版本与当前版本的差异，**不会悄悄覆盖**。
- **冲突查询接口**：可随时通过 `GET /api/drafts/:draftId/conflict` 查询草稿是否存在基线冲突。

### 6.4 权限边界

- **编辑员角色**：可提交修订、管理自己的草稿；**不能审批发布、不能撤回**。
- **审批员角色**：可审批发布、可撤回；**不能修改/删除他人的草稿**。
- **自审自测禁止**：即便是审批员，也不能审批自己提交的修订。
- **批次追溯权限**：非批次 owner 只能看到脱敏的批次元数据（导入人、时间、数量统计），指纹、来源摘要、冲突明细等敏感信息被脱敏（`_redacted: true`）；审批员可查看全部详情并导出审计摘要。非 owner 不能导出批次级审计摘要。具体权限函数：
  - `canViewBatchDetail(batchImportedBy, viewer)`：判断 viewer 是否可查看批次完整详情，返回 true 当 viewer 是批次导入人或审批员；
  - `canExportBatchAudit(batchImportedBy, viewer)`：判断 viewer 是否可导出批次审计摘要，返回 true 当 viewer 是批次导入人或审批员。

### 6.5 修订日志筛选与 CSV 导出

- **多维度筛选**：支持按文档、操作类型（import/submit/publish/withdraw/draft_save/draft_delete/draft_snapshot_restore/draft_snapshot_restore_conflict/draft_snapshot_delete）、操作人、状态筛选日志。
- **CSV 导出**：筛选结果可导出为 CSV 文件，中文兼容（带 BOM），可直接用 Excel 打开；CSV 额外包含「快照ID」列。
- **动作全覆盖**：导出的记录里包含草稿保存、提交、发布、撤回、快照恢复、快照冲突拦截、快照删除等所有动作。

### 6.6 快照审计回放（导出 → 导入核对 → 只读回放）

新增专门的「**审计回放**」标签页，解决「修订日志能导出却没法在仓库里重新导入核对」的问题。

**6.6.1 修订日志独立导入（非全量数据导入）**

- 入口：「审计回放」标签 → 选择之前导出的修订日志 JSON 文件（可以是数组，也可以是含 `revisionLogs`/`logs` 字段的对象）。
- **操作者身份必填**：导入时必须明确操作人（审批员身份），未带操作者身份直接返回 `OPERATOR_REQUIRED`，陌生人返回 `PERMISSION_DENIED`。
- **导入批次记录**：每次导入产生独立的批次 ID，记录导入人、导入时间、成功/冲突/无效数量、冲突详情。
- **导入日志带追溯标记**：通过独立接口导入的日志会打上 `_importBatchId` 和 `_imported: true` 标记，可按批次查询来源，不会和仓库原生日志混淆。
- **API 区分**：专门用 `POST /api/revision-log/import` 接口，与「修订日志」页的全量数据导入 `POST /api/import` 区分开。

**6.6.2 冲突处理（不静默覆盖、不串线）**

重复导入同一批日志时，系统会自动检测冲突，返回 `202 Accepted`，明确列出每条冲突：
- **DUPLICATE_ID**：日志 ID 已存在；
- **DUPLICATE_SIGNATURE**：ID 不同，但「文档+动作+操作人+时间戳」四要素完全相同（签名冲突）。

冲突不会被静默覆盖或串线，需要审批员选择策略手动二次处理：
| 策略 | 说明 |
|---|---|
| `skip` | 跳过所有冲突，保持仓库现有日志不变（默认） |
| `overwrite` | 用导入的日志**覆盖**仓库中冲突的条目 |
| `force_new_id` | 为冲突日志重新生成 UUID，强制作为新条目插入（保留原有 + 新增两条） |

**6.6.3 审计回放（只读、按时间顺序、区分操作者）**

- **权限门槛**：只有审批员可执行回放；编辑员/陌生人调用 API 会被 `403 PERMISSION_DENIED` 拒绝。
- **三种来源**：
  1. 从某个导入批次批量回放（核对导入结果）；
  2. 对某文档的全部日志进行回放审计；
  3. 手动输入日志 ID 列表（逗号分隔）精确回放。
- **回放内容**：按时间顺序列出日志条目，展示动作、操作人、文档、修订ID/草稿ID/快照ID、动作详情等；回放产生独立的**回放记录**，不同操作者的回放记录用独立 ID + `playbackBy` 字段明确区分，不会串线。
- **快照权限集成**：回放中若遇到快照相关日志，会同步检查快照对**回放操作者**的可见性并标记 `snapshotAccessible`：
  - 草稿 owner → `true`，可看正文/理由/创建人；
  - 非 owner 编辑员 → `false`，仅可看摘要；
  - 审批员（canViewAllDrafts）→ `true`，可看完整详情。
- **回放记录持久化**：回放记录存放在 `data/db.json` 的 `playbackRecords` 字段，服务重启后仍可查询；回放记录查看同样有权限（回放创建人 + 审批员可看明细，其他人看摘要）。

**6.6.4 快照读取权限边界（硬边界）**

快照详情的访问权限从「软边界」升级为「硬边界」：
- 未传 `operator`（匿名）→ **正文/理由/创建人全部脱敏**，仅返回 `id/draftId/documentId/baselineVersionNumber/createdAt + _redacted: true`；
- 传了 `operator` 但**不是草稿 owner**（也不是审批员）→ 同样脱敏；
- 审批员角色 `canViewAllDrafts=true` → 可跨用户看所有快照详情，用于审计核对；
- 快照恢复/删除仍然只允许 owner 操作（审批员也不能动别人的快照），权限与草稿修改一致。

### 6.7 服务重启后一致

导入批次信息、回放记录、快照可见性判断、批次追溯数据均持久化到 `data/db.json`：
- `importedLogs[]`：所有导入批次，含导入人、数量统计、冲突列表、重导入策略记录；
- `playbackRecords[]`：所有回放审计记录，含回放人、摘要明细、快照权限标记；
- `importBatches[]`：批次追溯中心的所有批次实体，含指纹、来源摘要、冲突和失败明细、合并来源、重导入记录；
- 使用原子写入（`.tmp` → rename），断电/重启不会损坏数据；
- 重启后重新读取上述字段，导入结果、回放链、快照权限判断结果、批次追溯映射完全一致。

命令行也支持审计回放相关操作：

```bash
# 查看所有导入批次
node scripts/import-log.js --list

# 导入日志文件（仅审批员可操作）
node scripts/import-log.js logs.json 李审批 --source "备份恢复"

# 导入并处理冲突（overwrite/force_new_id）
node scripts/import-log.js logs.json 李审批 --strategy overwrite

# 按批次执行审计回放（仅审批员）
node scripts/import-log.js --playback <batchId> 李审批
```

### 6.8 导入批次追溯中心

新增「**批次追溯**」标签页，把日志导入、回放记录、快照审计和权限说明串成一条可独立验收的链路。

### 6.9 回放授权保险箱（独立验收链路）

新增「**回放授权保险箱**」模块，把批次回放、日志索引、备注查看和审计导出串成一条能独立验收的链路。

**核心设计原则**：
- **批次归属**：每个保险箱批次有明确的 `ownerId`，只有 owner 和审批员能访问完整内容
- **权限硬边界**：非 owner 不管请求里带什么 viewer、筛选参数或旧缓存命中，都只能拿到脱敏后的摘要、状态和最小批次元数据
- **防止数据泄露**：非 owner 不能通过查询组合把明细漏出来（如批量查询日志 ID、拼接回放记录等）
- **持久化**：批次归属、权限判断、脱敏规则和冲突日志全部落到持久层，服务重启后结果完全一致

**6.9.1 保险箱批次实体**

每个导入批次可升级为保险箱批次，落库以下信息：
- `vaultBatchId`：保险箱批次 UUID
- `sourceBatchId`：关联的导入批次 ID
- `ownerId`：所有者（创建人）
- `status`：状态（active/archived）
- `notes`：备注（仅 owner 可编辑）
- `customRedactionRules`：自定义脱敏规则
- `accessCount` / `playbackCount` / `exportCount`：访问统计
- `lastAccessedAt` / `lastPlaybackAt` / `lastExportAt`：最后操作时间

**6.9.2 权限控制矩阵**

| 操作 | owner | 审批员 | 非 owner 编辑员 | 匿名/陌生人 |
|---|---|---|---|---|
| 创建保险箱批次 | ❌ | ✅（创建后成为 owner） | ❌ | ❌ |
| 查看批次详情 | ✅（完整） | ✅（完整） | ⚠（脱敏摘要） | ⚠（脱敏摘要） |
| 查看批次日志 | ✅（完整） | ✅（完整） | ⚠（脱敏摘要） | ⚠（脱敏摘要） |
| 查看回放记录 | ✅（完整） | ✅（完整） | ⚠（脱敏摘要） | ⚠（脱敏摘要） |
| 执行回放 | ✅ | ✅ | ❌ | ❌ |
| 查看备注 | ✅ | ✅ | ⚠（null） | ⚠（null） |
| 编辑备注 | ✅ | ❌ | ❌ | ❌ |
| 查看操作轨迹 | ✅ | ✅ | ❌ | ❌ |
| 导出审计包 | ✅ | ✅ | ❌ | ❌ |
| 导入审计包 | ❌ | ✅ | ❌ | ❌ |

**脱敏规则**（`_redacted: true` + `_redactionLevel`）：
- **摘要级（summary）**：保留 `batchId/vaultBatchId/importedAt/importedBy/ownerId/recordCount/insertedCount/conflictCount/invalidCount/status/sourceFile/conflictStrategy/playbackCount` 等元数据；`summary` 仅保留 `actionBreakdown` 键名和计数、`timeRange`；移除 `detail/content/reason/notes/conflicts/invalidLogs/items/logIds` 等敏感字段
- **完全级（full）**：仅保留 ID 和状态，所有其他字段移除
- 脱敏函数：`applyRedaction(obj, level)` 统一处理所有字段和嵌套对象，确保非 owner 不能通过任何接口拿到明细

**6.9.2.1 权限函数说明（`lib/auth.js`）**

| 函数 | 说明 |
|---|---|
| `canCreateVaultBatch(operator)` | 是否可创建保险箱批次（仅审批员） |
| `canViewVaultDetail(vaultOwnerId, viewer)` | 是否可查看批次完整详情（owner 或审批员） |
| `canExportVaultAudit(vaultOwnerId, viewer)` | 是否可导出审计包（owner 或审批员） |
| `canImportVaultPackage(operator)` | 是否可导入审计包（仅审批员） |
| `canViewVaultAccessTrail(vaultOwnerId, viewer)` | 是否可查看操作轨迹（owner 或审批员） |
| `canUpdateVaultNotes(vaultOwnerId, viewer)` | 是否可更新备注（仅 owner） |
| `canPlaybackVaultBatch(vaultOwnerId, viewer)` | 是否可执行回放（owner 或审批员） |

**6.9.3 操作轨迹审计**

每次访问都会记录到 `vaultAccessLogs[]`：
- `action`：view / view_logs / view_playbacks / playback / view_notes / update_notes / export / create
- `granted`：是否授权
- `viewer`：查看人
- `accessedAt`：访问时间
- `details`：附加信息（如回放记录 ID、导出指纹等）

owner 和审批员可通过 `/trail` 接口查看完整操作轨迹。

**6.9.4 审计包导出与导入**

**导出**（`GET /api/vault/batches/:id/export`）：
- 导出内容：保险箱批次信息 + 源批次信息 + 所有日志 + 所有回放记录 + 操作轨迹 + 脱敏规则
- 指纹验证：导出时计算整个包的 SHA256 指纹，防止篡改
- 文件名：`vault-audit-{vaultBatchId[:8]}-{timestamp}.json`

**导入**（`POST /api/vault/import`）：
- 指纹校验：导入时重新计算指纹，与包内指纹比对，不一致则拒绝（`PACKAGE_TAMPERED`）
- 重复检测：按指纹检测是否已导入过
  - `reject`（默认）：返回 `409 CONFLICT`，冲突类型为 `PACKAGE_DUPLICATE`，明确提示冲突，不静默覆盖
  - `skip`：静默跳过，返回 `skipped: true`
  - `force`：强制导入，记录 `force: true`，使用新的 `vaultBatchId`
- 冲突日志：所有冲突记录到 `conflicts[]`，包含冲突类型（`PACKAGE_DUPLICATE` / `VAULT_BATCH_DUPLICATE` / `SOURCE_BATCH_EXISTS`）、现有记录信息、处理方式
- 处理日志：导入结果记录到 `vaultImportPackages[]`，永久保留，可追溯

**6.9.5 防止数据泄露的防护措施**

1. **viewer 参数强制校验**：所有接口都检查 `viewer`/`operator` 参数，未传则按匿名处理（全部脱敏）
2. **批量查询拦截**：非 owner 查询时，无论用什么筛选参数，都只返回脱敏结果
3. **缓存穿透防护**：每次请求都实时做权限判断，不依赖可能泄露的缓存
4. **ID 枚举防护**：非 owner 即使猜对 `vaultBatchId`，也只能拿到脱敏摘要，拿不到明细
5. **日志拼接防护**：非 owner 不能通过多次查询不同接口拼接出完整信息（所有接口返回的脱敏级别一致）

**6.9.6 命令行支持**

```bash
# 创建保险箱批次（仅审批员）
node scripts/import-log.js --vault-create <sourceBatchId> 李审批 --notes "审计专用"

# 查看保险箱批次列表
node scripts/import-log.js --vault-list

# 查看保险箱批次详情（根据权限返回完整或脱敏）
node scripts/import-log.js --vault-detail <vaultBatchId> 李审批
node scripts/import-log.js --vault-detail <vaultBatchId> 张编辑  # 脱敏

# 查看保险箱批次日志
node scripts/import-log.js --vault-logs <vaultBatchId> 李审批
node scripts/import-log.js --vault-logs <vaultBatchId> 张编辑  # 脱敏

# 执行保险箱批次回放
node scripts/import-log.js --vault-playback <vaultBatchId> 李审批 --notes "季度审计回放"

# 查看和编辑备注
node scripts/import-log.js --vault-notes <vaultBatchId> 李审批
node scripts/import-log.js --vault-update-notes <vaultBatchId> 李审批 "2026Q2 审计完成，无异常"

# 查看操作轨迹
node scripts/import-log.js --vault-trail <vaultBatchId> 李审批

# 导出审计包
node scripts/import-log.js --vault-export <vaultBatchId> 李审批 > audit-package.json

# 导入审计包
node scripts/import-log.js --vault-import audit-package.json 李审批
node scripts/import-log.js --vault-import audit-package.json 李审批 --strategy skip
node scripts/import-log.js --vault-import audit-package.json 李审批 --strategy force

# 查看审计包导入/导出记录
node scripts/import-log.js --vault-import-list
```

**6.9.7 重启一致性保证**

- `vaultBatches[]`：所有保险箱批次
- `vaultAccessLogs[]`：所有访问日志
- `vaultRedactionRules[]`：脱敏规则
- `vaultImportPackages[]`：所有审计包导入导出记录
- 全部持久化到 `data/db.json`，使用原子写入（`.tmp` → rename）
- 重启后重新读取，权限判断结果、脱敏结果、冲突日志完全一致

**6.8.1 批次实体（每次导入都落库）**

- **创建批次**：`POST /api/batch-trace/import`，每次导入生成独立批次实体，落库以下信息：
  - `batchId`：批次 UUID
  - `importedBy`：导入人
  - `importedAt`：导入时间
  - `sourceDigest`：来源文件摘要（基于日志 id+action+operator+timestamp 的 SHA256 前16位）
  - `contentFingerprint`：内容指纹（整个日志数组的 SHA256 前16位）
  - `sourceFile`：来源说明
  - `recordCount` / `insertedCount` / `conflictCount` / `invalidCount`：记录数量统计
  - `conflicts[]`：冲突处理结果（含冲突类型和现有记录信息）
  - `invalidLogs[]`：失败明细
  - `conflictStrategy`：重复导入冲突策略
  - `mergedFrom`：合并来源批次ID（merge 策略时）

- **日志挂批次**：通过批次追溯导入的日志都带 `_importBatchId` 标记，后续每条回放都能精确挂到对应批次。

**6.8.2 重复导入冲突检测（拒绝/跳过/合并）**

再导入同一批内容时，系统按 `sourceDigest` 和 `contentFingerprint` 双重匹配：
| 策略 | 说明 |
|---|---|
| `reject` | 拒绝重复导入，返回 `409 DUPLICATE_IMPORT`，告知已有批次ID和导入人（默认） |
| `skip` | 静默跳过重复内容，返回 `200 skipped: true` |
| `merge` | 为冲突日志重新生成 UUID 作为新条目插入（保留原有 + 新增），批次记录 `mergedFrom` |

**不会静默覆盖，也不会把记录串到别人的快照下面。**

**6.8.3 批次列表、详情和筛选**

- **批次列表**：`GET /api/batch-trace/batches`，支持 `?importedBy=xx&since=xx&hasConflicts=true` 筛选；
- **批次详情**：`GET /api/batch-trace/batches/:batchId?viewer=xx`，非 owner 看到脱敏版本（`_redacted: true`），审批员看完整详情；
- **按批次查日志**：`GET /api/batch-trace/batches/:batchId/logs`；
- **按批次筛选回放**：`GET /api/batch-trace/batches/:batchId/playbacks?viewer=xx`，查出哪些回放记录用到了该批次的日志。

**6.8.4 导出批次级审计摘要**

- `GET /api/batch-trace/batches/:batchId/export-audit?viewer=xx`
- 导出包含：批次元数据、指纹、冲突明细、失败明细、关联回放记录列表、动作/操作人分布、导出人/导出时间；
- 仅批次 owner 或审批员可导出，非 owner 返回 `403 PERMISSION_DENIED`。

**6.8.5 冲突重导入**

- `POST /api/batch-trace/batches/:batchId/reimport`，支持 `skip/overwrite/force_new_id` 三种策略（与审计回放的重导入一致）。

**6.8.6 回放关联批次**

- `POST /api/batch-trace/link-playback`，手动将一条回放记录关联到某个批次；
- 回放执行时若日志来自某个批次，系统自动通过 `_importBatchId` 建立映射，无需手动关联。

**6.8.7 重复导入检测**

- `GET /api/batch-trace/duplicate-check?sourceDigest=xx&contentFingerprint=xx`，导入前先检查是否重复。

**6.8.8 命令行支持**

```bash
# 查看所有批次追溯记录
node scripts/import-log.js --batch-list

# 查看批次详情
node scripts/import-log.js --batch-detail <batchId>

# 导出批次审计摘要
node scripts/import-log.js --export-audit <batchId> 李审批

# 检查文件是否与已有批次重复
node scripts/import-log.js --duplicate-check logs.json
```

---

## 7. API 速览（含草稿快照）

```
# 草稿箱
GET    /api/drafts                    # 查询草稿列表（?documentId=xx 或 ?operator=xx 过滤）
POST   /api/drafts                    # 新建草稿（首次保存）
GET    /api/drafts/:draftId           # 读取单条草稿
PUT    /api/drafts/:draftId           # 更新草稿（自动产生快照）
DELETE /api/drafts/:draftId           # 删除草稿（级联删除所有快照）
GET    /api/drafts/:draftId/conflict  # 查询草稿基线冲突

# 草稿快照
GET    /api/drafts/:draftId/snapshots    # 查询草稿的快照列表（按时间倒序，最多 10 条，?operator=xx 控制脱敏）
GET    /api/snapshots/:snapshotId        # 读取单条快照（?operator=xx 控制脱敏）
POST   /api/snapshots/:snapshotId/restore# 恢复快照到草稿（403=权限不足，409=基线冲突，422=草稿已提交）
DELETE /api/snapshots/:snapshotId        # 删除单条快照（仅 owner 可操作）

# 数据导入导出
GET    /api/export                       # 导出全部数据（documents/versions/revisions/drafts/draftSnapshots/logs/archives/importedLogs/playbackRecords）
POST   /api/import                       # 导入数据（按 ID 去重，已有数据不覆盖）

# 修订日志独立导入 + 审计回放
POST   /api/revision-log/import                 # 独立导入修订日志（仅审批员，需操作人）
GET    /api/revision-log/imported               # 查询所有导入批次（?importer=xx&since=xx）
GET    /api/revision-log/imported/:batchId      # 查询单批次详情
GET    /api/revision-log/imported/:batchId/logs # 查询该批次实际导入的日志
POST   /api/revision-log/imported/:batchId/reimport # 冲突重导入（仅审批员，strategy=skip/overwrite/force_new_id）
POST   /api/revision-log/playback               # 审计回放（仅审批员，logIds+operator+notes）
GET    /api/revision-log/playback-records       # 查询回放记录（?playbackBy=xx&since=xx）
GET    /api/revision-log/playback-records/:recordId  # 单条回放记录（?viewer=xx 控制脱敏）

# 导入批次追溯中心
POST   /api/batch-trace/import                       # 批次导入（含指纹+冲突策略，仅审批员）
GET    /api/batch-trace/batches                      # 批次列表（?importedBy=xx&since=xx&hasConflicts=true）
GET    /api/batch-trace/batches/:batchId             # 批次详情（?viewer=xx 控制脱敏）
GET    /api/batch-trace/batches/:batchId/logs        # 该批次的日志
GET    /api/batch-trace/batches/:batchId/playbacks   # 按批次筛选回放记录（?viewer=xx）
POST   /api/batch-trace/batches/:batchId/reimport    # 冲突重导入（strategy=skip/overwrite/force_new_id）
GET    /api/batch-trace/batches/:batchId/export-audit # 导出批次审计摘要（?viewer=xx）
POST   /api/batch-trace/link-playback                # 关联回放到批次
GET    /api/batch-trace/duplicate-check              # 重复导入检测（?sourceDigest=xx&contentFingerprint=xx）

# 回放授权保险箱
POST   /api/vault/create                             # 创建保险箱批次（batchId+operator，仅审批员）
GET    /api/vault/batches                            # 保险箱批次列表（?ownerId=xx&status=xx&viewer=xx 控制脱敏）
GET    /api/vault/batches/:vaultBatchId              # 保险箱批次详情（?viewer=xx 控制脱敏）
GET    /api/vault/batches/:vaultBatchId/logs         # 保险箱批次日志（?viewer=xx 控制脱敏）
GET    /api/vault/batches/:vaultBatchId/playbacks    # 保险箱批次回放记录（?viewer=xx 控制脱敏）
POST   /api/vault/batches/:vaultBatchId/playback     # 执行保险箱批次回放（operator+notes）
GET    /api/vault/batches/:vaultBatchId/notes        # 查看保险箱备注（?viewer=xx 控制脱敏）
PUT    /api/vault/batches/:vaultBatchId/notes        # 更新保险箱备注（仅 owner）
GET    /api/vault/batches/:vaultBatchId/trail        # 查看操作轨迹（仅 owner/审批员）
GET    /api/vault/batches/:vaultBatchId/export       # 导出保险箱审计包（仅 owner/审批员）
POST   /api/vault/import                             # 导入保险箱审计包（operator+conflictStrategy）
GET    /api/vault/imported-packages                  # 审计包导入导出记录（?importer=xx&status=xx&fingerprint=xx）
GET    /api/vault/redaction-rules                    # 查看脱敏规则（仅审批员）
```

快照恢复的响应说明：
- `200` 成功，返回 `{ success: true, draft, snapshot }`
- `403` 权限不足（非草稿 owner）
- `409` 基线冲突（`{ error: 'BASELINE_CONFLICT', ... }`）：文档当前正式版本已前进，恢复被拦截
- `422` 草稿已提交，不允许再从快照恢复

---

## 8. 运行测试

```bash
# 全量集成测试（覆盖主流程+失败链路+撤回+一致性+草稿箱+冲突拦截+权限+筛选导出+前端入口可见性）
npm test

# 交付验证（检查 README、样例文件、导入+导出、重启一致性、前端入口、草稿持久化、冲突拦截、权限边界）
node test/delivery.js
```

`npm test` 通过即代表：
- 导入、差异、提交、审批、日志导出主流程跑通
- 空理由、内容相同、重复发布、同角色审批等失败链路全部被拦截
- 撤回恢复上一版、归档保留、重启一致性全部成立
- 草稿箱保存/读取/更新/删除、重启后草稿持久化验证通过
- 基线版本冲突检测与拦截验证通过
- 草稿快照：多次保存自动建快照、顺序正确、恢复自动存当前为快照、正式版本前进后恢复被 BASELINE_CONFLICT 拦截、审批人不能恢复/删除别人快照、超过 10 条自动裁剪、重启后快照持久化、CSV 包含快照ID与动作
- 快照读取权限：非 owner 只能看到脱敏后的快照（无内容/理由/创建人），owner 可看完整快照
- 导出再导入：完整数据导出为 JSON，导入按 ID 去重不覆盖已有数据，不同操作人的草稿和快照不串线
- 重启后导入结果仍正确
- 修订日志**独立导入**：`POST /api/revision-log/import`，需审批员身份，未带操作者被拒绝；重复导入同一批日志返回 `202 + conflicts[]`，三种冲突策略（skip/overwrite/force_new_id）可选
- **审计回放**：审批员对日志按时间顺序只读回放，回放记录区分不同操作者；回放中集成快照权限检查（snapshotAccessible）
- **快照读取硬边界**：未传 `operator` 或非草稿 owner 时，正文、理由、创建人全部脱敏（`_redacted: true`）；审批员 canViewAllDrafts 可跨用户查看
- **重启一致性**：导入批次（importedLogs）、回放记录（playbackRecords）、批次追溯（importBatches）持久化至 db.json，重启后读取结果与权限判断完全一致
- **批次追溯中心**：每次导入生成批次实体（含导入人、时间、来源文件摘要、记录数量、指纹、冲突/失败明细），后续每条回放可精确挂到对应批次；重复导入按策略拒绝/跳过/合并，不静默覆盖、不串线；批次列表/详情/筛选回放入口完整；支持导出批次级审计摘要；非 owner 只看脱敏元数据；重启后批次、回放映射和冲突日志保持一致
- **回放授权保险箱**：owner 可按批次看到完整回放、日志 ID、备注和操作轨迹；非 owner 只能拿到脱敏后的摘要、状态和最小批次元数据，不能借查询组合把明细漏出来；批次归属、权限判断、脱敏规则和冲突日志都落到持久层，服务重启后结果一致；审计包导出后再导入，重复导入同一批内容时明确提示冲突、保留处理日志，不静默覆盖；测试覆盖 owner/非 owner 读取、带 viewer 查询、重启恢复、导出后再导入和重复导入冲突
- 权限边界（编辑员不能发布、审批员不能改别人草稿）验证通过
- 修订日志多维度筛选与 CSV 导出验证通过
- 前端入口可见性（草稿箱标签页、筛选控件、CSV 导出按钮、冲突警告区域、快照列表、**审计回放标签页及所有子控件**）验证通过

---

## 9. 目录速览

```
zyx-00114/
├── server.js                 # 入口，默认端口 3200
├── package.json
├── README.md                 # 本文件
├── samples/
│   └── sample-doc.txt        # 仓库内置样例文档
├── scripts/
│   ├── import-sample.js      # 命令行导入样例
│   ├── export-log.js         # 命令行导出修订日志
│   └── import-log.js         # 命令行：修订日志导入 / 查看批次 / 审计回放
├── lib/
│   ├── store.js              # JSON 持久化，原子写入
│   ├── document.js           # 文档导入、版本查询
│   ├── diff.js               # 文本差异（LCS 算法）
│   ├── revision.js           # 修订申请、理由校验、无效变更检测、从草稿提交、基线冲突检测
│   ├── archive.js            # 审批发布、撤回、归档、一致性校验、日志筛选、CSV 导出
│   ├── draft.js              # 草稿箱：保存、读取、更新、删除、冲突检测
│   ├── auth.js               # 权限模块：角色定义、权限校验
│   ├── audit-playback.js     # 审计回放：日志独立导入、冲突检测、重导入、只读回放
│   ├── batch-trace.js        # 批次追溯中心：批次实体、指纹、冲突策略、审计摘要导出
│   └── playback-vault.js     # 回放授权保险箱：权限硬边界、脱敏规则、审计包导出导入、操作轨迹
├── routes/
│   └── api.js                # RESTful API
├── public/                   # 前端（纯静态）
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/
│   └── db.json               # 运行时数据（重启后仍在）
└── test/
    ├── run.js                # 主流程 + 失败链路集成测试
    └── delivery.js           # 交付验证脚本
```

---

## 9. 常见问题

**Q: 修改端口？**
A: `PORT=3000 npm start`

**Q: 清空全部数据重跑？**
A: 删除 `data/db.json`，重启服务即可。

**Q: 前端点按钮没反应？**
A: 打开浏览器 F12 控制台，或查看 `http://localhost:3200/api/documents` 是否返回 JSON。

**Q: 草稿箱在哪？**
A: 页面顶部标签栏有"草稿箱"标签页。修订提交区也有"保存草稿"按钮，点击后可在草稿箱继续编辑或提交。

**Q: 冲突警告怎么触发？**
A: 在草稿箱打开一份旧草稿时，如果别人已将该文档发布到新版本，页面会自动检测并显示橙色冲突警告，提交也会被拦截。

**Q: 为什么审批发布标签里看不到审批按钮？**
A: 切换到审批员角色（右上角选择"审批员 / 李审批"），审批按钮只对审批员可见。
