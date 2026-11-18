import Link from "next/link"
import { Activity, Droplets, FlaskConical, Hourglass, Send, Smartphone, Users } from "lucide-react"
import { db } from "@workspace/db/client"
import { sql } from "@workspace/db"
import { clinicContext } from "@/src/lib/auth/clinic"
import { Empty, Panel, PanelLink, StatCard } from "./ui"

/**
 * The dashboard for Predict — a diagnosis business, not a treatment clinic.
 *
 * There are no appointments, courses or fees here, so the clinic overview's
 * schedule and front-desk queue mean nothing. What Predict runs on is blood
 * tests: who is on its books, which reports came in, who still needs a
 * biological age worked out from theirs, and what clinics have sent over.
 *
 * A blood test belongs to the person, not to a clinic (see the clinic
 * boundary), so the reports here include patients whose course is with
 * another clinic — tagged with that clinic's name.
 */
export async function PredictOverview() {
  const context = await clinicContext()
  if (!context) return null
  const clinicId = context.clinic.id

  // Stored times are UTC; the team reads IST.
  const ist = (col: string) => sql.raw(`to_char(${col} + interval '5 hours 30 minutes', 'DD Mon YYYY')`)

  const [stats, recent, pendingAge, orders, referrals] = await Promise.all([
    db.execute<{
      patients: number
      reports: number
      reports_month: number
      with_age: number
      waiting_age: number
      app_linked: number
      referrals_open: number
      from_clinics: number
    }>(sql`
      with tested as (
        select distinct pr.id, pr.contact_id, pr.user_id
        from report r join patient_record pr on pr.id = r.patient_id
      ), aged as (
        select distinct coalesce(b.patient_id, pr.id) as id
        from biological_age_result b left join patient_record pr on pr.user_id = b.user_id
      )
      select
        (select count(*)::int from patient_record pr join contact ct on ct.id = pr.contact_id where ct.clinic_id = ${clinicId}) as patients,
        (select count(*)::int from report) as reports,
        (select count(*)::int from report where uploaded_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 hours 30 minutes') as reports_month,
        (select count(*)::int from tested t where t.id in (select id from aged)) as with_age,
        (select count(*)::int from tested t where t.id not in (select id from aged where id is not null)) as waiting_age,
        (select count(*)::int from tested t where t.user_id is not null) as app_linked,
        (select count(*)::int from predict_referral where status = 'referred') as referrals_open,
        (select count(*)::int from tested t join contact ct on ct.id = t.contact_id where ct.clinic_id is distinct from ${clinicId}) as from_clinics
    `),
    db.execute<{ contact_id: string; name: string; code: string; type: string; on: string; clinic: string | null }>(sql`
      select pr.contact_id, trim(pr.first_name || ' ' || coalesce(pr.last_name, '')) as name, pr.patient_code as code,
             r.report_type as type, ${ist("r.uploaded_at")} as "on",
             case when ct.clinic_id is distinct from ${clinicId} then coalesce(cl.short_name, cl.name) end as clinic
      from report r
      join patient_record pr on pr.id = r.patient_id
      left join contact ct on ct.id = pr.contact_id
      left join clinic cl on cl.id = ct.clinic_id
      order by r.uploaded_at desc
      limit 12
    `),
    db.execute<{ contact_id: string; name: string; code: string; on: string }>(sql`
      select pr.contact_id, trim(pr.first_name || ' ' || coalesce(pr.last_name, '')) as name, pr.patient_code as code,
             ${ist("max(r.uploaded_at)")} as "on"
      from report r join patient_record pr on pr.id = r.patient_id
      where not exists (
        select 1 from biological_age_result b
        where b.patient_id = pr.id or (pr.user_id is not null and b.user_id = pr.user_id)
      )
      group by pr.id, pr.contact_id, pr.first_name, pr.last_name, pr.patient_code
      order by max(r.uploaded_at) desc
      limit 12
    `),
    db.execute<{ contact_id: string | null; name: string | null; status: string; on: string }>(sql`
      select o.contact_id, coalesce(ct.name, trim(pr.first_name || ' ' || coalesce(pr.last_name, ''))) as name,
             o.status, to_char(o.ordered_on, 'DD Mon YYYY') as "on"
      from blood_test_order o
      left join contact ct on ct.id = o.contact_id
      left join patient_record pr on pr.id = o.patient_id
      where o.status in ('ordered', 'collected')
      order by o.ordered_on desc
      limit 12
    `),
    db.execute<{ contact_id: string | null; name: string | null; clinic: string | null; services: string[]; on: string }>(sql`
      select p.contact_id, ct.name, coalesce(cl.short_name, cl.name) as clinic, p.services, ${ist("p.created_at")} as "on"
      from predict_referral p
      left join contact ct on ct.id = p.contact_id
      left join clinic cl on cl.id = p.clinic_id
      where p.status = 'referred'
      order by p.created_at desc
      limit 12
    `),
  ])

  const s = stats.rows[0]!
  const person = (id: string | null) => (id ? `/people/${id}?tab=lab` : "/patients")

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard label="Predict patients" value={s.patients} icon={Users} color="bg-sky-500/12 text-sky-700 dark:text-sky-300" />
        <StatCard
          label="Blood reports"
          value={s.reports}
          hint={`${s.reports_month} this month`}
          icon={Droplets}
          color="bg-rose-500/12 text-rose-700 dark:text-rose-300"
        />
        <StatCard
          label="Biological age done"
          value={s.with_age}
          hint={`${s.waiting_age} waiting`}
          icon={Activity}
          color="bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
        />
        <StatCard
          label="On the app"
          value={s.app_linked}
          hint="tested patients with a login"
          icon={Smartphone}
          color="bg-violet-500/12 text-violet-700 dark:text-violet-300"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="relative lg:col-span-7 lg:h-[420px]">
          <Panel title="Latest blood reports" icon={FlaskConical} fill scroll action={<PanelLink href="/lab" label="Lab" />}>
            {recent.rows.length === 0 ? (
              <Empty icon={FlaskConical} title="No blood reports yet" hint="Reports appear here as they are uploaded." />
            ) : (
              <div className="divide-y divide-black/12 dark:divide-white/10">
                {recent.rows.map((r, i) => (
                  <Link
                    key={`${r.contact_id}-${i}`}
                    href={person(r.contact_id)}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{r.name || "Unknown"}</div>
                      <div className="mt-0.5 text-xs text-black/60 dark:text-white/45">
                        {r.code} · <span className="capitalize">{r.type}</span> report · {r.on}
                      </div>
                    </div>
                    {r.clinic && (
                      <span className="shrink-0 rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                        {r.clinic}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="relative lg:col-span-5 lg:h-[420px]">
          <Panel title="Biological age pending" icon={Hourglass} fill scroll>
            {pendingAge.rows.length === 0 ? (
              <Empty icon={Activity} title="All caught up" hint="Every blood report has a biological age." />
            ) : (
              <div className="divide-y divide-black/12 dark:divide-white/10">
                {pendingAge.rows.map((r) => (
                  <Link
                    key={r.contact_id}
                    href={person(r.contact_id)}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{r.name || "Unknown"}</div>
                      <div className="mt-0.5 text-xs text-black/60 dark:text-white/45">
                        {r.code} · report {r.on}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-6">
          <Panel title="Blood tests in progress" icon={Droplets} fill>
            {orders.rows.length === 0 ? (
              <Empty icon={Droplets} title="No tests in progress" hint="Ordered and collected samples show here until the report is in." />
            ) : (
              <div className="divide-y divide-black/12 dark:divide-white/10">
                {orders.rows.map((o, i) => (
                  <Link
                    key={i}
                    href={person(o.contact_id)}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{o.name || "Unknown"}</div>
                      <div className="mt-0.5 text-xs text-black/60 dark:text-white/45">Ordered {o.on}</div>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-black/60 dark:text-white/45">
                      {o.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-6">
          <Panel title="Referred by clinics" icon={Send} fill>
            {referrals.rows.length === 0 ? (
              <Empty
                icon={Send}
                title="No open referrals"
                hint={`${s.from_clinics} tested ${s.from_clinics === 1 ? "patient is" : "patients are"} treated at another clinic.`}
              />
            ) : (
              <div className="divide-y divide-black/12 dark:divide-white/10">
                {referrals.rows.map((r, i) => (
                  <Link
                    key={i}
                    href={person(r.contact_id)}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{r.name || "Unknown"}</div>
                      <div className="mt-0.5 text-xs text-black/60 dark:text-white/45">
                        {(r.services ?? []).join(", ").replace(/_/g, " ")} · {r.on}
                      </div>
                    </div>
                    {r.clinic && (
                      <span className="shrink-0 rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                        {r.clinic}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
