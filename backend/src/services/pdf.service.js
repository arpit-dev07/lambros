
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

export const extractTextFromPDF = async (filePath) => {
  const dataBuffer = await readFile(filePath);
  const parser = new PDFParse({ data: dataBuffer });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
};
