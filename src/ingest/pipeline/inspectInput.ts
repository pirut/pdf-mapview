import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";

import { toUint8Array } from "../../shared/bytes";

export interface InspectedInput {
  bytes: Uint8Array;
  originalFilename?: string;
  ext?: string;
}

export async function inspectInput(
  input: string | Buffer | Uint8Array | ArrayBuffer,
): Promise<InspectedInput> {
  if (typeof input === "string") {
    const bytes = await readFile(input);
    return {
      bytes: toUint8Array(bytes),
      originalFilename: basename(input),
      ext: extname(input).slice(1).toLowerCase() || undefined,
    };
  }

  return {
    bytes: toUint8Array(input),
  };
}
