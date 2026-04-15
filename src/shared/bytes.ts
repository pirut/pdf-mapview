export function toUint8Array(input: Buffer | Uint8Array | ArrayBuffer): Uint8Array {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}
