import { Hash, PartialOpts, createView, Input, toBytes } from './utils';

// Base SHA2 class (RFC 6234)
export abstract class Sha2 extends Hash {
  abstract _process(buf: DataView, offset: number): void;
  abstract _get(): number[];
  abstract clean(): void;
  // For partial updates less than block size
  buffer: Uint8Array;
  view: DataView;
  done = false;
  cleaned = false;
  length = 0;

  constructor(
    readonly blockLen: number,
    readonly outputLen: number,
    readonly padOffset: number,
    readonly isLE: boolean,
    readonly opts: PartialOpts
  ) {
    super();
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(_data: Input): this {
    if (this.done) throw new Error('Hash already finalized');
    const data = toBytes(_data);
    const { view, blockLen } = this;
    // We have data in internal buffer, try to fill from data
    let offset = this.length % blockLen; // Offset position in internal buffer
    let pos = 0; // Position in data buffer
    let len = data.length;
    if (offset) {
      const left = blockLen - offset; // How much bytes we need write to fill buffer?
      const tmp = data.subarray(0, left);
      this.buffer.set(tmp, offset);
      this.length += pos = tmp.length;
      if (len < left) return this; // fast path, internal buffer still has incomplete block
      this._process(view, 0);
      offset = 0;
    }
    // Now lets process all blocks in data that left without copying it to internal buffer
    const dataView = createView(data);
    for (; blockLen <= len - pos; pos += blockLen, offset = 0, this.length += blockLen)
      this._process(dataView, pos);
    // If there is still some data (at this point it can be only incomplete block),
    // then copy it to internal buffer
    // Internal buffer is empty here, because all leftovers was processed in first step
    if (!(len - pos)) return this;
    this.buffer.set(data.subarray(pos), offset);
    this.length += len - pos;
    return this;
  }
  _finish() {
    if (this.done) return;
    this.done = true;
    // Padding
    // We can avoid allocation of buffer for padding completely if it
    // was previously not allocated here. But it won't change performance.
    const { buffer, view, blockLen, isLE } = this;
    let i = this.length % this.blockLen | 0; // current buffer offset
    // append the bit '1' to the message
    buffer[i++] = 0b10000000;
    // we have more than blocksize-lengthOffset bytes in buffer, so we cannot put length in current block, need process it and pad again
    if (i > blockLen - this.padOffset) {
      for (let j = 0; j < blockLen - i; j++) buffer[i + j] = 0;
      this._process(view, 0);
      i = 0;
    }
    // Pad until full block byte with zeros
    for (let j = i; j < blockLen; j++) buffer[j] = 0;
    // NOTE: sha512 requires length to be 128bit integer, but length in JS will overflow before that
    // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
    // So we just write lowest 64bit of that value.
    view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE);
    this._process(view, 0);
  }
  _writeDigest(out: Uint8Array) {
    if (this.cleaned) throw new Error('Hash instance cleaned');
    this._finish();
    const view = createView(out);
    this._get().forEach((v, i) => view.setUint32(4 * i, v, this.isLE));
  }
  digest() {
    const { buffer, outputLen } = this;
    this._writeDigest(buffer);
    const res = buffer.slice(0, outputLen);
    if (this.opts.cleanup) this.clean();
    return res;
  }
}