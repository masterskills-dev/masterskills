import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { gunzip as gunzipCallback, gzip as gzipCallback } from "node:zlib";
import { extract, pack } from "tar-stream";

const gunzip = promisify(gunzipCallback);
const gzip = promisify(gzipCallback);

export const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function normalizeEntryPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
  return !path.split("/").some((segment) => segment === ".." || segment === "");
}

export interface TarEntry {
  path: string;
  size: number;
  sha256: string;
  content: Buffer;
}

/** Packs files into a deterministic .tar.gz (fixed mtime → same input, same hash). */
export async function packTarGz(
  files: { path: string; content: Buffer }[],
): Promise<Buffer> {
  const tarBuffer = await new Promise<Buffer>((resolve, reject) => {
    const packer = pack();
    const chunks: Buffer[] = [];
    packer.on("data", (chunk: Buffer) => chunks.push(chunk));
    packer.on("end", () => resolve(Buffer.concat(chunks)));
    packer.on("error", reject);
    for (const file of files) {
      packer.entry(
        { name: file.path, mtime: new Date(0), mode: 0o644 },
        file.content,
      );
    }
    packer.finalize();
  });
  return gzip(tarBuffer);
}

/** Mirrors the server-side parser — the CLI verifies downloads the same way. */
export async function parseTarGz(buffer: Buffer): Promise<TarEntry[]> {
  const unzipped = await gunzip(buffer, { maxOutputLength: MAX_PACKAGE_BYTES * 2 });

  return new Promise((resolve, reject) => {
    const entries: TarEntry[] = [];
    const extractor = extract();

    extractor.on("entry", (header, stream, next) => {
      if (header.type !== "file") {
        stream.resume();
        stream.on("end", next);
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        const content = Buffer.concat(chunks);
        entries.push({
          path: normalizeEntryPath(header.name),
          size: content.length,
          sha256: sha256Hex(content),
          content,
        });
        next();
      });
      stream.on("error", reject);
    });

    extractor.on("finish", () => resolve(entries));
    extractor.on("error", reject);

    Readable.from(unzipped).pipe(extractor);
  });
}
