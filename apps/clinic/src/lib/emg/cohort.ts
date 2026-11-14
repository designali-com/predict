/**
 * "Cohort 3 Basics": the two-band battery the EMG-band dashboard runs
 * (dashboard/js/protocol.js COHORT, research/plan/cohort3_basics_review.md §5),
 * ported phase for phase — same tasks, order, durations, cues, go tones and
 * the numbers the operator types in. The figure poses and simulated drive
 * arrays of the original are left out: they only animate the dashboard's
 * mannequin.
 *
 * Upper limb: one band on the upper arm and one on the forearm.
 * Lower limb: one band on the thigh and one on the shank.
 *
 * Band sites and which muscle each channel records (dashboard/js/placement.js
 * SITES and allocate) are below.
 */

export type SiteId = "ua" | "fa" | "th" | "sh"

export interface CohortPhase {
  id: string
  durationSec: number
  cue: string
  /** "rest" phases are where the quiet floor is read; "effort" phases are the work. */
  effort: "rest" | "effort"
  /** The one distinct tone of the task plays at the start of this phase. */
  go?: boolean
}

export interface CohortEntry {
  id: string
  label: string
  unit?: string
  max?: number
  options?: string[]
}

export interface CohortTask {
  id: string
  name: string
  order: string
  limb: "upper" | "lower"
  tempo: string
  /** The band whose signal the task is read on. */
  compare: SiteId
  devices: SiteId[]
  props: string[]
  optional?: boolean
  /** Walking course in metres, when there is one. */
  course?: number
  entries: CohortEntry[]
  script: string[]
  phases: CohortPhase[]
}

export interface CohortLimb {
  id: "upper" | "lower"
  name: string
  bands: string
  tasks: CohortTask[]
}

// ── Builders (as protocol.js) ────────────────────────────────────────────────

const hold = (id: string, durationSec: number, cue: string, effort: "rest" | "effort" = "rest"): CohortPhase => ({ id, durationSec, cue, effort })
const move = (id: string, durationSec: number, cue: string): CohortPhase => ({ id, durationSec, cue, effort: "effort" })
const gait = (id: string, durationSec: number, cue: string): CohortPhase => ({ id, durationSec, cue, effort: "effort" })
const standUp = (id: string, durationSec: number, cue: string): CohortPhase => ({ id, durationSec, cue, effort: "effort" })
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/**
 * Cued trials: each waits at rest for its foreperiod (a different wait every
 * time, so the tone can't be guessed), moves on the go tone, then holds. With
 * `lastHold` the final trial keeps holding that long.
 */
function cuedTrials(o: { stem: string; waits: number[]; moveSec: number; holdSec: number; lastHold?: number; cue: string; holdCue: string; lastCue?: string }): CohortPhase[] {
  return o.waits.flatMap((wait, i) => {
    const n = i + 1
    const last = i === o.waits.length - 1 && o.lastHold
    return [
      hold(`${o.stem}-wait-${n}`, wait, "Rest. Wait for the tone."),
      { ...move(`${o.stem}-${n}`, o.moveSec, o.cue), go: true },
      last ? hold(`${o.stem}-hold-long`, o.lastHold!, o.lastCue ?? o.holdCue, "effort") : hold(`${o.stem}-hold-${n}`, o.holdSec, o.holdCue, "effort"),
    ]
  })
}

const WAITS_ELBOW = [5, 3.5, 7.5, 4, 6.5]
const WAITS_KNEE = [4.5, 7, 3.5, 6, 5]
const WAITS_ANKLE = [6.5, 3.5, 5.5, 8, 4]
const WAITS_START = [4, 6.5]
const NO_BLUETOOTH = "Play the tones through the computer's own or wired speakers. Bluetooth speakers and headphones delay the tone by about 0.16 s."
const ELDER_STOP = "Stop for pain, dizziness, or if you need to hold the chair. This recording does not diagnose anything. Battery only while a band is on the skin."
const ARM: SiteId[] = ["ua", "fa"]
const LEG: SiteId[] = ["th", "sh"]

// ── The battery ──────────────────────────────────────────────────────────────

export const COHORT: { id: string; name: string; limbs: CohortLimb[] } = {
  id: "cohort-3-basics",
  name: "Cohort 3 Basics",
  limbs: [
    {
      id: "upper",
      name: "Upper limb",
      bands: "One band on the upper arm and one on the forearm.",
      tasks: [
        {
          id: "c3-ua-rest",
          name: "Seated rest",
          order: "1",
          limb: "upper",
          tempo: "Sit still for 30 seconds.",
          compare: "ua",
          devices: ARM,
          props: ["chair"],
          entries: [],
          script: [
            "One band on the upper arm and one on the forearm.",
            "Sit back in the chair with the forearms on the lap. Do nothing for 30 seconds.",
            "This is the quiet reference for the arm muscles and for the tilt of the upper arm and forearm.",
            ELDER_STOP,
          ],
          phases: [hold("still", 30, "Sit still. Breathe normally.")],
        },
        {
          id: "c3-ua-elbow",
          name: "Cued elbow bends, then a hold",
          order: "2",
          limb: "upper",
          tempo: "On each tone, bend the elbow to 90 degrees. Five times; hold the fifth for up to 60 seconds.",
          compare: "ua",
          devices: ARM,
          props: ["chair"],
          entries: [
            { id: "hold_s", label: "Fifth bend held", unit: "s", max: 60 },
            { id: "wrist_kg", label: "Wrist weight (0 if none)", unit: "kg", max: 3 },
          ],
          script: [
            "Sit with the forearm on the thigh, palm up. Listen for the tone. The wait before it changes every time, so there is no need to guess.",
            "On each tone, bend the elbow to about 90 degrees and hold for 2 seconds, then rest the arm on the thigh.",
            "On the fifth tone, keep holding for up to 60 seconds. Say stop when you need to. Type the seconds held below.",
            "Optional: a 0.5 to 1 kg wrist weight for the whole task makes the hold easier to read. Note it below.",
            NO_BLUETOOTH,
            ELDER_STOP,
          ],
          phases: [
            ...cuedTrials({
              stem: "bend",
              waits: WAITS_ELBOW,
              moveSec: 1.5,
              holdSec: 2,
              lastHold: 60,
              cue: "Bend the elbow and hold.",
              holdCue: "Hold.",
              lastCue: "Keep holding. Say stop when you need to.",
            }),
            hold("lower", 4, "Lower the arm and rest."),
          ],
        },
        {
          id: "c3-ua-grip",
          name: "Grip squeeze",
          order: "3",
          limb: "upper",
          tempo: "Squeeze as hard as you can for 3 seconds, three times, with 30 seconds of rest.",
          compare: "fa",
          devices: ARM,
          props: ["chair", "dynamometer"],
          entries: range(3).map((n) => ({ id: `grip_kg_${n}`, label: `Squeeze ${n}`, unit: "kg", max: 90 })),
          script: [
            "Sit with the upper arm by the side, the elbow at 90 degrees and the wrist straight.",
            "Squeeze the hand dynamometer as hard as you can for 3 seconds. Breathe out while you squeeze. Three times, with 30 seconds of rest between.",
            "Type the kilograms after each squeeze. Both bands stay on.",
            ELDER_STOP,
          ],
          phases: range(3).flatMap((n) => [
            hold(`squeeze-${n}`, 3, "Squeeze and hold.", "effort"),
            hold(`rest-${n}`, 30, "Rest the hand. Type the kilograms."),
          ]),
        },
        {
          id: "c3-ua-reach",
          name: "Seated reach and raise",
          order: "4",
          limb: "upper",
          tempo: "Five reaches to shoulder height, two slow raises as high as is comfortable, then two full elbow bends.",
          compare: "ua",
          devices: ARM,
          props: ["chair", "target"],
          entries: [{ id: "pods_touched", label: "Bands touched at the full bend", options: ["No", "Yes"] }],
          script: [
            "Sit. Reach from the lap to the mark at shoulder height and back, five times, at your own pace.",
            "Then raise the arm slowly, as high as is comfortable, pause 2 seconds and lower it. Twice.",
            "Then let the arm hang by your side, palm forward. Keep the elbow touching your side and bring the hand toward the shoulder as far as it goes, over about 3 seconds. Hold still 2 seconds at the top, lower it, and hold still 2 seconds at the bottom. Twice.",
            "Watch for the shoulder hiking and for the two bands touching at the full bend; note it below.",
            "Everything is seated, in a chair without armrests. Stop short of pain.",
            ELDER_STOP,
          ],
          phases: [
            ...range(5).flatMap((n) => [move(`up-${n}`, 2, "Reach to the mark."), move(`down-${n}`, 2, "Bring the hand back to the lap.")]),
            ...range(2).flatMap((n) => [
              move(`raise-${n}`, 3, "Raise the arm slowly, as high as is comfortable."),
              hold(`top-${n}`, 2, "Pause.", "effort"),
              move(`lower-${n}`, 3, "Lower the arm to the lap."),
            ]),
            move("hang", 1.5, "Let the arm hang by your side."),
            ...range(2).flatMap((n) => [
              move(`curl-${n}`, 3, "Elbow at your side. Hand toward the shoulder."),
              hold(`curl-top-${n}`, 2, "Hold still.", "effort"),
              move(`curl-down-${n}`, 3, "Lower the hand."),
              hold(`curl-bottom-${n}`, 2, "Hold still."),
            ]),
            move("rest", 1.5, "Rest the arm on the lap."),
          ],
        },
      ],
    },
    {
      id: "lower",
      name: "Lower limb",
      bands: "One band on the thigh and one on the shank.",
      tasks: [
        {
          id: "c3-leg-rest",
          name: "Seated rest",
          order: "1",
          limb: "lower",
          tempo: "Sit still for 30 seconds.",
          compare: "th",
          devices: LEG,
          props: ["chair"],
          entries: [],
          script: [
            "One band on the thigh and one on the shank.",
            "Sit still for 30 seconds, feet flat, hands on the thighs. Do nothing.",
            "This is the quiet reference for the thigh and shank muscles, and for the tilt of those two segments while sitting.",
            ELDER_STOP,
          ],
          phases: [hold("still", 30, "Sit still. Breathe normally.")],
        },
        {
          id: "c3-leg-cued",
          name: "Cued knee and ankle",
          order: "2",
          limb: "lower",
          tempo: "On each tone: five knee straightenings (hold the fifth up to 60 seconds), then five foot-ups. Then three heel slides.",
          compare: "th",
          devices: LEG,
          props: ["chair"],
          entries: [
            { id: "knee_hold_s", label: "Fifth knee hold", unit: "s", max: 60 },
            { id: "ankle_kg", label: "Ankle cuff (0 if none)", unit: "kg", max: 3 },
          ],
          script: [
            "Sit with the feet clear enough to straighten the knee. Listen for the tone. The wait before it changes every time.",
            "On each tone, straighten the knee and hold 3 seconds, then rest the foot. On the fifth tone, keep the knee straight for up to 60 seconds and say stop when you need to. Type the seconds held below.",
            "Then, on each tone, pull the foot up with the heel on the floor and hold 3 seconds. Five times.",
            "Last, the heel slides. Sit forward so the back of the knee clears the seat edge by about three fingers, with a towel or a sheet of paper under the foot. Slide the foot back under the chair as far as is comfortable and hold 2 seconds, then press the heel back into the tester's hand or a fixed block for 3 seconds. Three times.",
            "If the participant can lift it comfortably, put a 1 kg cuff on the ankle for the knee part: it makes the 60 second hold readable for fatigue. Note the weight below.",
            "With the thigh hub on vastus lateralis (biceps femoris on a side pod) the heel press is the hamstring reference for knee co-contraction. With the hub on rectus femoris it only shows whether the quadriceps stay quiet.",
            NO_BLUETOOTH,
            ELDER_STOP,
          ],
          phases: [
            ...cuedTrials({
              stem: "knee",
              waits: WAITS_KNEE,
              moveSec: 1.5,
              holdSec: 3,
              lastHold: 60,
              cue: "Straighten the knee and hold.",
              holdCue: "Hold the knee straight.",
              lastCue: "Keep the knee straight. Say stop when you need to.",
            }),
            hold("knee-lower", 3, "Lower the foot and rest."),
            ...cuedTrials({ stem: "ankle", waits: WAITS_ANKLE, moveSec: 1, holdSec: 3, cue: "Pull the foot up and hold.", holdCue: "Hold the foot up." }),
            hold("ankle-lower", 3, "Foot down. Rest."),
            ...range(3).flatMap((n) => [
              move(`slide-${n}`, 2, "Slide the foot back under the chair."),
              hold(`slide-hold-${n}`, 2, "Hold still.", "effort"),
              hold(`press-${n}`, 3, "Press the heel back into the hand.", "effort"),
              move(`slide-back-${n}`, 2, "Bring the foot forward."),
              ...(n < 3 ? [hold(`slide-rest-${n}`, 3, "Rest.")] : []),
            ]),
          ],
        },
        {
          id: "c3-leg-balance",
          name: "Standing balance",
          order: "3",
          limb: "lower",
          tempo: "Feet together: 30 seconds eyes open, 30 seconds eyes closed. Then semi-tandem and tandem, 10 seconds each.",
          compare: "sh",
          devices: LEG,
          props: ["support"],
          entries: [
            { id: "together_open_s", label: "Feet together, eyes open", unit: "s", max: 30 },
            { id: "together_closed_s", label: "Feet together, eyes closed", unit: "s", max: 30 },
            { id: "semi_tandem_s", label: "Semi-tandem", unit: "s", max: 10 },
            { id: "tandem_s", label: "Tandem", unit: "s", max: 10 },
            { id: "front_foot", label: "Foot in front (tandem)", options: ["Banded leg", "Other leg"] },
          ],
          script: [
            "Stand behind a heavy chair or at a counter, with a spotter behind you on the banded side. Keep the hands just above the chair back; hold it whenever you need to.",
            "Feet together, eyes open, 30 seconds. Then feet together, eyes closed, 30 seconds, only if the eyes-open stance was held for the full 30 seconds.",
            "Then semi-tandem (the heel of one foot beside the big toe of the other) for 10 seconds, then tandem (heel to toe) for 10 seconds.",
            "A stance ends when a hand touches the chair or a foot moves. Type the seconds held, skip the harder stances after one that was not held, and note which foot was in front.",
            ELDER_STOP,
          ],
          phases: [
            hold("together-open", 30, "Feet together. Eyes open. Stand still.", "effort"),
            hold("rest-open", 10, "Rest. Hands on the chair."),
            hold("together-closed", 30, "Feet together. Close your eyes.", "effort"),
            hold("rest-closed", 10, "Open your eyes. Rest."),
            hold("semi-tandem", 10, "Semi-tandem. Eyes open.", "effort"),
            hold("rest-semi", 10, "Feet together. Rest."),
            hold("tandem", 10, "Tandem: heel to toe. Eyes open.", "effort"),
            hold("done", 3, "Feet together. Done."),
          ],
        },
        {
          id: "c3-leg-tug",
          name: "Timed up-and-go",
          order: "4",
          limb: "lower",
          tempo: "Two trials: stand, walk 3 metres at your usual pace, turn, walk back and sit. Rest between.",
          compare: "th",
          devices: LEG,
          props: ["armchair", "cone"],
          course: 3,
          entries: [
            { id: "tug_1_s", label: "Trial 1", unit: "s", max: 120 },
            { id: "tug_2_s", label: "Trial 2", unit: "s", max: 120 },
            { id: "aid", label: "Walking aid", options: ["None", "Stick", "Frame"] },
          ],
          script: [
            "Sit back in the armchair. On the tone, stand up, walk at your usual, safe pace to the cone 3 metres away, turn, walk back and sit down. The wait before the tone changes.",
            "Two trials, resting in the chair between them for 30 seconds or longer if needed. Time each with a stopwatch, from the tone until the back touches the chair. The stopwatch is the official time.",
            "Use the usual walking aid if there is one, and note it below.",
            ELDER_STOP,
          ],
          phases: [1, 2].flatMap((n) => [
            hold(`wait-${n}`, WAITS_START[n - 1]!, "Sit back. Wait for the tone."),
            { ...standUp(`up-${n}`, 3, "Go. Stand up."), go: true },
            gait(`out-${n}`, 6, "Walk to the cone."),
            gait(`back-${n}`, 6, "Turn and walk back."),
            standUp(`sit-${n}`, 3, "Sit down."),
            ...(n === 1 ? [hold("rest", 30, "Rest in the chair.")] : []),
          ]),
        },
        {
          id: "c3-leg-walk",
          name: "Usual and fast walk",
          order: "5",
          limb: "lower",
          tempo: "The 10 metre course out and back at your usual pace, then out and back as fast as feels safe.",
          compare: "th",
          devices: LEG,
          props: [],
          course: 10,
          entries: [
            { id: "usual_6m_s", label: "Usual pace, middle 6 m", unit: "s", max: 60 },
            { id: "fast_6m_s", label: "Fast pace, middle 6 m", unit: "s", max: 60 },
          ],
          script: [
            "Usual shoes. Tape the course at 0, 2, 8 and 10 metres.",
            "Stand at the start line. On the tone, walk out and back at your usual pace. Rest 30 seconds. Then, on the next tone, out and back as fast as feels safe. Skip the fast walk if the usual walk was unsteady.",
            "On the first length at each speed, time the middle 6 metres: start when the first foot crosses the 2 m tape, stop when it crosses the 8 m tape. The turn stays outside the timed part.",
            ELDER_STOP,
          ],
          phases: [
            hold("wait-usual", WAITS_START[0]!, "Stand at the start. Wait for the tone."),
            { ...gait("usual-out", 12, "Usual pace. Walk to the far tape."), go: true },
            gait("usual-back", 13.5, "Turn and walk back."),
            hold("rest", 30, "Rest 30 seconds. Sit if you need to."),
            hold("wait-fast", WAITS_START[1]!, "At the start line. Wait for the tone."),
            { ...gait("fast-out", 12, "As fast as feels safe. Walk to the far tape."), go: true },
            gait("fast-back", 10.5, "Turn and walk back, fast."),
          ],
        },
        {
          id: "c3-leg-ankle",
          name: "Ankle lunge and heel raises",
          order: "6",
          limb: "lower",
          optional: true,
          tempo: "At a counter or heavy chair: three supported lunges with the banded foot forward, then heel raises to the beat, up to 25.",
          compare: "sh",
          devices: LEG,
          props: ["support"],
          entries: [
            { id: "heel_down", label: "Heel stayed down in the lunges", options: ["Yes", "No"] },
            { id: "heel_raises", label: "Full-height heel raises", unit: "", max: 30 },
          ],
          script: [
            "Optional. Stand at a counter or the back of a heavy chair, with a spotter beside you. Push down on it with the hands; do not pull.",
            "Stand tall with the feet together for 3 seconds: that is the reference. Then step the other foot back, keep the banded foot's heel down on a slip of paper, and bend the front knee forward over the toes as far as is comfortable. Hold 3 seconds, then come back. Three times. The paper should stay trapped under the heel.",
            "Then the heel raises: fingertips on the counter, rise as high as you can and lower, one to each beat of a metronome at 30 per minute. Stop when the height visibly halves, after two missed beats, or at 25. Type how many full-height raises were done.",
            ELDER_STOP,
          ],
          phases: [
            hold("reference", 3, "Stand tall, feet together. Hold still.", "effort"),
            ...range(3).flatMap((n) => [
              move(`lunge-${n}`, 2.5, "Step back. Front knee forward, heel down."),
              hold(`lunge-hold-${n}`, 3, "Hold still.", "effort"),
              move(`lunge-back-${n}`, 2.5, "Come back to standing."),
            ]),
            hold("pause", 3, "Now the heel raises, to the beat."),
            ...range(12).flatMap((n) => [move(`rise-${n}`, 1, "Up as high as you can."), move(`drop-${n}`, 1, "Lower.")]),
          ],
        },
        {
          id: "c3-leg-chair",
          name: "30-second chair stand",
          order: "7",
          limb: "lower",
          tempo: "Arms crossed. As many full stands as you can in 30 seconds.",
          compare: "th",
          devices: LEG,
          props: ["chair"],
          entries: [
            { id: "stands_30s", label: "Full stands in 30 s", unit: "", max: 40 },
            { id: "sts5_s", label: "Time to the fifth stand", unit: "s", max: 60 },
          ],
          script: [
            "A chair without armrests, its back against a wall. Sit in the middle of the seat, feet flat, arms crossed over the chest.",
            "On go, stand up fully and sit back down fully, as many times as you can in 30 seconds. Keep the arms crossed.",
            "Count the full stands. Take a lap time when the participant is standing for the fifth time: that is the five-times sit-to-stand.",
            "Stop at once for pain, dizziness or loss of balance.",
            ELDER_STOP,
          ],
          phases: [
            hold("ready", 2, "Arms crossed. Ready."),
            ...range(7).flatMap((n) => [standUp(`up-${n}`, 2, "Stand up fully."), standUp(`down-${n}`, 2, "Sit down fully.")]),
            hold("stop", 2, "Stop. Sit and rest."),
          ],
        },
        {
          id: "c3-leg-2mw",
          name: "Two-minute walk",
          order: "8",
          limb: "lower",
          optional: true,
          tempo: "Walk the 10 metre course out and back at your usual pace for 2 minutes.",
          compare: "sh",
          devices: LEG,
          props: [],
          course: 10,
          entries: [
            { id: "rpe_before", label: "Exertion before (0-10)", unit: "", max: 10 },
            { id: "distance_m", label: "Distance in 2 minutes", unit: "m", max: 300 },
            { id: "rests", label: "Stops to rest", unit: "", max: 20 },
            { id: "aid", label: "Walking aid", options: ["None", "Stick", "Frame"] },
          ],
          script: [
            "Optional, and last. Only if the participant feels well after the chair stands. Sit and rest for 2 to 3 minutes first, and ask how hard the last task felt (0 to 10).",
            "Walk out and back along the 10 metre course at your usual pace for 2 minutes, with a spotter alongside. You may slow down or stop; say if you need to sit. Use the usual walking aid if there is one.",
            "Say only the one standard line at 1 minute (\"You are doing well. Keep going at your usual pace.\") and no countdown near the end, which makes people speed up.",
            "Count the lengths at the 10 m lines. At 2 minutes, type the distance: lengths × 10 m plus the last part length.",
            ELDER_STOP,
          ],
          phases: [gait("walk", 60, "Usual pace, out and back."), gait("walk-minute", 60, "You are doing well. Keep going at your usual pace.")],
        },
      ],
    },
  ],
}

export const taskSeconds = (t: { phases: { durationSec: number }[] }) => t.phases.reduce((s, p) => s + p.durationSec, 0)

// ── The original Collection set (dashboard/js/protocol.js TASKS) ─────────────
//
// The dashboard's first battery, still in its task list beside Cohort 3
// Basics: a 60 s baseline with the bands on (sitting, forearm palm up, elbow
// about 90°), forearm gestures, loaded elbow curls, then two leg sets.

const SAFETY = "Stop if anything hurts. This is a recording check, not a strength test, and it does not diagnose anything. Battery only while a band is on the skin."

/** n holds of `holdSec` seconds, each followed by `restSec` seconds (protocol.js reps). */
function reps(id: string, n: number, holdSec: number, restSec: number, holdCue: string, restCue: string): CohortPhase[] {
  return range(n).flatMap((i) => [hold(`${id}-${i}`, holdSec, holdCue, "effort"), hold(`${id}-rest-${i}`, restSec, restCue)])
}

/** n movements out and back, each followed by a rest; the last rest says what comes next (protocol.js moves). */
function moves(id: string, n: number, go: number, back: number, rest: number, goCue: string, backCue: string, restCue: string, doneCue?: string): CohortPhase[] {
  return range(n).flatMap((i) => [
    move(`${id}-go-${i}`, go, goCue),
    move(`${id}-back-${i}`, back, backCue),
    hold(`${id}-rest-${i}`, rest, i === n && doneCue ? doneCue : restCue),
  ])
}

function curlBlock(id: string, load: number, nextCue: string): CohortPhase[] {
  const label = load ? `with the ${load} lb dumbbell` : "with an empty hand"
  return moves(id, 5, 2, 2, 4, `Bend the elbow ${label}.`, `Straighten the elbow ${label}.`, "Rest the arm.", nextCue)
}

export const COLLECTION: { id: string; name: string; tasks: CohortTask[] } = {
  id: "collection",
  name: "Collection",
  tasks: [
    {
      id: "rest",
      name: "Baseline",
      order: "1",
      limb: "upper",
      tempo: "One hold of 60 seconds. No reps. Forearm palm up, elbow about 90°.",
      compare: "fa",
      devices: ["ua", "fa"],
      props: ["armchair"],
      entries: [],
      script: [
        "Sit with the limbs supported. All the bands stay on.",
        "Forearm supinated, elbow about 90°. Knee relaxed, foot on the floor.",
        "Match the still posture and stay completely still for 60 seconds. Breathe normally. Do not talk.",
        "This recording is the quiet reference for every later ratio.",
        SAFETY,
      ],
      phases: [hold("still", 60, "Stay still. Breathe normally.")],
    },
    {
      id: "arm-1",
      name: "Arm 1 · hand gestures",
      order: "2",
      limb: "upper",
      tempo: "5 s on, then 5 s rest, three times each. Fist, finger spread, wave in, wave out, double tap, relaxed hand.",
      compare: "fa",
      devices: ["fa"],
      props: ["armchair"],
      entries: [],
      script: [
        "One band on the forearm, proximal third. Flexor mass, dorsoradial, dorsoulnar.",
        "Sit with the forearm supported, palm up to start.",
        "Three holds of each gesture, 5 seconds on and 5 seconds off, in this order: fist, finger spread, wave in, wave out, double tap, relaxed hand.",
        "Wave in is wrist flexion, palm toward the forearm. Wave out is wrist extension. Double-tap is two quick taps of the index finger on the thumb.",
        SAFETY,
      ],
      phases: [
        ...reps("fist", 3, 5, 5, "Make a fist and hold.", "Open the hand and rest."),
        ...reps("spread", 3, 5, 5, "Spread the fingers and hold.", "Relax the fingers."),
        ...reps("wave-in", 3, 5, 5, "Wave in. Flex the wrist and hold.", "Return the wrist to neutral."),
        ...reps("wave-out", 3, 5, 5, "Wave out. Extend the wrist and hold.", "Return the wrist to neutral."),
        ...range(3).flatMap((i) => [
          move(`tap-${i}`, 5, "Double-tap. Two taps, then leave the hand relaxed."),
          hold(`tap-rest-${i}`, 5, "Rest the hand in the lap."),
        ]),
        ...reps("relaxed", 3, 5, 5, "Relaxed hand on the support. Let the fingers rest open.", "Take the hand off the support and rest."),
      ],
    },
    {
      id: "arm-2",
      name: "Arm 2 · elbow curls with load",
      order: "3",
      limb: "upper",
      tempo: "2 s to bend, 2 s to straighten, 4 s rest. Five reps with no load, then five with 3 lb, then five with 5 lb.",
      compare: "ua",
      devices: ["ua", "fa"],
      props: ["3 lb dumbbell", "5 lb dumbbell"],
      entries: [],
      script: [
        "One band on the upper arm and one on the forearm.",
        "Stand with the upper arm against your side. Only the forearm moves.",
        "Elbow flexion and extension. Five repetitions at each load: 2 seconds to bend, 2 seconds to straighten, 4 seconds of rest.",
        "Order: empty hand, then a 3 lb dumbbell, then a 5 lb dumbbell.",
        SAFETY,
      ],
      phases: [
        ...curlBlock("none", 0, "Rest. Pick up the 3 lb dumbbell."),
        ...curlBlock("lb3", 3, "Rest. Pick up the 5 lb dumbbell."),
        ...curlBlock("lb5", 5, "Set the weight down and rest the arm."),
      ],
    },
    {
      id: "leg-1",
      name: "Leg 1 · sit, stand, walk, stairs",
      order: "4",
      limb: "lower",
      tempo: "Sit 30 s, stand up in 3 s, stand 30 s, level walk 60 s at 108 steps per minute, then 30 s of stair ascent and 30 s of stair descent.",
      compare: "th",
      devices: ["th", "sh"],
      props: ["chair", "stairs"],
      entries: [],
      script: [
        "Bands on the thigh and the shank of one leg.",
        "Sit for 30 seconds, stand up, then stand still for 30 seconds.",
        "Walk on a flat floor for 60 seconds at 108 steps per minute.",
        "Then climb stairs for 30 seconds and come down for 30 seconds, one step of the tested leg every 1.5 seconds. Use a handrail if you need it.",
        "Keep the shank strap below the fibular neck.",
        SAFETY,
      ],
      phases: [
        hold("sit", 30, "Sit still."),
        standUp("stand-up", 3, "Stand up."),
        hold("stand", 30, "Stand still."),
        gait("walk", 60, "Level walk, about 108 steps a minute."),
        gait("stair-up", 30, "Stair ascent. One tested-leg step every 1.5 seconds."),
        gait("stair-down", 30, "Stair descent. One tested-leg step every 1.5 seconds."),
      ],
    },
    {
      id: "leg-2",
      name: "Leg 2 · deadlift, lunge, balance, jump, heel raise",
      order: "5",
      limb: "lower",
      tempo: "Deadlift, lunge and heel raise: 2 s each way, 3 s rest, five reps. Single-leg stance 20 s. Vertical jump 2 s, then 4 s rest, five times.",
      compare: "th",
      devices: ["th", "sh"],
      props: [],
      entries: [],
      script: [
        "Bands on the thigh and the shank of one leg. This set is bodyweight.",
        "Deadlift: hinge at the hips with a soft knee, then stand tall. Five reps, 2 seconds down, 2 seconds up, 3 seconds rest.",
        "Forward lunge onto the tested leg, five reps, same timing. Then balance on the tested leg for 20 seconds.",
        "Five vertical jumps: dip, leave the floor, and land softly. Two seconds for the jump, four seconds between jumps.",
        "Straight-knee heel raises, five reps, 2 seconds up and 2 seconds down.",
        SAFETY,
      ],
      phases: [
        ...moves("deadlift", 5, 2, 2, 3, "Hinge down. Soft knee.", "Stand tall.", "Stand and rest."),
        ...moves("lunge", 5, 2, 2, 3, "Lunge forward on the tested leg.", "Step back to standing.", "Stand and rest."),
        hold("stance", 20, "Stand on the tested leg. Hold your balance.", "effort"),
        ...range(5).flatMap((i) => [move(`jump-${i}`, 2, "Jump. Dip, leave the floor, land softly."), hold(`jump-rest-${i}`, 4, "Land and stand still.")]),
        ...moves("heel", 5, 2, 2, 3, "Rise onto the toes. Keep the knee straight.", "Lower the heels.", "Stand easy."),
      ],
    },
  ],
}

// ── Band sites and channels (placement.js) ───────────────────────────────────

type Aspect = "anterior" | "posterior" | "medial" | "lateral" | "volar" | "dorsal"

interface Site {
  name: string
  segment: string
  rule: string
  site: string
  ends: [string, string]
  hub: Aspect
  plan: [Aspect, Aspect]
  hubLabel: string
  muscles: Partial<Record<Aspect, { name: string; short: string }>>
}

export const SITES: Record<SiteId, Site> = {
  ua: {
    name: "Upper arm",
    segment: "upper_arm",
    rule: "one-third up from the elbow crease",
    site: "Ring one-third of the way up from the elbow crease.",
    ends: ["shoulder", "elbow"],
    hub: "anterior",
    plan: ["medial", "lateral"],
    hubLabel: "Front, on biceps",
    muscles: {
      anterior: { name: "Biceps brachii", short: "Biceps" },
      medial: { name: "Triceps long head", short: "TB long" },
      lateral: { name: "Triceps lateral head", short: "TB lat" },
    },
  },
  fa: {
    name: "Forearm",
    segment: "forearm",
    rule: "proximal third, just below the elbow",
    site: "Proximal third, just below the elbow.",
    ends: ["elbow", "wrist"],
    hub: "volar",
    plan: ["lateral", "medial"],
    hubLabel: "Palm side, on the flexor mass",
    muscles: {
      volar: { name: "Flexor mass", short: "Flexors" },
      lateral: { name: "Dorsoradial extensors", short: "Ext. radial" },
      medial: { name: "Dorsoulnar extensors", short: "Ext. ulnar" },
    },
  },
  th: {
    name: "Thigh",
    segment: "thigh",
    rule: "two-thirds from hip (ASIS) to kneecap",
    site: "Ring two-thirds of the way along the line from the ASIS to the lateral border of the patella.",
    ends: ["hip", "knee"],
    hub: "anterior",
    plan: ["lateral", "medial"],
    hubLabel: "Front, on rectus femoris",
    muscles: {
      anterior: { name: "Rectus femoris", short: "RF" },
      lateral: { name: "Vastus lateralis", short: "VL" },
      medial: { name: "Vastus medialis", short: "VM" },
      posterior: { name: "Biceps femoris", short: "BF" },
    },
  },
  sh: {
    name: "Shank",
    segment: "shank",
    rule: "a hand's width below the knee",
    site: "A hand’s width below the knee, below the fibular head. Keep the strap below the fibular neck, snug rather than tight.",
    ends: ["knee", "ankle"],
    hub: "anterior",
    plan: ["lateral", "medial"],
    hubLabel: "Front, on tibialis anterior",
    muscles: {
      anterior: { name: "Tibialis anterior", short: "TA" },
      lateral: { name: "Peroneus longus", short: "PL" },
      medial: { name: "Medial gastrocnemius", short: "MG" },
    },
  },
}

const CH2_RIGHT: Record<Aspect, Aspect> = { lateral: "posterior", medial: "anterior", anterior: "lateral", posterior: "medial", dorsal: "medial", volar: "lateral" }
const OPPOSITE: Partial<Record<Aspect, Aspect>> = { anterior: "posterior", posterior: "anterior", medial: "lateral", lateral: "medial" }
const SIDE_WORD: Record<Aspect, string> = { anterior: "front", posterior: "back", lateral: "outside", medial: "inside", dorsal: "back", volar: "palm side" }

/**
 * Where each channel of a band lands with the hub on its default aspect and
 * the USB port turned the way that puts CH2 and CH3 on their planned sides
 * (placement.js allocate with no choices). CH1 is the hub pod.
 */
export function allocate(id: SiteId, side: "left" | "right") {
  const s = SITES[id]
  const right = CH2_RIGHT[s.hub]
  const ch2Natural = side === "right" ? right : OPPOSITE[right]!
  // 0P proximal gives ch2Natural; flip the band (0P distal) when that is not the planned side.
  const zeroP = s.plan[0] === OPPOSITE[ch2Natural] || s.plan[1] === ch2Natural ? "distal" : "proximal"
  const ch2 = zeroP === "distal" ? OPPOSITE[ch2Natural]! : ch2Natural
  const facing: Aspect[] = [s.hub, ch2, OPPOSITE[ch2]!]
  // The USB-C port is at the hub's 0N end, opposite the 0P end.
  const usbToward = zeroP === "proximal" ? s.ends[1] : s.ends[0]
  return {
    site: s,
    usbToward,
    channels: facing.map((aspect, i) => ({
      ch: i + 1,
      where: i === 0 ? `hub, ${SIDE_WORD[aspect]}` : SIDE_WORD[aspect],
      name: s.muscles[aspect]?.name ?? `${SIDE_WORD[aspect]} of the ${s.name.toLowerCase()}`,
      short: s.muscles[aspect]?.short ?? "—",
    })),
  }
}
