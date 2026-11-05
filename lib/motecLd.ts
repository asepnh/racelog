// Writes MoTeC's native .ld log format so a session can be opened directly
// in MoTeC i2 -- no "Import MoTeC CSV Dataset" license needed (that's a
// paid add-on feature in i2 Pro; opening a native .ld file needs nothing
// extra).
//
// The .ld format is undocumented by MoTeC; this is a TypeScript port of
// the byte layout from the open-source ldparser project
// (https://github.com/gotzl/ldparser, GPL-3.0), whose writer the author
// validated by round-tripping files through real MoTeC i2 Pro and
// Assetto Corsa Competizione output. Treat this as a best-effort based on
// that reverse-engineered layout, not an official spec -- if a generated
// file doesn't open, that's the most likely place to look.
//
// Layout (all little-endian, no implicit padding beyond what's listed):
//   ldHead   (1762 bytes) -- fixed offset 0
//   ldEvent  (1154 bytes) -- fixed offset 1762, venue_ptr left at 0 (no
//                            venue/vehicle blocks -- optional, not needed
//                            for i2 to open the file)
//   ldChan[] (124 bytes each) -- one per channel, back-to-back from
//                            offset 2916
//   sample data -- each channel's full array (float32), in the same
//                            order as its metadata block, immediately
//                            after all metadata blocks

const HEAD_SIZE = 1762;
const EVENT_SIZE = 1154;
const CHAN_SIZE = 124;

function writeAsciiField(buf: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, "ascii").subarray(0, length);
  bytes.copy(buf, offset);
}

export interface MotecChannel {
  /** MoTeC channel name, e.g. "Ground Speed" -- truncated to 32 bytes. */
  name: string;
  /** Short name, e.g. "Speed" -- truncated to 8 bytes. */
  shortName: string;
  /** Unit, e.g. "km/h" -- truncated to 12 bytes. */
  unit: string;
  /** Sample rate in Hz. All channels in one file share the layout's
   * sample count, but each declares its own freq field. */
  freq: number;
  /** Values, already resampled to a uniform grid at `freq` and with no
   * nulls/gaps -- .ld has no concept of a missing sample. */
  data: number[];
}

export interface MotecFileInfo {
  driver?: string;
  vehicleId?: string;
  venue?: string;
  shortComment?: string;
  eventName?: string;
  datetime?: Date;
  channels: MotecChannel[];
}

function buildHead(meta_ptr: number, data_ptr: number, event_ptr: number, info: MotecFileInfo, numChans: number): Buffer {
  const buf = Buffer.alloc(HEAD_SIZE);
  buf.writeUInt32LE(0x40, 0); // ldmarker
  buf.writeUInt32LE(meta_ptr, 8);
  buf.writeUInt32LE(data_ptr, 12);
  buf.writeUInt32LE(event_ptr, 36);
  buf.writeUInt16LE(1, 64);
  buf.writeUInt16LE(0x4240, 66);
  buf.writeUInt16LE(0xf, 68);
  buf.writeUInt32LE(0x1f44, 70); // device serial
  writeAsciiField(buf, 74, 8, "ADL"); // device type
  buf.writeUInt16LE(420, 82); // device version
  buf.writeUInt16LE(0xadb0, 84);
  buf.writeUInt32LE(numChans, 86);

  const dt = info.datetime ?? new Date();
  const date = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  const time = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}`;
  writeAsciiField(buf, 94, 16, date);
  writeAsciiField(buf, 126, 16, time);
  writeAsciiField(buf, 158, 64, info.driver ?? "");
  writeAsciiField(buf, 222, 64, info.vehicleId ?? "");
  writeAsciiField(buf, 350, 64, info.venue ?? "");
  buf.writeUInt32LE(0xc81a4, 1502); // "pro logging" magic
  writeAsciiField(buf, 1572, 64, info.shortComment ?? "");
  return buf;
}

function buildEvent(name: string): Buffer {
  const buf = Buffer.alloc(EVENT_SIZE);
  writeAsciiField(buf, 0, 64, name);
  writeAsciiField(buf, 64, 64, "0"); // session
  writeAsciiField(buf, 128, 1024, "");
  buf.writeUInt16LE(0, 1152); // venue_ptr -- no venue block
  return buf;
}

function buildChanMeta(
  index: number,
  prevPtr: number,
  nextPtr: number,
  dataPtr: number,
  dataLen: number,
  freq: number,
  name: string,
  shortName: string,
  unit: string
): Buffer {
  const buf = Buffer.alloc(CHAN_SIZE);
  buf.writeUInt32LE(prevPtr, 0);
  buf.writeUInt32LE(nextPtr, 4);
  buf.writeUInt32LE(dataPtr, 8);
  buf.writeUInt32LE(dataLen, 12);
  buf.writeUInt16LE((0x2ee1 + index) & 0xffff, 16); // counter
  buf.writeUInt16LE(0x07, 18); // dtype_a: float
  buf.writeUInt16LE(4, 20); // dtype: 4 bytes -> float32
  buf.writeUInt16LE(freq, 22);
  buf.writeInt16LE(0, 24); // shift
  buf.writeInt16LE(1, 26); // mul
  buf.writeInt16LE(1, 28); // scale
  buf.writeInt16LE(0, 30); // dec
  writeAsciiField(buf, 32, 32, name);
  writeAsciiField(buf, 64, 8, shortName);
  writeAsciiField(buf, 72, 12, unit);
  return buf;
}

export function buildLdFile(info: MotecFileInfo): Buffer {
  const channels = info.channels;
  const n = channels.length;

  const metaPtrBase = HEAD_SIZE + EVENT_SIZE; // 2916
  const eventPtr = HEAD_SIZE;
  let dataPtr = metaPtrBase + n * CHAN_SIZE;

  const metaBuffers: Buffer[] = [];
  const dataBuffers: Buffer[] = [];

  for (let i = 0; i < n; i++) {
    const ch = channels[i];
    const prevPtr = i > 0 ? metaPtrBase + (i - 1) * CHAN_SIZE : 0;
    const nextPtr = i < n - 1 ? metaPtrBase + (i + 1) * CHAN_SIZE : 0;

    metaBuffers.push(
      buildChanMeta(i, prevPtr, nextPtr, dataPtr, ch.data.length, ch.freq, ch.name, ch.shortName, ch.unit)
    );

    const arr = new Float32Array(ch.data);
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    dataBuffers.push(buf);
    dataPtr += buf.length;
  }

  const head = buildHead(metaPtrBase, metaPtrBase + n * CHAN_SIZE, eventPtr, info, n);
  const event = buildEvent(info.eventName ?? "session");

  return Buffer.concat([head, event, ...metaBuffers, ...dataBuffers]);
}
