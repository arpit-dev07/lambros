
import "dotenv/config";
import express from "express";
import multer from "multer";

import cors from "cors";
import adminRoutes from "./routes/admin.routes.js";
import chatRoutes from "./routes/chat.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/admin", adminRoutes);
app.use("/chat", chatRoutes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large" });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err?.message === "Only PDF files are allowed") {
    return res.status(400).json({ error: err.message });
  }

  return next(err);
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
