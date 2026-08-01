const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  convertMdToDocx,
  convertDocxToMd,
  mediaDirHasFiles,
  reconcileImageAssets,
  findMissingImages,
} = require('./convert');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  dest: path.join(os.tmpdir(), 'md-docx-uploads'),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
});

app.use(express.static(path.join(__dirname, '..', 'public')));

function makeWorkDir() {
  const dir = path.join(os.tmpdir(), 'md-docx-work', crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(...paths) {
  for (const p of paths) {
    fs.rm(p, { recursive: true, force: true }, () => {});
  }
}

function baseName(originalName, fallbackExt) {
  const base = path.basename(originalName || 'document', path.extname(originalName || ''));
  return (base || 'document').replace(/[^a-zA-Z0-9-_ぁ-んァ-ン一-龯]/g, '_') || `document.${fallbackExt}`;
}

app.post(
  '/api/convert/md-to-docx',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'reference', maxCount: 1 },
    { name: 'assets', maxCount: 50 },
  ]),
  async (req, res) => {
    const uploadedFile = req.files?.file?.[0];
    const referenceFile = req.files?.reference?.[0];
    const assetFiles = req.files?.assets || [];
    if (!uploadedFile) {
      return res.status(400).json({ error: 'Markdownファイル(.md)をアップロードしてください。' });
    }

    const workDir = makeWorkDir();
    const filesToClean = [uploadedFile.path, workDir];
    if (referenceFile) filesToClean.push(referenceFile.path);
    for (const asset of assetFiles) filesToClean.push(asset.path);

    try {
      const mdPath = path.join(workDir, 'input.md');
      fs.copyFileSync(uploadedFile.path, mdPath);

      // Place uploaded image/asset files next to the markdown, under their
      // original filename, so relative references like ./image.png resolve.
      for (const asset of assetFiles) {
        const safeName = path.basename(asset.originalname);
        if (!safeName) continue;
        fs.copyFileSync(asset.path, path.join(workDir, safeName));
      }

      const outName = `${baseName(uploadedFile.originalname, 'docx')}.docx`;
      const outPath = path.join(workDir, outName);

      // Match up images whose uploaded filename differs only by extension
      // (or case) from what the markdown references, so a renamed/exported
      // image is still embedded instead of being dropped.
      const mdText = fs.readFileSync(mdPath, 'utf8');
      reconcileImageAssets(mdText, workDir);

      await convertMdToDocx({
        mdPath,
        outPath,
        referenceDocPath: referenceFile ? referenceFile.path : null,
      });

      const missingImages = findMissingImages(mdText, workDir);
      if (missingImages.length > 0) {
        res.setHeader('X-Conversion-Warning', encodeURIComponent(
          `見つからない画像があり、変換結果から除外されました: ${missingImages.join(', ')}`
        ));
      }

      res.download(outPath, outName, (err) => {
        cleanup(...filesToClean);
        if (err && !res.headersSent) {
          res.status(500).json({ error: '変換結果の送信に失敗しました。' });
        }
      });
    } catch (err) {
      cleanup(...filesToClean);
      res.status(500).json({ error: err.message || 'MD→DOCX変換に失敗しました。' });
    }
  }
);

app.post(
  '/api/convert/docx-to-md',
  upload.fields([{ name: 'file', maxCount: 1 }]),
  async (req, res) => {
    const uploadedFile = req.files?.file?.[0];
    if (!uploadedFile) {
      return res.status(400).json({ error: 'Wordファイル(.docx)をアップロードしてください。' });
    }

    const workDir = makeWorkDir();
    const filesToClean = [uploadedFile.path, workDir];

    try {
      const docxPath = path.join(workDir, 'input.docx');
      fs.copyFileSync(uploadedFile.path, docxPath);

      const base = baseName(uploadedFile.originalname, 'md');
      const mdName = `${base}.md`;
      const mdPath = path.join(workDir, mdName);
      const mediaDir = path.join(workDir, 'media');

      await convertDocxToMd({ docxPath, outPath: mdPath, mediaDir });

      if (mediaDirHasFiles(mediaDir)) {
        const zipName = `${base}.zip`;
        const zipPath = path.join(workDir, zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        await new Promise((resolve, reject) => {
          output.on('close', resolve);
          archive.on('error', reject);
          archive.pipe(output);
          archive.file(mdPath, { name: mdName });
          archive.directory(mediaDir, 'media');
          archive.finalize();
        });

        res.download(zipPath, zipName, (err) => {
          cleanup(...filesToClean);
          if (err && !res.headersSent) {
            res.status(500).json({ error: '変換結果の送信に失敗しました。' });
          }
        });
      } else {
        res.download(mdPath, mdName, (err) => {
          cleanup(...filesToClean);
          if (err && !res.headersSent) {
            res.status(500).json({ error: '変換結果の送信に失敗しました。' });
          }
        });
      }
    } catch (err) {
      cleanup(...filesToClean);
      res.status(500).json({ error: err.message || 'DOCX→MD変換に失敗しました。' });
    }
  }
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'ファイルサイズが大きすぎます(上限25MB)。' });
  }
  res.status(500).json({ error: err.message || '予期しないエラーが発生しました。' });
});

app.listen(PORT, () => {
  console.log(`md-docx-converter listening on http://localhost:${PORT}`);
});
