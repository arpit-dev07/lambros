
import { extractTextFromPDF } from "../services/pdf.service.js";
import { splitText } from "../services/splitText.js";
import { createEmbeddings } from "../services/embedding.service.js";
import { index } from "../services/pinecone.service.js";
import { randomUUID } from "crypto";
import fs from "node:fs";
import path from "node:path";

const batchArray = (items, batchSize) => {
  const size = Math.max(1, batchSize);
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

const ingestionJobs = new Map();
const documentsCache = new Map();

const getDocumentsCacheTtlMs = () => {
  const raw = Number.parseInt(process.env.DOCUMENTS_CACHE_TTL_MS || "20000", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 20000;
  return raw;
};

const clearDocumentsCache = () => {
  documentsCache.clear();
};

const ingestPDFFile = async (filePath, originalName) => {
  const text = await extractTextFromPDF(filePath);
  const chunks = splitText(text);

  const records = [];
  const embeddingBatches = batchArray(chunks, 128);
  let chunkIndex = 0;

  for (const batchChunks of embeddingBatches) {
    const embeddings = await createEmbeddings(batchChunks);
    for (let i = 0; i < embeddings.length; i += 1) {
      records.push({
        id: randomUUID(),
        values: embeddings[i],
        metadata: {
          text: batchChunks[i],
          sourceFile: originalName || path.basename(filePath),
          chunkIndex,
        },
      });
      chunkIndex += 1;
    }
  }

  if (records.length > 0) {
    const upsertBatches = batchArray(records, 200);
    for (const batchRecords of upsertBatches) {
      await index.upsert({ records: batchRecords });
    }
  }

  return { chunks: chunks.length, records: records.length };
};

const createIngestionJob = ({ filePath, fileName }) => {
  const id = randomUUID();
  const job = {
    id,
    status: "queued",
    file: fileName,
    path: filePath,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    stats: null,
    error: null,
  };

  ingestionJobs.set(id, job);
  return job;
};

const runIngestionJob = async (jobId) => {
  const job = ingestionJobs.get(jobId);
  if (!job) return;

  job.status = "processing";
  job.startedAt = new Date().toISOString();

  try {
    job.stats = await ingestPDFFile(job.path, job.file);
    job.status = "done";
    clearDocumentsCache();
  } catch (err) {
    job.status = "failed";
    job.error = err?.message || "PDF ingestion failed";
  } finally {
    job.finishedAt = new Date().toISOString();
  }
};

export const uploadPDF = async (req, res) => {
  try {
    const files = [
      ...(Array.isArray(req.files) ? req.files : []),
      ...(req.file ? [req.file] : []),
    ].filter(Boolean);

    if (files.length === 0) {
      return res.status(400).json({ error: "Missing uploaded file(s)" });
    }

    const results = [];
    for (const file of files) {
      const filePath = file?.path;
      if (!filePath) continue;
      const sourceFile = file?.originalname || path.basename(filePath);
      const stats = await ingestPDFFile(filePath, sourceFile);
      results.push({ sourceFile, path: filePath, ...stats });
    }

    clearDocumentsCache();

    return res.json({ success: true, files: results });
  } catch (err) {
    return res.status(500).json({ error: "Failed to process PDF" });
  }
};

export const savePDF = async (req, res) => {
  try {
    const firstFile = Array.isArray(req.files) ? req.files[0] : undefined;
    const uploadedFile = req.file || firstFile;

    let filePath = uploadedFile?.path;
    const filenameFromHeader =
      typeof req.headers?.["x-filename"] === "string" ? req.headers["x-filename"] : "";
    const filenameFromQuery = typeof req.query?.filename === "string" ? req.query.filename : "";
    let fileName = uploadedFile?.originalname || filenameFromQuery || filenameFromHeader || "";

    if (!filePath && Buffer.isBuffer(req.body) && req.body.length > 0) {
      const uploadsDir = req.uploadsDir || path.resolve(process.cwd(), "uploads");
      fs.mkdirSync(uploadsDir, { recursive: true });
      filePath = path.join(uploadsDir, `${randomUUID()}.pdf`);
      fs.writeFileSync(filePath, req.body);
    }

    if (!filePath) {
      return res.status(400).json({
        error:
          "PDF required: send multipart/form-data file or raw application/pdf body",
      });
    }

    if (!fileName.trim()) {
      fileName = path.basename(filePath);
    }

    const shouldWait = String(req.query.wait || "false").toLowerCase() === "true";

    if (shouldWait) {
      const stats = await ingestPDFFile(filePath, fileName);
      clearDocumentsCache();
      return res.json({
        status: "ok",
        mode: "sync",
        message: "PDF ingested successfully",
        file: fileName,
        path: filePath,
        ...stats,
      });
    }

    const job = createIngestionJob({ filePath, fileName });
    setImmediate(() => {
      runIngestionJob(job.id).catch((err) => {
        const latest = ingestionJobs.get(job.id);
        if (!latest) return;
        latest.status = "failed";
        latest.error = err?.message || "PDF ingestion failed";
        latest.finishedAt = new Date().toISOString();
      });
    });

    return res.status(202).json({
      status: "accepted",
      mode: "async",
      message: "Upload saved. Ingestion started in background.",
      jobId: job.id,
      file: fileName,
      path: filePath,
      check: `/admin/jobs/${job.id}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "PDF ingestion failed" });
  }
};

export const getIngestionJob = (req, res) => {
  const job = ingestionJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  return res.json(job);
};

export const listDocuments = async (req, res) => {
  try {
    const limitRaw = req.query?.limit;
    const limitNum = Number(limitRaw);
    const limit = Number.isFinite(limitNum) ? Math.min(1000, Math.max(1, Math.trunc(limitNum))) : 500;

    const initialPaginationToken =
      typeof req.query?.paginationToken === "string" ? req.query.paginationToken : undefined;
    const namespace = typeof req.query?.namespace === "string" ? req.query.namespace : undefined;

    const scanAll = String(req.query?.scanAll || "false").toLowerCase() === "true";
    const exact = String(req.query?.exact || "false").toLowerCase() === "true";
    const forceRefresh = String(req.query?.refresh || "false").toLowerCase() === "true";
    const scanPagesRaw = req.query?.scanPages;
    const scanPagesNum = Number(scanPagesRaw);
    const maxPagesRaw = req.query?.maxPages;
    const maxPagesNum = Number(maxPagesRaw);
    const maxPages = Number.isFinite(maxPagesNum)
      ? Math.min(500, Math.max(1, Math.trunc(maxPagesNum)))
      : 200;

    const scanPages = scanAll
      ? maxPages
      : Number.isFinite(scanPagesNum)
        ? Math.min(maxPages, Math.max(1, Math.trunc(scanPagesNum)))
        : 5;

    const cacheable = !initialPaginationToken && !forceRefresh;
    const cacheKey = JSON.stringify({
      namespace: namespace || "__default__",
      scanAll,
      exact,
      limit,
      scanPages,
      maxPages,
    });

    if (cacheable) {
      const cached = documentsCache.get(cacheKey);
      const ttlMs = getDocumentsCacheTtlMs();
      if (cached && Date.now() - cached.at < ttlMs) {
        return res.json({ ...cached.data, cached: true, cacheAgeMs: Date.now() - cached.at });
      }
    }

    const counts = new Map();
    let pagesScanned = 0;
    let scannedRecords = 0;
    let paginationToken = initialPaginationToken;
    let lastNamespace = namespace || "__default__";
    let nextPaginationToken;
    let stableSourcePages = 0;

    for (let page = 0; page < scanPages; page += 1) {
      const previousSourceCount = counts.size;
      const result = await index.fetchByMetadata({
        filter: { sourceFile: { $exists: true } },
        limit,
        paginationToken,
        namespace,
      });

      lastNamespace = result.namespace;
      const records = Object.values(result.records || {});
      scannedRecords += records.length;
      pagesScanned += 1;

      for (const record of records) {
        const sourceFile = record?.metadata?.sourceFile;
        if (typeof sourceFile !== "string" || sourceFile.trim().length === 0) continue;
        counts.set(sourceFile, (counts.get(sourceFile) || 0) + 1);
      }

      nextPaginationToken = result.pagination?.next;
      if (!nextPaginationToken) break;
      paginationToken = nextPaginationToken;

      if (counts.size === previousSourceCount) stableSourcePages += 1;
      else stableSourcePages = 0;

      if (scanAll && !exact && pagesScanned >= 3 && stableSourcePages >= 2) {
        break;
      }
    }

    const documents = [...counts.entries()]
      .map(([sourceFile, recordsInScan]) => ({ sourceFile, recordsInScan }))
      .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));

    const response = {
      documents,
      scannedRecords,
      pagesScanned,
      nextPaginationToken,
      namespace: lastNamespace,
      isApproximate: scanAll && !exact,
      note:
        nextPaginationToken && !scanAll
          ? "More results available. Pass paginationToken to continue scanning, or use scanAll=true."
          : nextPaginationToken && scanAll && !exact
            ? "Approximate scan completed early for speed. Pass exact=true for full exhaustive scan."
          : undefined,
    };

    if (cacheable) {
      documentsCache.set(cacheKey, { at: Date.now(), data: response });
    }

    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to list documents" });
  }
};

export const deleteDocumentBySourceFile = async (req, res) => {
  try {
    const sourceFile =
      (typeof req.query?.sourceFile === "string" && req.query.sourceFile) ||
      (typeof req.body?.sourceFile === "string" && req.body.sourceFile) ||
      "";

    if (!sourceFile.trim()) {
      return res.status(400).json({ error: "Missing 'sourceFile'" });
    }

    const confirm =
      String(req.query?.confirm || req.body?.confirm || "false").toLowerCase() === "true";
    if (!confirm) {
      return res.status(400).json({ error: "Set confirm=true to delete" });
    }

    const namespace =
      (typeof req.query?.namespace === "string" && req.query.namespace) ||
      (typeof req.body?.namespace === "string" && req.body.namespace) ||
      undefined;

    await index.deleteMany({
      filter: { sourceFile: { $eq: sourceFile } },
      namespace,
    });

    clearDocumentsCache();

    return res.json({ success: true, deleted: "requested", sourceFile, namespace: namespace || null });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to delete document" });
  }
};
