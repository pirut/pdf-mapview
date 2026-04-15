import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";

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
      bytes,
      originalFilename: basename(input),
      ext: extname(input).slice(1).toLowerCase() || undefined,
    };
  }

  if (input instanceof ArrayBuffer) {
    return {
      bytes: new Uint8Array(input),
    };
  }

  if (input instanceof Uint8Array) {
    return { bytes: input };
  }

  return {
    bytes: new Uint8Array(input),
  };
}
