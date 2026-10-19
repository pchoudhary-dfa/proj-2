import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const versionPath = path.join(process.cwd(), "VERSION.txt");
  const version = (await readFile(versionPath, "utf8")).trim();
  return Response.json({ version });
}

