const fs = require('fs');
const path = require('path');
const docSvc = require('../lib/document');

const samplePath = path.join(__dirname, '..', 'samples', 'sample-doc.txt');
const content = fs.readFileSync(samplePath, 'utf-8');

const result = docSvc.importDocument(
  '信息安全管理制度',
  content,
  process.argv[2] || '命令行导入'
);

console.log(JSON.stringify({
  ok: true,
  documentId: result.document.id,
  versionId: result.version.id,
  versionNumber: result.version.versionNumber,
  title: result.document.title
}, null, 2));
