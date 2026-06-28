#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "normalized.json";

if (!input || !existsSync(input)) {
  console.error("Usage: bun scripts/normalize.ts <input.csv> [output.json]");
  process.exit(1);
}

const text = readFileSync(input, "utf-8").trim();
const [header, ...rows] = text.split(/\r?\n/);
const columns = header.split(",");
if (!columns.includes("id") || !columns.includes("name")) {
  console.error("Missing required columns: id,name");
  process.exit(2);
}

writeFileSync(output, `${JSON.stringify({ rows: rows.length }, null, 2)}\n`);
console.log(output);
