import express from "express";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import multer from "multer";
import { createServer as createViteServer } from "vite";

const execFileAsync = promisify(execFile);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON and URL-encoded body parser
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Convert Word (.doc, .docx, .odt, .rtf) to PDF using LibreOffice
  app.post("/api/convert-word", upload.single("file"), async (req, res): Promise<any> => {
    if (!req.file) {
      return res.status(400).json({ error: "Nessun file fornito" });
    }

    const originalName = req.file.originalname || "document.docx";
    const ext = path.extname(originalName) || ".docx";
    const safeBaseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_") || "document";

    let tempDir = "";
    try {
      tempDir = fs.mkdtempSync(path.join("/tmp", "word-conv-"));
      const inputPath = path.join(tempDir, `${safeBaseName}${ext}`);
      fs.writeFileSync(inputPath, req.file.buffer);

      // Execute soffice conversion
      await execFileAsync("soffice", [
        "-env:UserInstallation=file:///tmp/lo_profile",
        "--headless",
        "--convert-to",
        "pdf:writer_pdf_Export",
        inputPath,
        "--outdir",
        tempDir
      ]);

      const expectedPdfPath = path.join(tempDir, `${safeBaseName}.pdf`);
      let actualPdfPath = "";

      if (fs.existsSync(expectedPdfPath)) {
        actualPdfPath = expectedPdfPath;
      } else {
        const files = fs.readdirSync(tempDir);
        const pdfFile = files.find(f => f.toLowerCase().endsWith(".pdf"));
        if (pdfFile) {
          actualPdfPath = path.join(tempDir, pdfFile);
        }
      }

      if (!actualPdfPath || !fs.existsSync(actualPdfPath)) {
        throw new Error("LibreOffice non ha generato il file PDF di output");
      }

      const pdfBuffer = fs.readFileSync(actualPdfPath);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName}.pdf"`);
      return res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Errore conversione Word in PDF:", err);
      return res.status(500).json({
        error: "Conversione fallita: " + (err.message || String(err))
      });
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
          console.error("Errore rimozione cartella temporanea:", e);
        }
      }
    }
  });

  // Extract CAdES .p7m (PKCS#7) to PDF or Word -> PDF
  app.post("/api/extract-p7m", upload.single("file"), async (req, res): Promise<any> => {
    if (!req.file) {
      return res.status(400).json({ error: "Nessun file .p7m fornito" });
    }

    const originalName = req.file.originalname || "document.p7m";
    const baseWithoutP7m = originalName.replace(/\.p7m$/i, "");
    let safeName = path.basename(baseWithoutP7m).replace(/[^a-zA-Z0-9._-]/g, "_") || "extracted_doc";

    let tempDir = "";
    try {
      tempDir = fs.mkdtempSync(path.join("/tmp", "p7m-extract-"));
      const p7mPath = path.join(tempDir, "input.p7m");
      const outPath = path.join(tempDir, "extracted.bin");
      fs.writeFileSync(p7mPath, req.file.buffer);

      // Attempt extraction via openssl cms first, fallback to openssl smime
      let extractSuccess = false;
      try {
        await execFileAsync("openssl", [
          "cms",
          "-verify",
          "-noverify",
          "-inform",
          "DER",
          "-in",
          p7mPath,
          "-out",
          outPath
        ]);
        extractSuccess = fs.existsSync(outPath) && fs.statSync(outPath).size > 0;
      } catch (cmsErr) {
        console.warn("openssl cms fallback:", cmsErr);
      }

      if (!extractSuccess) {
        try {
          await execFileAsync("openssl", [
            "smime",
            "-verify",
            "-noverify",
            "-inform",
            "DER",
            "-in",
            p7mPath,
            "-out",
            outPath
          ]);
          extractSuccess = fs.existsSync(outPath) && fs.statSync(outPath).size > 0;
        } catch (smimeErr) {
          console.error("openssl smime error:", smimeErr);
        }
      }

      if (!extractSuccess || !fs.existsSync(outPath)) {
        throw new Error("Impossibile estrarre il payload dal file firmato .p7m");
      }

      const extractedBytes = fs.readFileSync(outPath);

      // Check if it's already a PDF
      const isPdf = extractedBytes.length >= 5 &&
        extractedBytes[0] === 0x25 && // %
        extractedBytes[1] === 0x50 && // P
        extractedBytes[2] === 0x44 && // D
        extractedBytes[3] === 0x46 && // F
        extractedBytes[4] === 0x2D;   // -

      if (isPdf) {
        const outFileName = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${outFileName}"`);
        return res.send(extractedBytes);
      }

      // If it's a Word document inside the .p7m (starts with PK.. zip or D0CF.. OLE2)
      const isZip = extractedBytes.length >= 4 &&
        extractedBytes[0] === 0x50 && extractedBytes[1] === 0x4B &&
        extractedBytes[2] === 0x03 && extractedBytes[3] === 0x04;
      const isOle = extractedBytes.length >= 4 &&
        extractedBytes[0] === 0xD0 && extractedBytes[1] === 0xCF &&
        extractedBytes[2] === 0x11 && extractedBytes[3] === 0xE0;

      if (isZip || isOle) {
        const wordExt = isZip ? ".docx" : ".doc";
        const wordPath = path.join(tempDir, `doc_inside${wordExt}`);
        fs.writeFileSync(wordPath, extractedBytes);

        await execFileAsync("soffice", [
          "-env:UserInstallation=file:///tmp/lo_profile",
          "--headless",
          "--convert-to",
          "pdf:writer_pdf_Export",
          wordPath,
          "--outdir",
          tempDir
        ]);

        const pdfFile = path.join(tempDir, "doc_inside.pdf");
        if (fs.existsSync(pdfFile)) {
          const pdfBuffer = fs.readFileSync(pdfFile);
          const outFileName = safeName.replace(/\.(docx?|doc)$/i, "") + ".pdf";
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename="${outFileName}"`);
          return res.send(pdfBuffer);
        }
      }

      throw new Error("Il contenuto estratto dal .p7m non è un PDF né un documento Word convertibile.");
    } catch (err: any) {
      console.error("Errore estrazione .p7m:", err);
      return res.status(500).json({
        error: "Estrazione .p7m fallita: " + (err.message || String(err))
      });
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
          console.error("Errore pulizia tempDir .p7m:", e);
        }
      }
    }
  });

  // Vite middleware in dev or static dist in prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
