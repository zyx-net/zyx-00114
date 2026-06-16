function generateDiff(oldContent, newContent) {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const lcs = computeLCS(oldLines, newLines);
  const ops = buildOps(oldLines, newLines, lcs);

  const hunks = groupIntoHunks(ops, oldLines, newLines);
  const summary = computeSummary(ops);

  return {
    hunks,
    summary,
    hasChanges: ops.some(op => op.type !== 'equal'),
    oldLineCount: oldLines.length,
    newLineCount: newLines.length
  };
}

function computeLCS(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'equal', oldIdx: i - 1, newIdx: j - 1 });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

function buildOps(oldLines, newLines, lcs) {
  const ops = [];
  let oi = 0, ni = 0;

  for (const entry of lcs) {
    while (oi < entry.oldIdx) {
      ops.push({ type: 'delete', oldIdx: oi, line: oldLines[oi] });
      oi++;
    }
    while (ni < entry.newIdx) {
      ops.push({ type: 'insert', newIdx: ni, line: newLines[ni] });
      ni++;
    }
    ops.push({ type: 'equal', oldIdx: oi, newIdx: ni, line: oldLines[oi] });
    oi++;
    ni++;
  }

  while (oi < oldLines.length) {
    ops.push({ type: 'delete', oldIdx: oi, line: oldLines[oi] });
    oi++;
  }
  while (ni < newLines.length) {
    ops.push({ type: 'insert', newIdx: ni, line: newLines[ni] });
    ni++;
  }

  return ops;
}

function groupIntoHunks(ops, oldLines, newLines) {
  if (ops.length === 0) return [];

  const hunks = [];
  let current = null;
  let contextSize = 1;
  let oldLine = 1, newLine = 1;

  for (const op of ops) {
    const isChange = op.type !== 'equal';
    if (isChange) {
      if (!current) {
        current = { oldStart: oldLine, newStart: newLine, lines: [] };
      }
    }

    if (op.type === 'equal') {
      if (current) {
        current.lines.push({ type: 'context', content: op.line, oldLine, newLine });
      }
      oldLine++;
      newLine++;
    } else if (op.type === 'delete') {
      current.lines.push({ type: 'removed', content: op.line, oldLine });
      oldLine++;
    } else if (op.type === 'insert') {
      current.lines.push({ type: 'added', content: op.line, newLine });
      newLine++;
    }

    if (current && op.type === 'equal') {
      const changeAfter = ops.slice(ops.indexOf(op) + 1).some(o => o.type !== 'equal');
      if (!changeAfter || current.lines.filter(l => l.type !== 'context').length === 0) {
        hunks.push(current);
        current = null;
      }
    }
  }

  if (current) {
    hunks.push(current);
  }

  return hunks;
}

function computeSummary(ops) {
  let added = 0, removed = 0, unchanged = 0;
  for (const op of ops) {
    if (op.type === 'insert') added++;
    else if (op.type === 'delete') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}

function isIdenticalContent(oldContent, newContent) {
  return oldContent === newContent;
}

module.exports = { generateDiff, isIdenticalContent };
