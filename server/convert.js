const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PANDOC_BIN = process.env.PANDOC_PATH || 'pandoc';
const DEFAULT_REFERENCE_DOCX = path.join(__dirname, 'reference.docx');

function runPandoc(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(PANDOC_BIN, args, { cwd, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) {
        const message = stderr && stderr.toString().trim() ? stderr.toString().trim() : err.message;
        reject(new Error(`pandoc failed: ${message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// Converts a Markdown file to a .docx file, styled by a reference document
// (either the caller's own template or our bundled default). mdPath's
// directory is used as pandoc's cwd/resource path so that relative image
// references next to the source file (or in an uploaded asset bundle)
// resolve correctly instead of being silently dropped.
async function convertMdToDocx({ mdPath, outPath, referenceDocPath }) {
  const refDoc = path.resolve(referenceDocPath || DEFAULT_REFERENCE_DOCX);
  const sourceDir = path.dirname(mdPath);
  const args = [
    '-f', 'gfm',
    '-t', 'docx',
    '--standalone',
    `--resource-path=${sourceDir}`,
    '--reference-doc', refDoc,
    '-o', path.resolve(outPath),
    path.basename(mdPath),
  ];
  await runPandoc(args, sourceDir);
}

// Converts a .docx file to GitHub-Flavored Markdown, extracting any embedded
// images into mediaDir (relative image references are rewritten by pandoc).
async function convertDocxToMd({ docxPath, outPath, mediaDir }) {
  const args = [
    '-f', 'docx',
    '-t', 'gfm',
    '--standalone',
    '--wrap=preserve',
    `--extract-media=${mediaDir}`,
    '-o', outPath,
    docxPath,
  ];
  await runPandoc(args);
}

const MD_IMAGE_RE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

function localImageRefs(mdText) {
  const refs = [];
  for (const match of mdText.matchAll(MD_IMAGE_RE)) {
    const ref = match[1];
    if (/^(https?:|data:|\/\/)/i.test(ref)) continue;
    refs.push(decodeURIComponent(ref));
  }
  return refs;
}

// Users often rename/export images so the extension in the markdown
// reference (e.g. photo.jpg) doesn't exactly match the uploaded file
// (photo.PNG, photo.jpeg, ...). Pandoc only does an exact path lookup, so
// for every reference that doesn't resolve as-is, this looks for an
// uploaded asset with the same filename stem (case-insensitively, ignoring
// extension) and copies its bytes to the exact path the markdown expects -
// the image itself is preserved even though its extension "changed".
function reconcileImageAssets(mdText, sourceDir) {
  const root = path.resolve(sourceDir);
  const available = fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);

  for (const ref of localImageRefs(mdText)) {
    const resolved = path.resolve(root, ref);
    if (!resolved.startsWith(root)) continue; // outside sandbox
    if (fs.existsSync(resolved)) continue; // already fine

    const wantStem = path.basename(ref, path.extname(ref)).toLowerCase();
    const match = available.find((name) => path.basename(name, path.extname(name)).toLowerCase() === wantStem);
    if (!match) continue;

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.copyFileSync(path.join(root, match), resolved);
  }
}

// Scans markdown text for local image references (skipping http(s)/data
// URLs) and returns the ones that still aren't present in sourceDir after
// reconciliation. Pandoc drops unresolvable images silently, so this lets
// callers warn the user instead.
function findMissingImages(mdText, sourceDir) {
  const root = path.resolve(sourceDir);
  const missing = new Set();
  for (const ref of localImageRefs(mdText)) {
    const resolved = path.resolve(root, ref);
    if (!resolved.startsWith(root)) continue; // outside sandbox, not our concern
    if (!fs.existsSync(resolved)) missing.add(ref);
  }
  return [...missing];
}

function mediaDirHasFiles(mediaDir) {
  if (!fs.existsSync(mediaDir)) return false;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(full)) return true;
      } else {
        return true;
      }
    }
    return false;
  };
  return walk(mediaDir);
}

module.exports = {
  convertMdToDocx,
  convertDocxToMd,
  mediaDirHasFiles,
  reconcileImageAssets,
  findMissingImages,
  DEFAULT_REFERENCE_DOCX,
};
