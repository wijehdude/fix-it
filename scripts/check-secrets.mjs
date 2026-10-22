#!/usr/bin/env node
/**
 * Build-time guard: the OpenAI API key must never reach client code.
 *
 *   node scripts/check-secrets.mjs src           — before build: OPENAI_API_KEY may only be
 *                                                   referenced in server-only folders.
 *   node scripts/check-secrets.mjs .next/static  — after build: the browser bundle must not
 *                                                   contain the variable name or its value.
 */
import fs from "node:fs";
import path from "node:path";

const target = process.argv[2] ?? "src";
const SERVER_ONLY = [path.join("src", "app", "api"), path.join("src", "lib", "ai"), path.join("src", "lib", "server")];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const failures = [];
const keyValue = process.env.OPENAI_API_KEY;

for (const file of walk(target)) {
  if (!/\.(m?[jt]sx?|json|html|css|txt)$/.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const mentionsKey = text.includes("OPENAI_API_KEY");
  if (target === "src") {
    if (!mentionsKey) continue;
    const allowed = SERVER_ONLY.some((dir) => file.startsWith(dir + path.sep));
    const isClient = /^\s*["']use client["']/m.test(text);
    if (!allowed || isClient) failures.push(`${file}: references OPENAI_API_KEY outside server-only code`);
  } else {
    if (mentionsKey) failures.push(`${file}: browser bundle contains "OPENAI_API_KEY"`);
    if (keyValue && keyValue.length > 8 && text.includes(keyValue)) failures.push(`${file}: browser bundle contains the API key value`);
  }
}

if (failures.length) {
  console.error("\n✖ Secret check failed:\n  " + failures.join("\n  ") + "\n");
  process.exit(1);
}
console.log(`✓ Secret check passed (${target})`);
