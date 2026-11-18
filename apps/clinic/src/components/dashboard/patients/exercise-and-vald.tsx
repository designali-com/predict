"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, Bluetooth } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import type { ExerciseProtocol } from "@workspace/db/exercise-protocol"
import { ExerciseProtocolEditor } from "./exercise-protocol-editor"
import { CurrentExercise } from "./current-exercise"
import { ValdRunner } from "./vald-runner"
import { ValdTests } from "./vald-tests"
import { EmgPanel } from "./emg-recordings"
import { RecordEmpty, RecordSection, RecordSegments } from "./record-ui"

type Part = "exercise" | "vald" | "emg"

/**
 * Exercise and VALD, one tab with two parts inside it: the home exercise
 * prescription, and the DynaMo tests with their results.
 *
 * Both stay mounted and only the chosen one shows, so the VALD part still
 * knows which tests the prescription names (it offers those first) without
 * the Exercise part having been opened.
 */
export function ExerciseAndVald({ contactId, patientId }: { contactId: string; patientId: string | null }) {
  const [part, setPart] = useState<Part>("exercise")
  const [prescribed, setPrescribed] = useState<string[]>([])
  const [historyVersion, setHistoryVersion] = useState(0)
  // EMG loads the first time it is opened, then stays mounted so a recording survives switching parts.
  const [emgOpened, setEmgOpened] = useState(false)
  useEffect(() => {
    if (part === "emg") setEmgOpened(true)
  }, [part])
  // Shut until somebody is about to test — as on the appointment's VALD tab.
  const [performing, setPerforming] = useState(false)

  const onPrescription = useCallback((p: ExerciseProtocol | null) => {
    setPrescribed([...new Set((p?.exercises ?? []).map((e) => e.vald).filter((k): k is string => !!k))])
  }, [])

  const noChart = <RecordEmpty>A chart is created on the first booking. Tests are filed against it.</RecordEmpty>

  return (
    <div className="flex flex-col gap-3">
      <RecordSegments<Part>
        segments={[
          { key: "exercise", label: "Exercise" },
          { key: "vald", label: "VALD" },
          { key: "emg", label: "EMG" },
        ]}
        active={part}
        onChange={setPart}
      />

      <div className={part === "exercise" ? "flex flex-col gap-4" : "hidden"}>
        {/* Asked first: what they already do, then the prescription built on it. */}
        <CurrentExercise contactId={contactId} />
        <ExerciseProtocolEditor contactId={contactId} onPrescription={onPrescription} asSection />
      </div>

      <div className={part === "vald" ? "flex flex-col gap-4" : "hidden"}>
        <RecordSection
          title="VALD test"
          icon={Bluetooth}
          action={
            patientId ? (
              performing ? (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setPerforming(false)}>
                  Close
                </Button>
              ) : (
                <Button size="sm" className="h-8" onClick={() => setPerforming(true)}>
                  <Bluetooth className="h-4 w-4" />
                  Perform test
                </Button>
              )
            ) : undefined
          }
        >
          {!patientId ? noChart : performing ? (
            <ValdRunner patientId={patientId} prescribed={prescribed} onSaved={() => setHistoryVersion((v) => v + 1)} />
          ) : null}
        </RecordSection>

        <RecordSection title="Tests" icon={Activity}>
          {patientId ? <ValdTests key={historyVersion} patientId={patientId} /> : noChart}
        </RecordSection>
      </div>

      {/* EMG: the armband, with the DynaMo alongside if wanted. */}
      {emgOpened && (
        <div className={part === "emg" ? "flex flex-col gap-4" : "hidden"}>
          <EmgPanel patientId={patientId ?? contactId} />
        </div>
      )}
    </div>
  )
}
