/**
 * The DynaMo BLE wire protocol.
 *
 * Reverse-engineered from the official DynaMo 1.10.2 Android app; the full
 * write-up is in PROTOCOL.md at the root of this repository. This file is the
 * bytes only — framing, checksums and the byte reader. Nothing here knows what
 * a grip test is.
 *
 * Everything is little-endian unless a comment says otherwise.
 */

export const SERVICE_UUID = "569a1101-b87f-490c-92cb-11ed6a12fc81";
/** NOTIFY, device to app. */
export const READ_UUID = "569a2000-b87f-490c-92cb-11ed6a12fc81";
/** WRITE, app to device. */
export const WRITE_UUID = "569a2001-b87f-490c-92cb-11ed6a12fc81";

const STX = 0x02;
const ETX = 0x03;

export const CMD = {
  ReqVersion: 0,
  AnsVersion: 1,
  Stop: 4,
  Stopped: 5,
  Ack: 9,
  Nack: 10,
  KeepTestAlive: 16,
  ZeroCal: 19,
  GetSerialNo: 29,
  AnsSerialNo: 30,
  ReqPlatformTable: 36,
  AnsPlatformTable: 37,
  GetPowerStatus: 58,
  AnsPowerStatus: 59,
  ConfigureChannels: 80,
  AnsConfigureChannels: 81,
  DataStreamCheck: 82,
  StartMeasureCompact: 83,
  SetTest: 84,
  DeviceEvent: 85,
  SetDisplayUnits: 86,
  /** Not a device command. "Give me whatever arrives next." */
  Any: 255,
} as const;

export const CMD_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CMD).map(([k, v]) => [v, k]),
);

/** Channel types. 0.5 N per count on Grip and Max, 0.1 N on the rest. */
export const FORCE_PRIMARY = 1;
export const FORCE_PRIMARY_05N = 33;
/**
 * The orientation channel every range-of-motion test uses: a unit quaternion
 * as x, y, z at 1e-4 per count, w implied. Three int16 on a full packet, three
 * int8 deltas on a delta packet. Always 225 Hz — the app hard-codes it.
 */
export const IMU_QUATERNIONS_6DOF = 18;
export const ROM_FREQUENCY = 225;

export const DEVICE_TYPES: Record<string, string> = {
  DYNO: "DynaMo",
  DYNL: "DynaMo Lite",
  DYNH: "DynaMo Home",
  DYNM: "DynaMo Max",
  DYNG: "DynaMo Grip",
};

export const ACCESSORIES: Record<number, string> = {
  0: "none",
  1: "curved pad",
  2: "flat pad",
  3: "palm pad",
  4: "tension link",
  5: "grip inner",
  6: "grip outer",
};

/** Standard gravity. The device measures newtons; people read kilograms. */
export const G = 9.80665;

/** Sampling rates the firmware accepts, by family. */
export const FREQUENCIES = {
  gripOrMax: [150, 250, 300, 500, 600, 1000, 1200],
  other: [50, 100, 200, 225],
} as const;

export interface Packet {
  cmd: number;
  data: Uint8Array;
}

/**
 * Frame one command.
 *
 * `[STX][2|plate<<2][cmd][len][data...][checksum][ETX]`, where the checksum is
 * the one's complement of the sum of everything from `cmd` to the last data
 * byte. A DynaMo is always plate 0.
 */
export function buildPacket(cmd: number, data: Uint8Array = new Uint8Array(0), plate = 0): Uint8Array {
  const p = new Uint8Array(6 + data.length);
  p[0] = STX;
  p[1] = 2 | (plate << 2);
  p[2] = cmd;
  p[3] = data.length;
  p.set(data, 4);
  let sum = 0;
  for (let i = 2; i < 4 + data.length; i++) sum += p[i]!;
  p[4 + data.length] = ~sum & 0xff;
  p[5 + data.length] = ETX;
  return p;
}

export { STX, ETX };

/** CRC16-CCITT, poly 0x1021, init 0xFFFF. Guards the compact stream. */
const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = 0;
    let v = i << 8;
    for (let j = 0; j < 8; j++) {
      c = (c ^ v) & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
      v = (v << 1) & 0xffff;
    }
    t.push(c);
  }
  return t;
})();

export function crc16(crc: number, bytes: Uint8Array): number {
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >> 8) ^ b) & 0xff]!) & 0xffff;
  return crc;
}

/**
 * A byte queue fed by BLE notifications and read by the parser.
 *
 * Notifications are arbitrary chunks and a packet can span several of them, so
 * nothing may assume a notification is a message. Readers wait for the number
 * of bytes they need; a wait that outlives its timeout throws rather than
 * hanging, because a stalled reader at a stall looks exactly like a broken
 * device and the operator needs to be told which it is.
 */
export class ByteStream {
  private buf: number[] = [];
  private waiters: (() => void)[] = [];

  feed(bytes: Uint8Array): void {
    for (const b of bytes) this.buf.push(b);
    const waiting = this.waiters;
    this.waiters = [];
    for (const wake of waiting) wake();
  }

  clear(): void {
    this.buf.length = 0;
  }

  get available(): number {
    return this.buf.length;
  }

  private async waitFor(n: number, timeoutMs: number): Promise<void> {
    const started = performance.now();
    while (this.buf.length < n) {
      if (performance.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for ${n} bytes from the device.`);
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 20);
      });
    }
  }

  async read(n: number, timeoutMs = 5000): Promise<Uint8Array> {
    await this.waitFor(n, timeoutMs);
    return Uint8Array.from(this.buf.splice(0, n));
  }

  async peek(timeoutMs = 5000): Promise<number> {
    await this.waitFor(1, timeoutMs);
    return this.buf[0]!;
  }
}
