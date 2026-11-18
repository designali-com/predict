/**
 * Talking to a DynaMo over Web Bluetooth.
 *
 * This replaces the VALD phone app and the VALD cloud entirely: the stall's
 * browser connects to the device, runs the squeeze, and reads the force stream
 * itself. Nothing leaves the laptop until a result is saved.
 *
 * Web Bluetooth only exists in a secure context, so this runs on https:// or
 * on localhost and nowhere else. `isSupported()` is the check to make before
 * showing any of it.
 */
import {
  ACCESSORIES,
  ByteStream,
  CMD,
  CMD_NAMES,
  DEVICE_TYPES,
  FORCE_PRIMARY_05N,
  FREQUENCIES,
  IMU_QUATERNIONS_6DOF,
  ROM_FREQUENCY,
  READ_UUID,
  SERVICE_UUID,
  STX,
  WRITE_UUID,
  buildPacket,
  crc16,
  type Packet,
} from "./protocol";

export interface DeviceInfo {
  device?: string;
  version?: string;
  serial?: string;
  battery?: string;
  accessoryLeft?: string;
  accessoryRight?: string;
}

interface ChannelConfig {
  baseIntervalUs: number;
  channelType: number;
  interval: number;
  /** Values per sample: 1 for force, 3 for a quaternion's x, y, z. */
  components: number;
  lastRaw: number[];
  /** Units per raw count: newtons for force, quaternion units for the IMU. */
  scale: number;
}

/** What one measurement streams: which channel, how fast. */
interface StreamSpec {
  channelType: number;
  freqHz: number;
  /** Framed DataStreamCheck every this many packets. */
  checkPacketCount: number;
}

/** Is Web Bluetooth available at all? False on iOS, Safari, and plain http. */
export function isSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export class DynaMo {
  private stream = new ByteStream();
  private device: BluetoothDevice | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;

  info: DeviceInfo = {};
  /** Grip and Max sample far faster than the older families. */
  isGripOrMax = false;
  onDisconnected?: () => void;
  onLog?: (line: string) => void;
  /**
   * Set when the device told us it was switching off, so a dropped link can be
   * reported as what it was rather than as a mystery.
   */
  lastPowerOff: "user" | "idle" | null = null;

  private idleTimer: ReturnType<typeof setInterval> | null = null;
  /** True while measure() owns the byte stream. Nothing else may read it. */
  private measuring = false;

  private log(line: string): void {
    this.onLog?.(line);
  }

  get connected(): boolean {
    return !!this.device?.gatt?.connected;
  }

  /**
   * Keep talking to the device between tests.
   *
   * Nothing was sent at all from the end of setup until somebody pressed Start,
   * and a DynaMo that hears nothing does not wait around — it drops the link,
   * or powers itself off, within seconds. At a stall that read as "connect once
   * per person", which is exactly what connecting once was meant to avoid.
   *
   * KeepTestAlive is the right thing to send: the firmware defines no response
   * to it, so a heartbeat can never leave a reply sitting in the stream for the
   * next measurement to trip over.
   *
   * This also drains whatever the device sent us unasked. While idle nobody is
   * reading, so a power-off warning or an accessory change would otherwise pile
   * up in the buffer, unseen, and desynchronise the next test.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.idleTimer = setInterval(() => {
      if (this.measuring || !this.connected) return;
      void this.heartbeat();
    }, 3000);
  }

  private stopHeartbeat(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
  }

  private async heartbeat(): Promise<void> {
    try {
      await this.send(CMD.KeepTestAlive);
      // Read anything already waiting, and never block: a heartbeat that sits
      // waiting for bytes would still be waiting when the next one fires.
      while (!this.measuring && this.stream.available >= 6) {
        const packet = await this.readPacket(CMD.Any, 200);
        if (packet.cmd === CMD.DeviceEvent) this.handleEvent(packet.data);
      }
    } catch {
      // A partial frame or a byte we cannot place. The buffer is worthless
      // either way and a measurement clears it before starting, so drop it
      // rather than carry it forward.
      this.stream.clear();
    }
  }

  /** A DynaMo Grip: a grip squeeze and nothing else (no pads, no ROM). */
  get isGripOnly(): boolean {
    return /^DYNG/i.test(this.info.version ?? "");
  }

  /** The rates this device's firmware will accept. */
  get frequencies(): readonly number[] {
    return this.isGripOrMax ? FREQUENCIES.gripOrMax : FREQUENCIES.other;
  }

  /**
   * Opens the browser's device chooser, so it must be called from a click.
   * A chooser opened from a timer or an effect is blocked by the browser.
   */
  async connect(): Promise<void> {
    if (!isSupported()) {
      throw new Error("This browser cannot do Bluetooth. Use Chrome, over https or localhost.");
    }
    this.device = await navigator.bluetooth!.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
    });
    this.device.addEventListener("gattserverdisconnected", () => {
      this.stopHeartbeat();
      // A disconnect we asked for is not a dropped link.
      if (!this.leaving) this.onDisconnected?.();
    });
    await this.openLink();
  }

  /** Set by disconnect(), so the drop it causes is not reported as a fault. */
  private leaving = false;
  private readonly onValue = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value!;
    this.stream.feed(new Uint8Array(value.buffer));
  };

  private async openLink(): Promise<void> {
    const server = await this.device!.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    this.rx?.removeEventListener("characteristicvaluechanged", this.onValue);
    this.rx = await service.getCharacteristic(READ_UUID);
    this.tx = await service.getCharacteristic(WRITE_UUID);
    this.rx.addEventListener("characteristicvaluechanged", this.onValue);
    await this.rx.startNotifications();
  }

  /**
   * Bring a dropped link back to the same device, with no chooser.
   *
   * The browser lets a page reconnect to a device it was already given without
   * a click, so a DynaMo that blinked out of range for a moment — or went quiet
   * while the patient changed position — comes back by itself instead of the
   * operator starting over. Zeroing is the operator's to redo; it is not
   * repeated silently, because zeroing with a limb on the pad would be wrong.
   */
  async reconnect(): Promise<void> {
    if (!this.device?.gatt) throw new Error("Nothing to reconnect to.");
    this.stream.clear();
    this.lastPowerOff = null;
    await this.openLink();
    await this.initialise();
    try {
      await this.setDisplayUnits(1);
    } catch {
      // The device's own screen only.
    }
  }

  /** Whether the device said it was switching off — then there is nothing to reconnect to. */
  get switchedOff(): boolean {
    return this.lastPowerOff !== null;
  }

  disconnect(): void {
    this.leaving = true;
    this.stopHeartbeat();
    try {
      this.device?.gatt?.disconnect();
    } catch {
      // Already gone. Nothing to do and nothing worth saying.
    }
  }

  private async send(cmd: number, data?: Uint8Array): Promise<void> {
    const packet = buildPacket(cmd, data);
    // Some stacks reject a write-with-response on this characteristic; the
    // write-without-response path is the fallback, not the preference, because
    // a dropped command during setup is silent otherwise.
    //
    // Checked at runtime even though the type says it is always there: the
    // method is newer than the rest of the API and a browser that predates it
    // would throw on the call rather than return undefined.
    const tx = this.tx as BluetoothRemoteGATTCharacteristic & {
      writeValueWithResponse?: (value: BufferSource) => Promise<void>;
    };
    if (typeof tx.writeValueWithResponse === "function") {
      try {
        await tx.writeValueWithResponse(packet as unknown as BufferSource);
        return;
      } catch {
        // fall through
      }
    }
    await tx.writeValue(packet as unknown as BufferSource);
  }

  private async readPacket(expected: number, timeoutMs = 5000): Promise<Packet> {
    for (;;) {
      const header = await this.stream.read(4, timeoutMs);
      if (header[0] !== STX || (header[1]! & 3) !== 2) {
        throw new Error("The device sent a frame this app could not read.");
      }
      const cmd = header[2]!;
      const len = header[3]!;
      const rest = await this.stream.read(len + 2, timeoutMs);
      const data = rest.slice(0, len);
      let sum = header[2]! + header[3]!;
      for (const b of data) sum += b;
      if (rest[len + 1] !== 0x03 || rest[len] !== (~sum & 0xff)) {
        throw new Error("A frame from the device failed its checksum.");
      }
      if (cmd === CMD.Nack) {
        const code = len >= 2 ? data[0]! | (data[1]! << 8) : 0;
        throw new Error(`The device refused that command (0x${code.toString(16)}).`);
      }
      if (expected === CMD.Any || cmd === expected) return { cmd, data };
      // Device events arrive unsolicited, including in the middle of setup.
      if (cmd === CMD.DeviceEvent) {
        this.handleEvent(data);
        continue;
      }
      throw new Error(
        `Expected ${CMD_NAMES[expected] ?? expected} from the device, got ${CMD_NAMES[cmd] ?? cmd}.`,
      );
    }
  }

  private handleEvent(data: Uint8Array): void {
    const view = new DataView(data.buffer, data.byteOffset);
    const type = view.getUint16(0, true);
    const info = view.getUint32(2, true);
    if (type === 10 || type === 11) {
      const name = ACCESSORIES[info & 0xff] ?? `id ${info & 0xff}`;
      if (type === 10) this.info.accessoryLeft = name;
      else this.info.accessoryRight = name;
      this.log(`${type === 10 ? "Left" : "Right"} accessory: ${name}`);
    } else if (type === 20 || type === 21) {
      this.lastPowerOff = type === 20 ? "user" : "idle";
      this.log(
        type === 20 ? "The device was switched off." : "The device switched itself off, idle.",
      );
    }
  }

  /** Identify the device and read its serial, accessories and battery. */
  async initialise(): Promise<void> {
    await this.send(CMD.Stop);
    await new Promise((r) => setTimeout(r, 300));
    this.stream.clear();

    await this.send(CMD.ReqVersion);
    const version = new TextDecoder().decode((await this.readPacket(CMD.AnsVersion)).data);
    const prefix = version.split("-")[0]!.toUpperCase();
    this.info.device = DEVICE_TYPES[prefix] ?? prefix;
    this.info.version = version;
    this.isGripOrMax = /^DYN[GM]/i.test(version);

    await this.send(CMD.GetSerialNo);
    const serial = (await this.readPacket(CMD.AnsSerialNo)).data;
    this.info.serial = String(new DataView(serial.buffer, serial.byteOffset).getUint32(0, true)).padStart(5, "0");

    // The platform table is not ready the instant the link comes up, so this
    // asks until it answers rather than failing the whole connection on the
    // first empty reply.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        await this.send(CMD.ReqPlatformTable);
        if (this.parsePlatformTable((await this.readPacket(CMD.AnsPlatformTable)).data)) break;
      } catch {
        // Not ready. Ask again.
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    try {
      await this.send(CMD.GetPowerStatus);
      const d = (await this.readPacket(CMD.AnsPowerStatus)).data;
      const millivolts = new DataView(d.buffer, d.byteOffset).getInt16(0, true);
      this.info.battery = `${(millivolts / 1000).toFixed(2)} V${d.length >= 6 ? ` (${d[5]}%)` : ""}`;
    } catch {
      // Battery is nice to show and not worth failing a connection over.
    }

    // From here until a measurement starts, this is the only thing keeping the
    // link up.
    this.startHeartbeat();
  }

  private parsePlatformTable(d: Uint8Array): boolean {
    const count = d[0]!;
    if (count < 1 || count > 4) return false;
    const per = Math.floor((d.length - 1) / count);
    if (per < 19) return false;
    const p = d.subarray(1, 1 + per);
    if (per >= 35) {
      this.info.accessoryLeft = ACCESSORIES[p[27]!] ?? `id ${p[27]}`;
      this.info.accessoryRight = ACCESSORIES[p[31]!] ?? `id ${p[31]}`;
    }
    // plateMode 0 is PrimaryOnly, which means the table is complete.
    return p[17] === 0;
  }

  /** 0 newtons, 1 kilograms, 2 pounds. Only changes the device's own screen. */
  async setDisplayUnits(units: 0 | 1 | 2): Promise<void> {
    await this.send(CMD.SetDisplayUnits, Uint8Array.of(units));
    await this.readPacket(CMD.Ack);
  }

  /** What the device shows on its screen during the test. */
  async setTest(title: string, subtitle: string): Promise<void> {
    const enc = new TextEncoder();
    const t = enc.encode(title);
    const s = enc.encode(subtitle);
    await this.send(CMD.SetTest, Uint8Array.of(t.length, ...t, s.length, ...s));
    await this.readPacket(CMD.Ack);
  }

  /**
   * Zero the load cell. Must happen with the hand off the device, and the
   * firmware can take a long time, hence the 30 s allowance.
   */
  async zero(): Promise<void> {
    await this.send(CMD.ZeroCal);
    await this.readPacket(CMD.Ack, 30_000);
  }

  private async configureChannels(spec: StreamSpec): Promise<ChannelConfig> {
    const d = new Uint8Array(5);
    const view = new DataView(d.buffer);
    view.setUint16(0, spec.checkPacketCount, true);
    d[2] = spec.channelType;
    view.setUint16(3, spec.freqHz, true);
    await this.send(CMD.ConfigureChannels, d);
    const r = (await this.readPacket(CMD.AnsConfigureChannels)).data;
    const rv = new DataView(r.buffer, r.byteOffset);
    const imu = r[4] === IMU_QUATERNIONS_6DOF;
    return {
      baseIntervalUs: rv.getUint32(0, true),
      channelType: r[4]!,
      interval: Math.max(1, rv.getUint16(5, true)),
      components: imu ? 3 : 1,
      lastRaw: imu ? [0, 0, 0] : [0],
      scale: imu ? 1e-4 : r[4] === FORCE_PRIMARY_05N ? 0.5 : 0.1,
    };
  }

  /**
   * Run one measurement.
   *
   * Streams force samples to `onSample` until `shouldStop()` returns true, then
   * stops the device and returns. The stream is a mix of unframed compact
   * packets and framed ones, told apart by peeking at the next byte, so the
   * reader must never assume it knows which is coming.
   */
  async measure(
    freqHz: number,
    onSample: (timeSeconds: number, forceNewtons: number) => void,
    shouldStop: () => boolean,
  ): Promise<void> {
    const channelType = this.isGripOrMax ? FORCE_PRIMARY_05N : 1;
    await this.stream_(
      { channelType, freqHz, checkPacketCount: freqHz },
      (t, v) => onSample(t, v[0]!),
      shouldStop,
    );
  }

  /**
   * Run one range-of-motion measurement: the device's orientation as a unit
   * quaternion [w, x, y, z], 225 times a second. No zeroing — the angle is
   * measured from wherever the limb was held still.
   */
  async measureOrientation(
    onSample: (timeSeconds: number, quaternion: [number, number, number, number]) => void,
    shouldStop: () => boolean,
  ): Promise<void> {
    await this.stream_(
      // The app's own check interval: twice the rate, kept within 500–5000.
      { channelType: IMU_QUATERNIONS_6DOF, freqHz: ROM_FREQUENCY, checkPacketCount: 500 },
      (t, [x, y, z]) => {
        // Rounding can push the sum a hair over 1; the root must stay real.
        const w = Math.sqrt(Math.max(0, 1 - x! * x! - y! * y! - z! * z!));
        onSample(t, [w, x!, y!, z!]);
      },
      shouldStop,
    );
  }

  private async stream_(
    spec: StreamSpec,
    onSample: (timeSeconds: number, values: number[]) => void,
    shouldStop: () => boolean,
  ): Promise<void> {
    // The stream is ours from here. The heartbeat reads it too, and two readers
    // on one buffer is how a squeeze turns into a checksum failure.
    this.measuring = true;
    try {
      await this.runMeasurement(spec, onSample, shouldStop);
    } finally {
      this.measuring = false;
    }
  }

  private async runMeasurement(
    spec: StreamSpec,
    onSample: (timeSeconds: number, values: number[]) => void,
    shouldStop: () => boolean,
  ): Promise<void> {
    // Whatever the device said while nobody was listening is of no use now, and
    // a stale byte at the head of the buffer would be read as the first frame
    // of the answer to ConfigureChannels.
    this.stream.clear();
    const cfg = await this.configureChannels(spec);
    await this.send(CMD.StartMeasureCompact);
    await this.readPacket(CMD.Ack);

    let seq = 0;
    let crc = 0xffff;
    let lastTimestamp = 0;
    let stopSent = false;
    let lastKeepAlive = Date.now();
    const flagsLen = (s: number) => (s % cfg.interval === 0 ? 1 : 0);

    for (;;) {
      if (shouldStop() && !stopSent) {
        await this.send(CMD.Stop);
        stopSent = true;
      }
      // The device drops the test if it hears nothing for long enough.
      if (Date.now() - lastKeepAlive >= 5000) {
        await this.send(CMD.KeepTestAlive);
        lastKeepAlive = Date.now();
      }

      let first: number;
      try {
        first = await this.stream.peek(250);
      } catch {
        if (stopSent) return;
        continue;
      }

      if (first === STX) {
        if (this.stream.available < 5) {
          await new Promise((r) => setTimeout(r, 5));
          continue;
        }
        const packet = await this.readPacket(CMD.Any, 10_000);
        if (packet.cmd === CMD.Stopped) return;
        if (packet.cmd === CMD.DataStreamCheck) {
          const dv = new DataView(packet.data.buffer, packet.data.byteOffset);
          const ts = dv.getUint32(0, true);
          const theirs = dv.getUint16(4, true);
          if (ts !== lastTimestamp || theirs !== crc) {
            this.log("A block of samples did not match its checksum.");
          }
          crc = 0xffff;
        } else if (packet.cmd === CMD.DeviceEvent) {
          this.handleEvent(packet.data);
        }
        continue;
      }

      const flags = await this.stream.read(flagsLen(seq), 10_000);
      let f = flags[0]!;
      if ((flags[0]! & 1) && flags.length > 1) f |= flags[1]! << 8;
      f >>= 2;
      const isDelta = (f & 1) !== 0;
      // One flag covers the whole channel: every component is a delta, or none.
      const body = await this.stream.read(cfg.components * (isDelta ? 1 : 2), 10_000);
      crc = crc16(crc, Uint8Array.from([...flags, ...body]));

      for (let c = 0; c < cfg.components; c++) {
        if (isDelta) {
          // int8, added to the running value.
          cfg.lastRaw[c]! += (body[c]! << 24) >> 24;
        } else {
          // int16 LE, absolute.
          cfg.lastRaw[c] = ((body[2 * c]! | (body[2 * c + 1]! << 8)) << 16) >> 16;
        }
      }
      lastTimestamp = seq * cfg.baseIntervalUs;
      onSample(lastTimestamp / 1e6, cfg.lastRaw.map((r) => r * cfg.scale));

      seq++;
      while (flagsLen(seq) === 0) seq++;
    }
  }
}
