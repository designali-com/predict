"use client"
import { Button } from "@workspace/ui/components/button"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Home,
  MessagesSquare,
  MessageCircle,
  PhoneCall,
  UserSearch,
  HeartPulse,
  ListChecks,
  CalendarDays,
  Workflow,
  Megaphone,
  FileText,
  Images,
  UsersRound,
  Route,
  Bot,
  SlidersHorizontal,
  Building2,
  BarChart3,
  LogOut,
  X,
  Check,
  ChevronsUpDown,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  useSidebar,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { toast } from "@workspace/ui/components/sonner"
import { authClient } from "@/src/lib/auth/auth-client"
import { useOpsClinics } from "@/src/components/clinic-switcher"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

/**
 * Grouped by when you use a screen, not by which subsystem it belongs to.
 * WORK is the daily job; AUTOMATION and SETUP change what every future contact
 * receives, so they sit at the bottom out of the way.
 *
 * Every entry names the permission that opens it, and only what the signed-in
 * role actually holds is rendered. Nothing here is keyed on a role — a role
 * invented in the permission editor gets a correct sidebar with no code change,
 * which is the whole point. A section whose items are all filtered out
 * disappears rather than leaving a heading over nothing.
 *
 * Hiding a link is not an access control: every page behind these checks the
 * same permission again, server-side.
 *
 * Built on the shared Sidebar from @workspace/ui rather than a hand-rolled
 * <aside>. The clinic panel already uses it, and two panels of one product
 * should not have two sidebars that drift apart whenever either is touched.
 * It also brings collapse and the mobile drawer, neither of which the
 * hand-rolled column had.
 */
const NAV_SECTIONS = [
  {
    label: null,
    items: [{ label: "Home", href: "/home", icon: Home, permission: "ops.home" }],
  },
  {
    label: "Work",
    items: [
      { label: "Inbox", href: "/conversations", icon: MessageCircle, permission: "ops.inbox" },
      // Where a telecaller starts the day: who to phone now, in order. Above
      // Leads because it is the list of what to do, and Leads is the list of
      // everyone.
      { label: "Call queue", href: "/call-queue", icon: PhoneCall, permission: "ops.leads" },
      // Two lists, because chasing an enquiry and looking after someone under
      // care are two jobs — see @workspace/db/contact-side.
      { label: "Leads", href: "/leads", icon: UserSearch, permission: "ops.leads" },
      { label: "Patients", href: "/patients", icon: HeartPulse, permission: "ops.patients" },
      { label: "Tasks", href: "/tasks", icon: ListChecks, permission: "ops.tasks" },
      {
        label: "Appointments",
        href: "/appointments",
        icon: CalendarDays,
        permission: "ops.appointments",
        // A clinic without appointments (Predict: diagnosis only) has no schedule.
        module: "appointments",
      },
    ],
  },
  {
    label: "Automation",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3, permission: "ops.reports" },
      { label: "Campaigns", href: "/campaigns", icon: Megaphone, permission: "ops.campaigns" },
      { label: "Flows", href: "/flows", icon: Workflow, permission: "ops.flows" },
      { label: "Stage messages", href: "/stage-messages", icon: MessagesSquare, permission: "ops.flows" },
    ],
  },
  {
    label: "Setup",
    items: [
      { label: "Templates", href: "/templates", icon: FileText, permission: "ops.templates" },
      { label: "Media", href: "/stock", icon: Images, permission: "ops.media" },
      { label: "Audiences", href: "/audience", icon: UsersRound, permission: "ops.audiences" },
      { label: "Lead routing", href: "/lead-routing", icon: Route, permission: "ops.lead_routing" },
      { label: "AI replies", href: "/ai-replies", icon: Bot, permission: "ops.ai_replies" },
      {
        label: "Automation settings",
        href: "/automation-settings",
        icon: SlidersHorizontal,
        permission: "ops.automation_settings",
      },
      { label: "Clinics", href: "/clinics", icon: Building2, permission: "ops.clinics" },
    ],
  },
]

const UNREAD_POLL_MS = 20_000

interface UnreadState {
  count: number
  latest: { id: string; conversationId: string; body: string | null; from: string | null } | null
}

/**
 * The Inbox badge, polled. Also where "someone just wrote in" becomes a
 * toast: the newest unread message is compared with the last one seen, and a
 * new one pops up wherever the person is — except inside the inbox itself,
 * where the message is already on screen.
 */
function useInboxUnread(
  enabled: boolean,
  pathname: string,
  router: ReturnType<typeof useRouter>,
): number {
  const [count, setCount] = React.useState(0)
  const lastSeen = React.useRef<string | null | undefined>(undefined)
  const where = React.useRef(pathname)
  where.current = pathname

  React.useEffect(() => {
    if (!enabled) return
    let stopped = false

    const check = async () => {
      if (document.hidden) return
      const d = (await fetch("/api/conversations/unread")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as UnreadState | null
      if (!d || stopped) return
      setCount(d.count)

      const latest = d.latest
      // The first answer only sets the baseline — messages that were already
      // waiting are the badge's job, not a burst of toasts on page load.
      if (lastSeen.current !== undefined && latest && latest.id !== lastSeen.current) {
        if (!where.current.startsWith("/conversations")) {
          toast(`New message from ${latest.from ?? "a contact"}`, {
            description: latest.body ? latest.body.slice(0, 120) : undefined,
            action: { label: "Open", onClick: () => router.push("/conversations") },
          })
        }
      }
      lastSeen.current = latest?.id ?? null
    }

    check()
    const timer = setInterval(check, UNREAD_POLL_MS)
    const onVisible = () => !document.hidden && check()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled, router])

  // Opening a thread marks it read on the server; ask again when the page
  // changes so the badge drops without waiting for the next poll.
  // The inbox also says so when it opens a thread without changing the URL.
  React.useEffect(() => {
    if (!enabled) return
    const recount = () =>
      fetch("/api/conversations/unread")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: UnreadState | null) => d && setCount(d.count))
        .catch(() => {})
    const t = setTimeout(recount, 1500)
    window.addEventListener("inbox:read", recount)
    return () => {
      clearTimeout(t)
      window.removeEventListener("inbox:read", recount)
    }
  }, [enabled, pathname])

  return count
}

export function SidebarNav({
  permissions,
  brand = null,
  modules = null,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  permissions: string[]
  /** The active clinic's modules; a link tied to one it lacks is hidden. Null shows all. */
  modules?: string[] | null
  /** The clinic signed in to: its logo, or its name where it has none. */
  brand?: { name: string; logoUrl: string | null; logoDarkUrl: string | null } | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()

  // On a phone the sidebar is a sheet over the page: once a link has taken
  // you somewhere it should get out of the way.
  React.useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push("/login")
  }

  const held = new Set(permissions)
  const unread = useInboxUnread(held.has("ops.inbox"), pathname, router)
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => held.has(item.permission) && (!modules || !("module" in item) || !item.module || modules.includes(item.module as string)),
    ),
  })).filter((section) => section.items.length > 0)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="bg-background">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between">
            <Link href="/home" className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-1.5">
              {brand?.logoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brand.logoUrl} alt={brand.name} className={`h-8 w-auto max-w-[10rem] object-contain object-left ${brand.logoDarkUrl ? "dark:hidden" : ""}`} />
                  {brand.logoDarkUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.logoDarkUrl} alt={brand.name} className="hidden h-8 w-auto max-w-[10rem] object-contain object-left dark:block" />
                  )}
                </>
              ) : (
                <span className="truncate text-base font-bold tracking-tight">{brand?.name ?? "Predict"}</span>
              )}
              <span className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">Operations</span>
            </Link>
            {isMobile && (
              <Button
                type="button"
                onClick={() => setOpenMobile(false)}
                aria-label="Close menu" size="icon-sm" variant="ghost" className="mr-1">
                <X className="size-5" />
              </Button>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="bg-background">
        {sections.map((section, i) => (
          // Tighter than the shared defaults: this panel has three sections
          // of links, and at the standard spacing they ran past the fold.
          <SidebarGroup key={section.label ?? `section-${i}`} className="py-1">
            {section.label && <SidebarGroupLabel className="h-7">{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0">
                {section.items.map(({ label, href, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(`${href}/`)
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        tooltip={label}
                        isActive={isActive}
                        className="h-8 py-1.5 max-md:h-10 max-md:text-[15px]"
                        render={
                          <Link href={href} onClick={() => setOpenMobile(false)}>
                            <Icon />
                            <span>{label}</span>
                            {href === "/conversations" && unread > 0 && (
                              <span
                                aria-label={`${unread} unread`}
                                className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-none text-white tabular-nums"
                              >
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </Link>
                        }
                      />
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="bg-background">
        {/* The account: who is signed in and in which clinic. The clinic switch
            and Sign out live in its menu, the same as the clinic panel. */}
        <AccountMenu onSignOut={handleSignOut} />
      </SidebarFooter>
    </Sidebar>
  )
}

function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const { data: session } = authClient.useSession()
  const { clinics, active, activeId, switching, switchTo } = useOpsClinics()
  const name = session?.user?.name || session?.user?.email || "Account"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={name} />}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
              {name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{active?.name ?? ""}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            {clinics.length > 0 && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Clinic
                  </DropdownMenuLabel>
                  {clinics.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      disabled={switching || clinics.length === 1}
                      onClick={() => void switchTo(c.id)}
                    >
                      <Building2 className="text-muted-foreground" />
                      <span className="flex-1 truncate">{c.name}</span>
                      {c.id === activeId && <Check />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem variant="destructive" onClick={onSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
