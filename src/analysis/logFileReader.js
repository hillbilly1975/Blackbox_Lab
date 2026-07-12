import { identifyFile } from "./fileIdentification.js";

export async function readLogFile(file) {
  if (!file) {
    return null;
  }

  const sizeKb = (file.size / 1024).toFixed(1);
  const text = await file.text();

  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  const fileType = identifyFile(lines);

  return {
    file,
    sizeKb,
    text,
    lines,
    fileType
  };
}