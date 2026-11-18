"use client"

/**
 * The Predict EMG armband (NPG Lite, 3 channels at 500 Hz) over Web Bluetooth.
 *
 * Same GATT layout and start sequence as the band's own apps (EMG-band repo,
 * desktop/src/signal/transport/webBluetoothTransport.ts):
 *   DATA notifications on, CONTROL "WHORU" then "START", battery read once.
 * DATA arrives as 70-byte notifications, 10 samples each of
 *   [u8 counter][u16 BE ch0][u16 BE ch1][u16 BE ch2]
 * — raw 12-bit ADC codes. The u8 counter is unrolled to a rising sample index
 * so lost notifications show as gaps rather than squeezing time.
 *
 * A dropped link is reconnected to the same band without the chooser, and
 * START sent again; the counter restarts at 0 then, so the next samples join
 * after a gap.
 */

export const EMG_SERVICE = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
const EMG_DATA = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
const EMG_CONTROL = "0000ff01-0000-1000-8000-00805f9b34fb"
const EMG_BATTERY = "f633d0ec-46b4-43c1-a39f-1ca06d0602e1"

export const EMG_HZ = 500
export const EMG_CHANNELS = 3
/** Codes at rest: the ADC's mid-rail, where an unloaded input sits. */
export const MID_RAIL = 1596
/** At or past these the amplifier is saturated — the sample means nothing. */
export const CLIP_LOW = 60
export const CLIP_HIGH = 2450
/** Nominal input-referred µV per code (gain 50, not calibrated per band). */
export const UV_PER_CODE = 0.68

const RETRY_MS = [500, 1000, 2000, 4000, 8000]

export function emgSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator
}

/** Counter unwrap, as sampleCounterTracker.ts: +1 ok, +2..128 a gap, 0 or >128 a duplicate / stale one. */
class CounterTracker {
  private last: number | null = null
  /** The next sample after a restart lands here — after the gap the outage left. */
  private base = 0
  push(counter: number): { index: number; missing: number } | null {
    const c = counter & 0xff
    if (this.last === null) {
      this.last = this.base + c
      return { index: this.last, missing: 0 }
    }
    const delta = (c - (this.last % 256) + 256) % 256
    if (delta === 0 || delta > 128) return null
    this.last += delta
    return { index: this.last, missing: delta - 1 }
  }
  /** START again: the band's counter is back at 0, keep ours rising past `afterIndex`. */
  restart(afterIndex: number) {
    this.base = afterIndex + 1
    this.last = null
  }
  get lastIndex() {
    return this.last ?? this.base - 1
  }
}

export interface EmgChunk {
  /** Unrolled sample index of each sample (500 per second). */
  index: number[]
  /** Raw ADC codes per channel, same length as `index`. */
  codes: [number[], number[], number[]]
  /** Samples the counter says were lost before this chunk. */
  missing: number
  /** Host clock (performance.now) when the notification arrived — lines two bands up. */
  hostMs: number
}

export class EmgBand {
  private device: BluetoothDevice | null = null
  private data: BluetoothRemoteGATTCharacteristic | null = null
  private control: BluetoothRemoteGATTCharacteristic | null = null
  private tracker = new CounterTracker()
  private wanted = false
  private reconnecting = false
  /** When the link dropped — the outage is counted as missing samples so time stays true. */
  private droppedAt: number | null = null

  name = ""
  /** The browser's id for this band — the same band can't be connected twice. */
  get id() {
    return this.device?.id ?? ""
  }
  batteryPercent: number | null = null
  /** Received per channel, and lost per the counter, since connect. */
  received = 0
  missing = 0

  onChunk: ((chunk: EmgChunk) => void) | null = null
  /** Link state changes: connected, reconnecting, or gone for good. */
  onState: ((state: "connected" | "reconnecting" | "lost") => void) | null = null

  get connected() {
    return !!this.device?.gatt?.connected && !!this.data
  }

  /** Opens the chooser. Must be called straight from a click. */
  async connect(taken: string[] = []): Promise<void> {
    if (!emgSupported()) throw new Error("This browser has no Bluetooth. Use Chrome or Edge on a laptop.")
    const device = await navigator.bluetooth!.requestDevice({
      filters: [{ namePrefix: "NPG" }, { services: [EMG_SERVICE] }],
      optionalServices: [EMG_SERVICE],
    })
    if (taken.includes(device.id)) throw new Error("That band is already connected. Connect again and choose the other one.")
    // The 6-channel band streams a different packet and needs its own montage.
    if (/NPG-?Lite-?6/i.test(device.name ?? "")) throw new Error("That is a 6-channel band. Connect the 3-channel EMG band.")
    this.device = device
    this.name = device.name ?? "EMG band"
    this.wanted = true
    device.addEventListener("gattserverdisconnected", this.onDrop)
    await this.link()
  }

  private onNotify = (event: Event) => {
    const view = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (!view) return
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    // 3-channel samples are 7 bytes; a 13-byte packet is the 6-channel band.
    if (bytes.length % 7 !== 0 || bytes.length === 0) return
    const chunk: EmgChunk = { index: [], codes: [[], [], []], missing: 0, hostMs: performance.now() }
    for (let o = 0; o + 7 <= bytes.length; o += 7) {
      const got = this.tracker.push(bytes[o]!)
      if (!got) continue
      chunk.missing += got.missing
      chunk.index.push(got.index)
      chunk.codes[0].push((bytes[o + 1]! << 8) | bytes[o + 2]!)
      chunk.codes[1].push((bytes[o + 3]! << 8) | bytes[o + 4]!)
      chunk.codes[2].push((bytes[o + 5]! << 8) | bytes[o + 6]!)
    }
    if (!chunk.index.length) return
    this.received += chunk.index.length
    this.missing += chunk.missing
    this.onChunk?.(chunk)
  }

  private async link(): Promise<void> {
    const gatt = await this.device!.gatt!.connect()
    const service = await gatt.getPrimaryService(EMG_SERVICE)
    const data = await service.getCharacteristic(EMG_DATA)
    data.addEventListener("characteristicvaluechanged", this.onNotify)
    await data.startNotifications()
    const control = await service.getCharacteristic(EMG_CONTROL)
    await this.write(control, "WHORU")
    // START puts the band's counter back to 0. After an outage, skip the samples it cost.
    const lost = this.droppedAt === null ? 0 : Math.round(((performance.now() - this.droppedAt) / 1000) * EMG_HZ)
    this.droppedAt = null
    this.missing += lost
    this.tracker.restart(this.tracker.lastIndex + lost)
    await this.write(control, "START")
    this.data = data
    this.control = control
    try {
      const battery = await service.getCharacteristic(EMG_BATTERY)
      const v = await battery.readValue()
      this.batteryPercent = v.getUint8(0)
    } catch {
      // Older firmware has no battery characteristic.
    }
    this.onState?.("connected")
  }

  private async write(char: BluetoothRemoteGATTCharacteristic, text: string) {
    const bytes = new TextEncoder().encode(text)
    if (char.writeValueWithResponse) await char.writeValueWithResponse(bytes)
    else await char.writeValue(bytes)
  }

  private onDrop = () => {
    this.data = null
    this.control = null
    if (!this.wanted || this.reconnecting) return
    this.droppedAt = performance.now()
    void this.reconnectLoop()
  }

  private async reconnectLoop() {
    this.reconnecting = true
    this.onState?.("reconnecting")
    for (const wait of RETRY_MS) {
      await new Promise((r) => setTimeout(r, wait))
      if (!this.wanted) break
      try {
        await this.link()
        this.reconnecting = false
        return
      } catch {
        // Not back yet.
      }
    }
    this.reconnecting = false
    if (this.wanted) {
      this.wanted = false
      this.onState?.("lost")
    }
  }

  /** STOP the stream and let the link go. */
  async disconnect(): Promise<void> {
    this.wanted = false
    const control = this.control
    try {
      if (control && this.device?.gatt?.connected) await this.write(control, "STOP")
    } catch {
      // Gone already.
    }
    this.data?.removeEventListener("characteristicvaluechanged", this.onNotify)
    this.device?.removeEventListener("gattserverdisconnected", this.onDrop)
    this.device?.gatt?.disconnect()
    this.data = null
    this.control = null
  }
}
