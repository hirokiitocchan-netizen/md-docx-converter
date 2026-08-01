const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const statusEl = document.getElementById('status');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    statusEl.textContent = '';
    statusEl.classList.remove('error');
  });
});

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', Boolean(isError));
}

function filenameFromContentDisposition(header, fallback) {
  if (!header) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : fallback;
}

// Languages commonly used to describe flowcharts/diagrams as code inside a
// fenced block. Pandoc has no renderer for these - it converts them to a
// plain code block of program text, not an actual diagram image.
const DIAGRAM_LANGS = [
  'mermaid', 'plantuml', 'puml', 'dot', 'graphviz', 'flow', 'flowchart',
  'wavedrom', 'blockdiag', 'seqdiag', 'actdiag', 'nwdiag', 'ditaa', 'bpmn',
  'd2', 'nomnoml', 'tikz',
];
const DIAGRAM_FENCE_RE = new RegExp(
  '^(?:```|~~~)[ \\t]*(' + DIAGRAM_LANGS.join('|') + ')\\b',
  'gim'
);

function findDiagramCodeBlocks(mdText) {
  const found = new Set();
  for (const match of mdText.matchAll(DIAGRAM_FENCE_RE)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

const diagramDialog = document.getElementById('diagram-dialog');
const diagramDialogMessage = document.getElementById('diagram-dialog-message');
const diagramDialogOk = document.getElementById('diagram-dialog-ok');
const diagramDialogCancel = document.getElementById('diagram-dialog-cancel');

function confirmDiagramConversion(languages) {
  return new Promise((resolve) => {
    diagramDialogMessage.textContent =
      `このMarkdownには図・フローチャートがコードとして記述されている箇所があります` +
      `(${languages.join(', ')})。\n` +
      `Wordへの変換では図としては描画されず、コードのテキストとしてそのまま出力されます。\n` +
      `このまま変換を続けますか？`;

    const cleanup = () => {
      diagramDialogOk.removeEventListener('click', onOk);
      diagramDialogCancel.removeEventListener('click', onCancel);
      diagramDialog.removeEventListener('cancel', onCancel);
    };
    const onOk = () => { cleanup(); diagramDialog.close(); resolve(true); };
    const onCancel = () => { cleanup(); diagramDialog.close(); resolve(false); };

    diagramDialogOk.addEventListener('click', onOk);
    diagramDialogCancel.addEventListener('click', onCancel);
    diagramDialog.addEventListener('cancel', onCancel);
    diagramDialog.showModal();
  });
}

async function submitForm(form, endpoint, fallbackName) {
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  setStatus('変換中です…');

  try {
    const formData = new FormData(form);
    const res = await fetch(endpoint, { method: 'POST', body: formData });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `変換に失敗しました (HTTP ${res.status})`);
    }

    const blob = await res.blob();
    const filename = filenameFromContentDisposition(res.headers.get('Content-Disposition'), fallbackName);
    const warningHeader = res.headers.get('X-Conversion-Warning');
    const warning = warningHeader ? decodeURIComponent(warningHeader) : '';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(`完了しました: ${filename}${warning ? `\n⚠ ${warning}` : ''}`, Boolean(warning));
  } catch (err) {
    setStatus(err.message || '変換に失敗しました。', true);
  } finally {
    submitBtn.disabled = false;
  }
}

document.getElementById('form-md2docx').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;

  const mdFile = form.querySelector('input[name="file"]').files[0];
  if (mdFile) {
    const mdText = await mdFile.text();
    const diagramLangs = findDiagramCodeBlocks(mdText);
    if (diagramLangs.length > 0) {
      const proceed = await confirmDiagramConversion(diagramLangs);
      if (!proceed) {
        setStatus('変換を中止しました。');
        return;
      }
    }
  }

  submitForm(form, '/api/convert/md-to-docx', 'output.docx');
});

document.getElementById('form-docx2md').addEventListener('submit', (e) => {
  e.preventDefault();
  submitForm(e.target, '/api/convert/docx-to-md', 'output.md');
});
