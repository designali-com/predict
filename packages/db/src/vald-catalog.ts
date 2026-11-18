/**
 * The DynaMo tests the clinic runs itself, over Bluetooth, from a patient's
 * Exercise & VALD tab.
 *
 * The full catalogue lives in the database (vald_test_type, see
 * ./vald-test-types.ts) — every DynaMo test, with VALD's steps and video,
 * which the clinic can switch off, edit and add to. VALD_TESTS below is the
 * original short list: what the picker falls back to before the catalogue has
 * loaded, and the keys prescriptions were first written with.
 *
 * Region, category, movement and position are VALD's own identifiers, copied
 * from the DynaMo app's catalogue (default_valid_configurations_all_devices
 * .json in the decompiled app). That is deliberate: a test run here is filed
 * in vald_test beside the ones synced from VALD's cloud, and the history groups
 * by region + movement, so the names must match for both to land on one trend.
 *
 * Pure data — safe in the browser.
 */

export type ValdKind = "force" | "rom";

export interface ValdTestDef {
  /** Stable key, stored on a prescription line (ProtocolExercise.vald). */
  key: string;
  /** What the doctor reads. */
  label: string;
  /** VALD's body region: Shoulder, Knee, Hand, Elbow, Hip, Neck… */
  region: string;
  /** VALD spells it "RangeofMotion" in the catalogue and the API. */
  category: "Strength" | "RangeofMotion";
  movement: string;
  position: string;
  positionLabel: string;
  kind: ValdKind;
  /**
   * Added to a ROM result, as the DynaMo app does (RomOffsetService): knee and
   * elbow extension are measured from 90° flexion, so −90 there, 0 elsewhere.
   */
  romOffsetDegrees: number;
  /** DynaMo Grip has only the grip squeeze; the rest need a DynaMo / Max. */
  gripDeviceOk: boolean;
  /** How to set the patient up — shown beside the runner. */
  setup: string;
  /** "Bilateral" — a left and a right; "None" — one measurement (neck, trunk). */
  laterality?: "Bilateral" | "None";
  /** The how-to video, shown before the test is run. */
  videoUrl?: string | null;
  /** "vald" | "clinic" */
  videoSource?: string | null;
  /** Where the steps and video came from. */
  sourceUrl?: string | null;
  /** First in the picker. */
  featured?: boolean;
  active?: boolean;
  /** "vald" for the seeded catalogue, "clinic" for one the clinic added. */
  origin?: string;
}

/** Shape of a test key — a prescription line may name a test the catalogue adds later. */
export const isValdTestKey = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9-]{1,80}$/.test(v);

const force = (
  key: string,
  label: string,
  region: ValdTestDef["region"],
  movement: string,
  position: string,
  positionLabel: string,
  setup: string,
): ValdTestDef => ({
  key,
  label,
  region,
  category: "Strength",
  movement,
  position,
  positionLabel,
  kind: "force",
  romOffsetDegrees: 0,
  gripDeviceOk: movement === "GripSqueeze",
  setup,
});

const rom = (
  key: string,
  label: string,
  region: ValdTestDef["region"],
  movement: string,
  position: string,
  positionLabel: string,
  setup: string,
  romOffsetDegrees = 0,
): ValdTestDef => ({
  key,
  label,
  region,
  category: "RangeofMotion",
  movement,
  position,
  positionLabel,
  kind: "rom",
  romOffsetDegrees,
  gripDeviceOk: false,
  setup,
});

export const VALD_TESTS: ValdTestDef[] = [
  // Shoulder — strength
  force("shoulder-extension-standing", "Shoulder extension", "Shoulder", "Extension", "Standing", "Standing",
    "Standing, arm by the side. Pad behind the wrist; the patient pushes the arm backwards against it."),
  force("shoulder-abduction-standing-ll", "Shoulder abduction (long lever)", "Shoulder", "Abduction", "StandingLongLever", "Standing (Long Lever)",
    "Standing, elbow straight. Pad on the outside of the wrist; the patient lifts the arm out to the side against it."),
  force("shoulder-abduction-standing-sl", "Shoulder abduction (short lever)", "Shoulder", "Abduction", "StandingShortLever", "Standing (Short Lever)",
    "Standing, elbow bent to 90°. Pad on the outside of the elbow; the patient lifts the arm out to the side against it."),
  force("shoulder-flexion-standing", "Shoulder flexion", "Shoulder", "Flexion", "Standing", "Standing",
    "Standing, arm by the side. Pad in front of the wrist; the patient pushes the arm forwards against it."),
  // Shoulder — range of motion
  rom("shoulder-extension-rom", "Shoulder extension ROM", "Shoulder", "Extension", "Standing", "Standing",
    "Device strapped to the forearm. Arm by the side, hold still, then take the arm as far back as it goes."),
  rom("shoulder-abduction-rom", "Shoulder abduction ROM", "Shoulder", "Abduction", "Standing", "Standing",
    "Device strapped to the forearm. Arm by the side, hold still, then raise the arm out to the side as far as it goes."),
  rom("shoulder-flexion-rom", "Shoulder flexion ROM", "Shoulder", "Flexion", "Standing", "Standing",
    "Device strapped to the forearm. Arm by the side, hold still, then raise the arm forwards and up as far as it goes."),
  rom("shoulder-external-rotation-rom", "Shoulder external rotation ROM", "Shoulder", "ExternalRotation", "StandingElbow90Degrees", "Standing (Elbow 90°)",
    "Elbow at the side bent to 90°, device on the forearm. Hold still, then rotate the forearm outwards as far as it goes."),
  // Knee — strength
  force("knee-extension-seated", "Knee extension (quadriceps)", "Knee", "Extension", "Seated", "Seated",
    "Seated, knee bent over the edge. Pad on the front of the shin above the ankle; the patient straightens the knee against it."),
  force("knee-flexion-prone", "Knee flexion (hamstrings)", "Knee", "Flexion", "Prone", "Prone",
    "Lying face down. Pad behind the ankle; the patient bends the knee against it."),
  // Knee — range of motion
  rom("knee-flexion-rom", "Knee flexion ROM", "Knee", "Flexion", "Prone", "Prone",
    "Lying face down, device strapped to the shin. Hold the leg still, then bend the knee as far as it goes."),
  rom("knee-extension-rom", "Knee extension ROM", "Knee", "Extension", "Seated", "Seated",
    "Seated, knee at 90°, device strapped to the shin. Hold still, then straighten the knee as far as it goes. Reads 0° at full extension.",
    -90),
  // Hand
  force("grip-squeeze", "Grip strength", "Hand", "GripSqueeze", "Neutral", "Neutral",
    "Seated, elbow at the side bent to 90°. Squeeze as hard as possible."),
];

export function valdTestDef(key: string): ValdTestDef | undefined {
  return VALD_TESTS.find((t) => t.key === key);
}

/**
 * vald_test.vald_profile_id for a test run here: the patient's own test id,
 * made from their patient code. No VALD account is involved — the column is
 * required, and this says plainly whose test it is.
 */
export const localValdProfileId = (patientCode: string) => `PRD-${patientCode}`;

/** @deprecated The shared id written by the first version; rows may still carry it. */
export const LOCAL_VALD_PROFILE = "predict-local";
