import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  const versionFilePath = path.join(process.cwd(), "VERSION.txt");

  try {
    const version = (await fs.readFile(versionFilePath, "utf-8")).trim();
    return new Response(version || "0.0.0", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch {
    return new Response("0.0.0", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
