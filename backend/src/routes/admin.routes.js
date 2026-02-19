
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import {
  deleteDocumentBySourceFile,
  getIngestionJob,
  listDocuments,
  savePDF,
  uploadPDF,
} from "../controllers/admin.controller.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const parsedMaxUploadMb = Number.parseInt(process.env.MAX_UPLOAD_MB || "500", 10);
const maxUploadMb =
  Number.isFinite(parsedMaxUploadMb) && parsedMaxUploadMb > 0 ? parsedMaxUploadMb : 500;
const maxUploadBytes = maxUploadMb * 1024 * 1024;

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: maxUploadBytes },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfExt = file.originalname?.toLowerCase().endsWith(".pdf");
    cb(isPdfMime || isPdfExt ? null : new Error("Only PDF files are allowed"), isPdfMime || isPdfExt);
  },
});

const rawPdfParser = express.raw({
  type: ["application/pdf", "application/octet-stream"],
  limit: `${maxUploadMb}mb`,
});

router.post("/upload", upload.any(), uploadPDF);
router.post(
  "/save-pdf",
  (req, res, next) => {
    req.uploadsDir = uploadsDir;
    if (req.is("multipart/form-data")) return upload.any()(req, res, next);
    return next();
  },
  rawPdfParser,
  savePDF
);
router.get("/jobs/:id", getIngestionJob);
router.get("/documents", listDocuments);
router.delete("/documents", deleteDocumentBySourceFile);

export default router;
