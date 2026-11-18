"use client"

import { useEffect } from "react"
import { ArrowLeft, CalendarDays, Droplets, FlaskConical, IdCard, LayoutGrid, Printer, Stethoscope, UserRound } from "lucide-react"
import { PredictMark } from "@workspace/ui/components/predict-loader"
import type { DashboardBiomarker, DashboardDomain, PatientDashboard, Severity } from "@workspace/db/patient-dashboard"

export interface HealthReportData {
  patient: { name: string; code: string; gender: string | null; dateOfBirth: string | null; referredBy: string | null }
  dashboard: PatientDashboard
  reports: { fileName: string | null; reportType: string | null; collectedOn: string | null; uploadedAt: string | null }[]
  generatedAt: string
}

/**
 * Predict colour system — severity reference palette. Every one carries Ink
 * text (≥ 4.5:1, Extreme included) and is always shown with its name: colour
 * is never the only signal.
 */
const SEVERITY: Record<Severity, { label: string; color: string }> = {
  normal: { label: "Normal", color: "#3EC873" },
  mild: { label: "Mild", color: "#E4BD36" },
  moderate: { label: "Moderate", color: "#FB9B00" },
  severe: { label: "Severe", color: "#F5642B" },
  extreme: { label: "Extreme", color: "#E62A3B" },
}
const SEV_ORDER: Severity[] = ["normal", "mild", "moderate", "severe", "extreme"]
const SEV_RANK: Record<Severity, number> = { extreme: 0, severe: 1, moderate: 2, mild: 3, normal: 4 }

/** A result's direction, in words and an arrow — severity carries the colour. */
const STATUS_TEXT: Record<string, string> = { High: "↑ High", Low: "↓ Low", Normal: "In range", Unknown: "—" }

const day = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))))

/** Typo-free domain names, without the "(CODE):" tail. */
function domainName(name: string) {
  return name
    .replace(/\s*\([^)]*\)\s*:?$/, "")
    .replace("Factotor", "Factor")
    .replace("Anggiogenic", "Angiogenic")
    .replace("Perepheral", "Peripheral")
    .trim()
}
function markerName(name: string) {
  return name.replace(/\s*\(commonly measured as[^)]*\)/i, "").replace(/\s*\(Bone γ-Carboxyglutamic Acid Protein\)/, "")
}

/** Same scale as the patient app's age bar: 0–20 → 15%, 20–70 → 70%, 70–100 → 15%. */
function agePct(age: number) {
  const a = Math.min(Math.max(age, 0), 100)
  return a <= 20 ? (a / 20) * 15 : a <= 70 ? 15 + ((a - 20) / 50) * 70 : 85 + ((a - 70) / 30) * 15
}

function ageFromDob(dob: string | null) {
  if (!dob || dob.startsWith("1900")) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years--
  return years
}

/** A severity, named, in its own colour with Ink text. */
function SeverityChip({ severity }: { severity: Severity | null }) {
  if (!severity) return <span className="hr-chip hr-chip-none">Not measured</span>
  const s = SEVERITY[severity]
  return (
    <span className="hr-chip" style={{ background: s.color }}>
      {s.label}
    </span>
  )
}

/** Where the value sits: the healthy band is the middle half of the bar; the dot takes the severity colour. */
function RangeDot({ b }: { b: DashboardBiomarker }) {
  if (b.rangeMin == null || b.rangeMax == null) return <span className="hr-mut">—</span>
  const span = b.rangeMax - b.rangeMin || 1
  const lo = b.rangeMin - span * 0.5
  const hi = b.rangeMax + span * 0.5
  const p = Math.min(100, Math.max(0, ((b.value - lo) / (hi - lo)) * 100))
  return (
    <div className="hr-rb">
      <div className="hr-rb-ok" />
      <div className="hr-rb-dot" style={{ left: `${p}%`, background: b.severity ? SEVERITY[b.severity].color : "var(--ink)" }} />
    </div>
  )
}

function Band({ title, generated }: { title: string; generated: string }) {
  return (
    <header className="hr-band">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/predict-logo-dark.svg" alt="Predict" className="hr-logo" />
      <div className="hr-band-r">
        <div className="hr-band-k">PREDICT / HEALTH REPORT</div>
        <div className="hr-band-t">{title}</div>
        <div className="hr-band-s">Generated {day(generated)}</div>
      </div>
    </header>
  )
}

/** One fact about the patient, with its icon. */
function Cell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <span className="hr-cell-i">{icon}</span>
      <div className="hr-cell-t">
        <span>{label}</span>
        <b>{value}</b>
      </div>
    </div>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="hr-h2">
      <PredictMark className="hr-h2-mark" />
      {children}
    </h2>
  )
}

/**
 * The printable Predict health report: a one-page summary (biological age,
 * health score, what needs attention, the health domains) followed by every
 * biomarker, grouped by the domain it feeds. Built from the same data as the
 * patient's dashboard, so the two always agree. Colours follow the Predict
 * colour system: Ink, Paper, the Violet ramp, and the severity palette.
 */
export function HealthReportView({ data }: { data: HealthReportData }) {
  const { patient, dashboard, generatedAt } = data

  // A report is printed on white paper whatever theme the panel is in: the
  // dark theme painted the page margins black in the PDF.
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains("dark")
    const scheme = root.style.colorScheme
    root.classList.remove("dark")
    root.style.colorScheme = "light"
    document.body.style.background = "#fff"
    return () => {
      if (hadDark) root.classList.add("dark")
      root.style.colorScheme = scheme
      document.body.style.background = ""
    }
  }, [])

  const ix = dashboard.indexes[0] ?? null
  const markers = dashboard.biomarkers
  const age = ix?.chronologicalAge ?? ageFromDob(patient.dateOfBirth)
  const sex = patient.gender ? patient.gender.charAt(0) + patient.gender.slice(1).toLowerCase() : null
  const score = dashboard.measured ? Math.round((dashboard.inRange / dashboard.measured) * 100) : null

  const attention = markers
    .filter((b) => b.status === "High" || b.status === "Low")
    .sort((a, b) => SEV_RANK[a.severity ?? "normal"] - SEV_RANK[b.severity ?? "normal"])
    .slice(0, 5)
  const strengths = markers.filter((b) => b.status === "Normal" && (b.severity ?? "normal") === "normal").slice(0, 5)

  // Biomarkers grouped by the domain they feed (first domain wins), the rest last.
  const domains: DashboardDomain[] = ix ? ix.domains : []
  const placed = new Set<string>()
  const groups = domains
    .map((dm) => ({
      title: domainName(dm.name),
      severity: dm.severity,
      rows: dm.biomarkers
        .filter((b) => !placed.has(b.id) && (placed.add(b.id), true))
        .map((b) => markers.find((m) => m.id === b.id) ?? b),
    }))
    .filter((g) => g.rows.length)
  const others = markers.filter((b) => !placed.has(b.id))
  if (others.length) groups.push({ title: "Other markers", severity: null, rows: others })

  const bio = ix?.biologicalAge ?? null
  const chrono = ix?.chronologicalAge ?? null
  const older = bio != null && chrono != null && bio - chrono >= 0.5
  const younger = bio != null && chrono != null && chrono - bio >= 0.5

  return (
    <div className="hr-root">
      <style>{CSS}</style>

      <div className="hr-toolbar">
        <button type="button" onClick={() => history.back()} className="hr-btn hr-btn-ghost">
          <ArrowLeft size={15} /> Back
        </button>
        <span className="hr-toolbar-t">
          <PredictMark className="hr-toolbar-mark" /> {patient.name} · Health report
        </span>
        <button type="button" onClick={() => window.print()} className="hr-btn">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      {/* ───────────────────── Page 1 · Summary ───────────────────── */}
      <section className="hr-page">
        <Band title="Health Summary" generated={generatedAt} />

        <div className="hr-who">
          <Cell icon={<UserRound />} label="Patient" value={patient.name} />
          <Cell icon={<IdCard />} label="Patient ID" value={patient.code} />
          <Cell icon={<CalendarDays />} label="Age / Sex" value={[age != null ? `${age} yrs` : null, sex].filter(Boolean).join(" · ") || "—"} />
          <Cell icon={<Stethoscope />} label="Referred by" value={patient.referredBy ?? "Self"} />
          <Cell icon={<FlaskConical />} label="Sample collected" value={day(dashboard.lastPanelOn)} />
          <Cell icon={<Droplets />} label="Biomarkers measured" value={String(dashboard.measured)} />
          <div className="hr-who-wide">
            <span className="hr-cell-i"><LayoutGrid /></span>
            <div className="hr-cell-t">
              <span>Health domains</span>
              <b>{ix ? `${ix.measuredDomains} of ${ix.mappedDomains}` : "—"}</b>
            </div>
          </div>
        </div>

        <div className="hr-hero">
          <div className="hr-age">
            {/* The Predict mark, faint, behind the headline number. */}
            <PredictMark className="hr-watermark" />
            {ix && bio != null && chrono != null ? (
              <>
                <div className="hr-age-top">
                  <div>
                    <div className="hr-k">CHRONOLOGICAL AGE</div>
                    <div className="hr-big hr-ink">{chrono}</div>
                  </div>
                  <div className={`hr-pill ${older ? "bad" : younger ? "good" : ""}`}>
                    {older ? `+${(bio - chrono).toFixed(1)} yrs older` : younger ? `${(chrono - bio).toFixed(1)} yrs younger` : "Same as your age"}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="hr-k">BIOLOGICAL AGE</div>
                    <div className="hr-big">{num(Math.round(bio * 10) / 10)}</div>
                  </div>
                </div>
                <div className="hr-bar">
                  <div className="hr-track" />
                  <div
                    className="hr-range"
                    style={{ left: `${Math.min(agePct(bio), agePct(chrono))}%`, width: `${Math.abs(agePct(bio) - agePct(chrono))}%` }}
                  />
                  <div className="hr-mk hr-mk-c" style={{ left: `${agePct(chrono)}%` }} title="Chronological" />
                  <div className="hr-mk" style={{ left: `${agePct(bio)}%` }} title="Biological" />
                </div>
                <div className="hr-ends">
                  <span>0</span>
                  <span className="hr-legend">
                    <i className="hr-lg-c" /> Chronological <i /> Biological
                  </span>
                  <span>100</span>
                </div>
              </>
            ) : (
              <div className="hr-empty">Biological age has not been calculated yet.</div>
            )}
          </div>

          <div className="hr-score">
            <svg viewBox="0 0 120 120" className="hr-ring">
              <circle cx="60" cy="60" r="50" className="hr-ring-bg" />
              {score != null && (
                <circle cx="60" cy="60" r="50" className="hr-ring-fg" strokeDasharray={`${(score / 100) * 314.16} 314.16`} />
              )}
              <text x="60" y="58" textAnchor="middle" className="hr-ring-n">{score ?? "—"}</text>
              <text x="60" y="76" textAnchor="middle" className="hr-ring-u">{score != null ? "/ 100" : ""}</text>
            </svg>
            <div className="hr-score-t">Health score</div>
            <div className="hr-lbl">{dashboard.inRange} of {dashboard.measured} biomarkers in range</div>
          </div>
        </div>

        <div className="hr-two">
          <div className="hr-card">
            <h3>Needs attention</h3>
            {attention.length ? (
              <ul className="hr-list">
                {attention.map((b) => (
                  <li key={b.id}>
                    <span className="hr-list-n">{markerName(b.name)}</span>
                    <span className="hr-list-v">
                      <b>{num(b.value)}</b> <small>{b.unit}</small> <span className="hr-dir">{b.status === "High" ? "↑" : "↓"}</span>
                      <SeverityChip severity={b.severity} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hr-mut">Nothing outside the healthy range.</p>
            )}
          </div>
          <div className="hr-card">
            <h3>Doing well</h3>
            {strengths.length ? (
              <ul className="hr-list">
                {strengths.map((b) => (
                  <li key={b.id}>
                    <span className="hr-list-n">{markerName(b.name)}</span>
                    <span className="hr-list-v">
                      <b>{num(b.value)}</b> <small>{b.unit}</small>
                      <SeverityChip severity="normal" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hr-mut">—</p>
            )}
          </div>
        </div>

        {domains.length > 0 && (
          <>
            <H2>Health domains</H2>
            <div className="hr-doms">
              {domains.map((dm) => {
                const share = dm.shareOfDelta != null ? Math.round(dm.shareOfDelta * 100) : null
                return (
                  <div key={dm.id} className="hr-dom">
                    <div className="hr-dom-top">
                      <b>{domainName(dm.name)}</b>
                      <SeverityChip severity={dm.severity} />
                    </div>
                    <div className="hr-sh">
                      <i style={{ width: `${Math.max(share ?? 0, 1)}%` }} />
                    </div>
                    <div className="hr-dom-m">
                      <span>
                        {dm.biomarkerCount} measured{dm.missing.length ? ` · ${dm.missing.length} not tested` : ""}
                      </span>
                      <span>{share != null ? `${share}% of the age gap` : ""}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* ───────────────────── Biomarker details ───────────────────── */}
      <section className="hr-page">
        <Band title="Biomarker Details" generated={generatedAt} />
        <div className="hr-sum">
          <div><b>{dashboard.measured}</b><span>Measured</span></div>
          <div><b>{dashboard.inRange}</b><span>In range</span></div>
          <div><b>{markers.filter((b) => b.status === "High").length}</b><span>↑ Above range</span></div>
          <div><b>{markers.filter((b) => b.status === "Low").length}</b><span>↓ Below range</span></div>
        </div>
        <div className="hr-key">
          <span className="hr-key-t">Severity</span>
          {SEV_ORDER.map((s) => (
            <SeverityChip key={s} severity={s} />
          ))}
        </div>

        {markers.length === 0 ? (
          <p className="hr-empty">No biomarker values on file yet.</p>
        ) : (
          <table className="hr-table">
            <thead>
              <tr>
                <th>Biomarker</th>
                <th>Result</th>
                <th>Healthy range</th>
                <th>Where it sits</th>
                <th>Status</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.title} title={g.title} severity={g.severity} rows={g.rows} />
              ))}
            </tbody>
          </table>
        )}

        <p className="hr-note">
          <PredictMark className="hr-note-mark" />
          <span>
            Biological age is estimated from the biomarkers above and points to where care can help most — it is not a
            diagnosis. Please discuss these results with your doctor. <b>Predict · predict.fit</b>
          </span>
        </p>
      </section>
    </div>
  )
}

function GroupRows({ title, severity, rows }: { title: string; severity: Severity | null; rows: DashboardBiomarker[] }) {
  return (
    <>
      <tr className="hr-sec">
        <td colSpan={6}>
          <span>{title}</span>
          {severity && <SeverityChip severity={severity} />}
        </td>
      </tr>
      {rows.map((b) => (
        <tr key={b.id}>
          <td>
            <div className="hr-bn">{markerName(b.name)}</div>
            <div className="hr-bc">
              {b.shortCode}
              {b.collectedOn ? ` · ${day(b.collectedOn)}` : ""}
            </div>
          </td>
          <td className="hr-nw">
            <b>{num(b.value)}</b> <small className="hr-mut">{b.unit}</small>
          </td>
          <td className="hr-nw hr-mut">{b.rangeMin != null && b.rangeMax != null ? `${num(b.rangeMin)} – ${num(b.rangeMax)}` : "—"}</td>
          <td><RangeDot b={b} /></td>
          <td className={`hr-nw hr-st ${b.status === "Normal" ? "" : "out"}`}>{STATUS_TEXT[b.status] ?? "—"}</td>
          <td><SeverityChip severity={b.severity} /></td>
        </tr>
      ))}
    </>
  )
}

const CSS = `
.hr-root{
  --ink:#0B0611;--paper:#EFEFEF;--white:#FFFFFF;--mut:#615C69;--line:#E4E1E8;
  --v50:#F7F0FF;--v100:#EEDCFF;--v200:#DDBAFF;--v300:#C88DFF;--v400:#AC4FFF;--v500:#8504FE;--v600:#7000D9;--v700:#5900AE;--v800:#420080;--v900:#2B0054;--v950:#19002F;
  background:var(--paper);min-height:100vh;color:var(--ink);font-size:10.5pt;padding:0 0 40px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hr-toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--white);border-bottom:1px solid var(--line)}
.hr-toolbar-t{flex:1;display:inline-flex;justify-content:center;align-items:center;gap:8px;font-weight:500;font-size:13px;color:var(--mut)}
.hr-toolbar-mark{width:16px;height:16px}
.hr-btn{display:inline-flex;align-items:center;gap:6px;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:500;background:var(--v500);color:var(--white);border:0;cursor:pointer}
.hr-btn:hover{background:var(--v600)}.hr-btn:focus-visible{outline:2px solid var(--v500);outline-offset:2px}
.hr-btn-ghost{background:var(--white);color:var(--ink);border:1px solid var(--line)}.hr-btn-ghost:hover{background:var(--v50)}
.hr-page{width:210mm;max-width:100%;margin:18px auto 0;background:var(--white);padding:10mm 14mm 14mm;box-shadow:0 6px 30px -12px rgba(25,0,47,.22);border-radius:6px}
.hr-band{position:relative;display:flex;justify-content:space-between;align-items:flex-end;padding:1mm 0 4mm}
.hr-band:after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.2mm;border-radius:1mm;background:linear-gradient(90deg,var(--v800),var(--v500) 55%,var(--v200))}
.hr-logo{height:20px;width:auto;margin-bottom:1mm}.hr-band-r{text-align:right}
.hr-band-k{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:7pt;letter-spacing:.18em;color:var(--v500)}
.hr-band-t{font-weight:700;font-size:15pt;color:var(--ink);letter-spacing:-.01em;margin-top:.5mm}.hr-band-s{color:var(--mut);font-size:8.5pt;margin-top:1px}
.hr-who{display:grid;grid-template-columns:repeat(4,1fr);margin-top:5mm;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.hr-who>div{padding:2.8mm 4mm;border-right:1px solid var(--line);display:flex;align-items:center;gap:2.6mm;min-width:0}
.hr-cell-i{flex:none;display:inline-flex;align-items:center;justify-content:center;width:7.5mm;height:7.5mm;border-radius:2.2mm;background:var(--v50);color:var(--v600)}.hr-cell-i svg{width:3.9mm;height:3.9mm}
.hr-cell-t{display:flex;flex-direction:column;gap:1px;min-width:0}.hr-cell-t b{overflow-wrap:anywhere}
.hr-mix{margin-left:auto;display:flex;align-items:center;gap:2.4mm;flex-wrap:nowrap;justify-content:flex-end}.hr-mix-i{display:inline-flex;align-items:center;gap:1mm}.hr-mix-i>b{font-size:10pt}
.hr-who>div:nth-child(4n){border-right:0}.hr-who>div:nth-child(n+5){border-top:1px solid var(--line)}
.hr-who-wide{grid-column:span 2;border-right:0!important}
.hr-cell-t>span{font-size:7pt;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.hr-cell-t>b{font-weight:600;font-size:10pt}
.hr-hero{display:grid;grid-template-columns:1fr 48mm;gap:4mm;margin-top:5mm}
.hr-age{position:relative;overflow:hidden;border-radius:14px;background:var(--v50);padding:5.5mm 6.5mm}
.hr-watermark{position:absolute;right:-10mm;top:-12mm;width:58mm;height:58mm;opacity:.07;pointer-events:none}
.hr-score{border-radius:14px;background:var(--ink);color:var(--white);padding:5.5mm 6.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.hr-age-top{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:8px}
.hr-k{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:6.8pt;letter-spacing:.14em;color:var(--v700)}
.hr-big{font-size:30pt;font-weight:700;line-height:1;color:var(--v800);margin-top:1mm}.hr-ink{color:var(--ink)}.hr-lbl{font-size:8pt;color:var(--mut);margin-top:3px}
.hr-score .hr-lbl{color:var(--v200)}
.hr-pill{background:var(--white);border-radius:999px;padding:2mm 4mm;font-weight:600;font-size:9.5pt;white-space:nowrap;color:var(--ink);border:1px solid var(--line)}
.hr-pill.bad{background:var(--v100);color:var(--v700);border-color:var(--v200)}.hr-pill.good{background:#3EC873;color:var(--ink);border-color:transparent}
.hr-bar{position:relative;height:15mm;margin-top:3mm}
.hr-track{position:absolute;left:0;right:0;top:6mm;height:3mm;border-radius:2mm;background:repeating-linear-gradient(90deg,var(--v200) 0 1px,transparent 1px 5px)}
.hr-range{position:absolute;top:6mm;height:3mm;background:var(--v200);border-radius:2mm}
.hr-mk{position:absolute;top:1.5mm;width:2.4mm;height:12mm;border-radius:2mm;background:var(--v500);transform:translateX(-50%)}
.hr-mk-c{background:var(--ink)}
.hr-ends{position:relative;display:flex;justify-content:space-between;font-size:7.5pt;color:var(--mut)}
.hr-legend{display:inline-flex;align-items:center;gap:5px}.hr-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--v500);margin-left:6px}.hr-legend i.hr-lg-c{background:var(--ink)}
.hr-ring{width:30mm;height:30mm}.hr-ring-bg{fill:none;stroke:var(--v900);stroke-width:11}
.hr-ring-fg{fill:none;stroke:var(--v400);stroke-width:11;stroke-linecap:round;transform:rotate(-90deg);transform-origin:60px 60px}
.hr-ring-n{font-size:30px;font-weight:700;fill:var(--white)}.hr-ring-u{font-size:10px;fill:var(--v200)}
.hr-score-t{font-weight:600;margin-top:1mm}
.hr-two{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm}
.hr-card{border:1px solid var(--line);border-radius:12px;padding:4mm 5mm}
.hr-card h3,.hr-reports h3{margin:0 0 2mm;font-size:10pt;font-weight:600}
.hr-list{list-style:none;margin:0;padding:0}.hr-list li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:1.4mm 0;border-bottom:1px dashed var(--line);font-size:9pt}
.hr-list li:last-child{border-bottom:0}.hr-list small{font-weight:400;color:var(--mut);font-size:7.5pt}
.hr-list-n{min-width:0}.hr-list-v{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.hr-dir{font-weight:700}
.hr-h2{font-size:12pt;font-weight:600;margin:5mm 0 2.5mm;display:flex;align-items:center;gap:7px}.hr-h2-mark{width:13px;height:13px}
.hr-doms{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm}
.hr-dom{border:1px solid var(--line);border-radius:10px;padding:3mm 4mm;break-inside:avoid}
.hr-dom-top{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:9.5pt}
.hr-sh{height:2.2mm;border-radius:2mm;background:var(--v50);overflow:hidden;margin:2.2mm 0 1.6mm}.hr-sh i{display:block;height:100%;background:var(--v500)}
.hr-dom-m{display:flex;justify-content:space-between;font-size:7.5pt;color:var(--mut)}
.hr-chip{display:inline-block;font-size:7.3pt;font-weight:600;border-radius:999px;padding:.5mm 2.3mm;white-space:nowrap;color:var(--ink);line-height:1.4}
.hr-chip-none{background:var(--paper);color:var(--mut)}
.hr-sum{display:flex;gap:3mm;margin:5mm 0 2.5mm}.hr-sum div{flex:1;border:1px solid var(--line);border-radius:10px;padding:3mm 4mm}
.hr-sum div:first-child{background:var(--ink);color:var(--white);border-color:var(--ink)}.hr-sum div:first-child span{color:var(--v200)}
.hr-sum b{font-size:15pt;display:block}.hr-sum span{font-size:8pt;color:var(--mut)}
.hr-key{display:flex;align-items:center;gap:1.6mm;margin:0 0 3mm;flex-wrap:wrap}.hr-key-t{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:7pt;letter-spacing:.14em;color:var(--mut);text-transform:uppercase;margin-right:1mm}
.hr-table{width:100%;border-collapse:collapse;font-size:9pt}
.hr-table th{text-align:left;font-weight:500;font-size:7.3pt;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;padding:2mm 2.2mm;border-bottom:1.5px solid var(--ink)}
.hr-table td{padding:1.8mm 2.2mm;border-bottom:1px solid var(--line);vertical-align:middle}
.hr-sec td{background:var(--v50);font-weight:600;color:var(--v700);font-size:9pt}.hr-sec td>span:first-child{margin-right:2mm}
.hr-bn{font-weight:500}.hr-bc{font-size:7.5pt;color:var(--mut)}.hr-nw{white-space:nowrap}.hr-mut{color:var(--mut)}
.hr-st{font-size:8.5pt;color:var(--mut)}.hr-st.out{color:var(--ink);font-weight:600}
.hr-rb{position:relative;height:2.2mm;width:24mm;border-radius:2mm;background:var(--paper)}
.hr-rb-ok{position:absolute;left:25%;right:25%;top:0;bottom:0;background:var(--v100);border-radius:2mm}
.hr-rb-dot{position:absolute;top:50%;width:2.9mm;height:2.9mm;border-radius:50%;transform:translate(-50%,-50%);border:1.5px solid var(--ink)}
.hr-reports{margin-top:5mm;border:1px solid var(--line);border-radius:12px;padding:4mm 5mm;break-inside:avoid}
.hr-reports ul{list-style:none;margin:0;padding:0}.hr-reports li{display:flex;justify-content:space-between;gap:8px;font-size:9pt;padding:1.2mm 0}
.hr-note{display:flex;gap:2.5mm;align-items:flex-start;font-size:8pt;color:var(--mut);margin-top:4mm;line-height:1.5}.hr-note-mark{width:12px;height:12px;flex:none;margin-top:2px}
.hr-empty{padding:6mm 0;color:var(--mut);text-align:center}
@media screen and (max-width:760px){.hr-page{padding:5mm;border-radius:0}.hr-who{grid-template-columns:1fr 1fr}.hr-who>div:nth-child(2n){border-right:0}.hr-who>div:nth-child(n+3){border-top:1px solid var(--line)}
  .hr-hero,.hr-two,.hr-doms{grid-template-columns:1fr}.hr-table th:nth-child(4),.hr-table td:nth-child(4){display:none}.hr-big{font-size:24pt}.hr-toolbar-t{display:none}}
@media print{
  @page{size:A4;margin:10mm 0 12mm}
  html,body{background:#fff!important}
  .hr-root{background:#fff;padding:0}
  .hr-toolbar{display:none}
  .hr-page{margin:0 auto;box-shadow:none;border-radius:0;padding:0 14mm;break-after:page}
  .hr-page:last-child{break-after:auto}
  .hr-table tr{break-inside:avoid}.hr-sec{break-after:avoid}.hr-table thead{display:table-header-group}
  .hr-hero,.hr-two,.hr-card{break-inside:avoid}
  /* Page one holds the whole summary: a little tighter on paper than on screen. */
  .hr-who{margin-top:4mm}.hr-who>div{padding:2.2mm 4mm}
  .hr-hero{margin-top:4mm}.hr-age,.hr-score{padding:4mm 5.5mm}.hr-big{font-size:26pt}.hr-ring{width:25mm;height:25mm}.hr-bar{height:13mm}
  .hr-two{margin-top:3mm}.hr-card{padding:3mm 4.5mm}.hr-list li{padding:1mm 0}
  .hr-h2{margin:3.5mm 0 2mm}.hr-doms{gap:1.8mm}.hr-dom{padding:2mm 3.5mm}.hr-sh{margin:1.4mm 0 1mm}
  .hr-who>div{padding:1.8mm 4mm}.hr-age,.hr-score{padding:3.5mm 5mm}.hr-bar{height:11mm}.hr-ring{width:22mm;height:22mm}
  .hr-card h3{margin-bottom:1mm}.hr-list li{padding:.7mm 0;font-size:8.4pt}.hr-chip{font-size:6.8pt;padding:.3mm 2mm}
}
`
