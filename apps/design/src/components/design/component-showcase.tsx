"use client"

import * as React from "react"
import Link from "next/link"
import {
  ActivityIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookmarkIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  FileTextIcon,
  HomeIcon,
  PlusIcon,
  ShareIcon,
  StarIcon,
} from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@workspace/ui/components/number-field"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@workspace/ui/components/progress"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Slider } from "@workspace/ui/components/slider"
import { Switch } from "@workspace/ui/components/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { biomarkerRange, getBiomarker } from "@workspace/ui/lib/biomarkers"
import { cn } from "@workspace/ui/lib/utils"
import { AgeBar } from "@workspace/ui/predict/age-bar"
import { BioClock } from "@workspace/ui/predict/bio-clock"
import { PredictLoader } from "@workspace/ui/predict/loader"
import { Logo, LogoIcon } from "@workspace/ui/predict/logo"
import { PredictMascot } from "@workspace/ui/predict/predict-mascot"
import { AgeCalculator } from "@workspace/ui/tools/age-calculator"
import { BodyMeasurements } from "@workspace/ui/tools/body-measurements"
import { ReferenceRange } from "@workspace/ui/tools/reference-range"

const markers = [
  "ApoB",
  "LDL-C",
  "HDL-C",
  "Triglycerides",
  "Lp(a)",
  "HbA1c",
  "Fasting glucose",
  "hs-CRP",
  "Ferritin",
  "Vitamin D",
  "TSH",
  "eGFR",
]

function CalendarPreview() {
  const [date, setDate] = React.useState<Date | undefined>(new Date())

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      className="rounded-lg border"
    />
  )
}

function SliderPreview() {
  const [sleep, setSleep] = React.useState(7)
  const labelId = React.useId()

  return (
    <div className="grid w-full max-w-56 gap-3">
      <div className="flex justify-between text-xs">
        <span id={labelId} className="font-medium">Average sleep</span>
        <span className="text-muted-foreground tabular-nums">{sleep} h</span>
      </div>
      <Slider
        aria-labelledby={labelId}
        value={[sleep]}
        onValueChange={(value) => setSleep(Array.isArray(value) ? value[0]! : value)}
        min={3}
        max={12}
        step={0.5}
      />
    </div>
  )
}

type ShowcaseItem = {
  name: string
  href: string
  preview: React.ReactNode
  /** Grid span classes for tiles that need more room. */
  className?: string
}

const crp = getBiomarker("hs-crp")!

const components: ShowcaseItem[] = [
  {
    name: "Accordion",
    href: "/docs/components/accordion",
    preview: (
      <Accordion defaultValue={["fasting"]} className="max-w-60">
        <AccordionItem value="fasting">
          <AccordionTrigger>Do I need to fast?</AccordionTrigger>
          <AccordionContent>Yes. Fast for 10 to 12 hours.</AccordionContent>
        </AccordionItem>
        <AccordionItem value="results">
          <AccordionTrigger>When are results ready?</AccordionTrigger>
          <AccordionContent>Within 48 hours of collection.</AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
  },
  {
    name: "Button",
    href: "/docs/components/button",
    preview: (
      <div className="flex max-w-60 flex-wrap items-center justify-center gap-2">
        <Button size="sm">Book test</Button>
        <Button size="sm" variant="outline">
          Details
        </Button>
        <Button size="sm" variant="secondary">
          Later
        </Button>
        <Button size="icon-sm" variant="invert" aria-label="Add">
          <PlusIcon />
        </Button>
      </div>
    ),
  },
  {
    name: "Calendar",
    href: "/docs/components/calendar",
    preview: <CalendarPreview />,
  },
  {
    name: "Card",
    href: "/docs/components/card",
    preview: (
      <Card size="sm" className="w-full max-w-60">
        <CardHeader>
          <CardTitle>ApoB</CardTitle>
          <CardDescription>Collected 12 Oct</CardDescription>
          <CardAction>
            <ActivityIcon className="size-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-medium tabular-nums">
            78 <span className="text-sm text-muted-foreground">mg/dL</span>
          </p>
        </CardContent>
      </Card>
    ),
  },
  {
    name: "Collapsible",
    href: "/docs/components/collapsible",
    preview: (
      <Collapsible className="flex w-full max-w-60 flex-col gap-2">
        <div className="flex items-center justify-between gap-4 ps-3">
          <p className="text-xs font-medium">3 markers out of range</p>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="Toggle markers" />}
          >
            <ChevronsUpDownIcon />
          </CollapsibleTrigger>
        </div>
        <div className="rounded-md border px-3 py-2 text-xs">LDL-C · 142 mg/dL</div>
        <CollapsibleContent className="flex flex-col gap-2">
          <div className="rounded-md border px-3 py-2 text-xs">HbA1c · 5.9 %</div>
          <div className="rounded-md border px-3 py-2 text-xs">Vitamin D · 22 ng/mL</div>
        </CollapsibleContent>
      </Collapsible>
    ),
  },
  {
    name: "Dialog",
    href: "/docs/components/dialog",
    preview: (
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          Delete report
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this report?</DialogTitle>
            <DialogDescription>
              The October panel and its notes will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Keep report
            </DialogClose>
            <DialogClose render={<Button variant="destructive" size="sm" />}>
              Delete
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    name: "Input",
    href: "/docs/components/input",
    preview: (
      <label className="grid w-full max-w-56 gap-1.5 text-xs font-medium">
        Email
        <Input type="email" placeholder="you@example.com" />
      </label>
    ),
  },
  {
    name: "Label",
    href: "/docs/components/label",
    preview: (
      <div className="grid w-full max-w-56 gap-1.5">
        <Label htmlFor="showcase-full-name">Full name</Label>
        <Input id="showcase-full-name" placeholder="Priya Sharma" />
      </div>
    ),
  },
  {
    name: "Number Field",
    href: "/docs/components/number-field",
    preview: (
      <NumberField defaultValue={70} min={20} max={300} className="max-w-44">
        <NumberFieldScrubArea label="Weight (kg)" />
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
    ),
  },
  {
    name: "Popover",
    href: "/docs/components/popover",
    preview: (
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          What is ApoB?
        </PopoverTrigger>
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Apolipoprotein B</PopoverTitle>
            <PopoverDescription>
              Counts the particles that carry cholesterol into artery walls.
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    ),
  },
  {
    name: "Progress",
    href: "/docs/components/progress",
    preview: (
      <div className="grid w-full max-w-56 gap-6">
        <Progress value={66}>
          <ProgressLabel>Analysing panel</ProgressLabel>
          <ProgressValue />
        </Progress>
        <Progress value={4} max={6}>
          <ProgressLabel>Onboarding</ProgressLabel>
          <ProgressValue>{() => "4 of 6"}</ProgressValue>
        </Progress>
      </div>
    ),
  },
  {
    name: "Radio Group",
    href: "/docs/components/radio-group",
    preview: (
      <RadioGroup defaultValue="weekly" aria-label="Exercise frequency" className="w-fit">
        <label className="flex items-center gap-2 text-xs">
          <RadioGroupItem value="daily" />
          Every day
        </label>
        <label className="flex items-center gap-2 text-xs">
          <RadioGroupItem value="weekly" />A few times a week
        </label>
        <label className="flex items-center gap-2 text-xs">
          <RadioGroupItem value="rarely" />
          Rarely
        </label>
      </RadioGroup>
    ),
  },
  {
    name: "Scroll Area",
    href: "/docs/components/scroll-area",
    preview: (
      <ScrollArea className="h-44 w-48 rounded-md border">
        <div className="p-3">
          {markers.map((marker) => (
            <div key={marker}>
              <div className="text-xs">{marker}</div>
              <Separator className="my-2" />
            </div>
          ))}
        </div>
      </ScrollArea>
    ),
  },
  {
    name: "Separator",
    href: "/docs/components/separator",
    preview: (
      <div className="w-full max-w-56">
        <p className="text-sm font-medium">Heart health</p>
        <p className="text-xs text-muted-foreground">Seven markers</p>
        <Separator className="my-3" />
        <div className="flex h-4 items-center gap-3 text-xs">
          <span>Overview</span>
          <Separator orientation="vertical" />
          <span>History</span>
          <Separator orientation="vertical" />
          <span>Notes</span>
        </div>
      </div>
    ),
  },
  {
    name: "Sheet",
    href: "/docs/components/sheet",
    preview: (
      <Sheet>
        <SheetTrigger render={<Button variant="outline" size="sm" />}>Add a note</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add a note</SheetTitle>
            <SheetDescription>
              Notes stay with this panel and show up in your report.
            </SheetDescription>
          </SheetHeader>
          <div className="px-6">
            <label className="grid gap-1.5 text-xs font-medium">
              Note
              <Input placeholder="Slept 5 hours before the draw" />
            </label>
          </div>
          <SheetFooter>
            <SheetClose render={<Button size="sm" />}>Save note</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    ),
  },
  {
    name: "Sidebar",
    href: "/docs/components/sidebar",
    preview: (
      <SidebarProvider className="min-h-0 w-auto">
        <Sidebar collapsible="none" className="h-52 w-48 rounded-lg border">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Health</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>
                      <HomeIcon />
                      <span>Home</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <ActivityIcon />
                      <span>Biomarkers</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>3</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <FileTextIcon />
                      <span>Reports</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    ),
  },
  {
    name: "Skeleton",
    href: "/docs/components/skeleton",
    preview: (
      <div className="flex w-full max-w-56 items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    ),
  },
  {
    name: "Slider",
    href: "/docs/components/slider",
    preview: <SliderPreview />,
  },
  {
    name: "Switch",
    href: "/docs/components/switch",
    preview: (
      <div className="grid w-full max-w-56 gap-4">
        <label className="flex items-center justify-between gap-4 text-xs">
          Result notifications
          <Switch defaultChecked />
        </label>
        <label className="flex items-center justify-between gap-4 text-xs">
          Share with my doctor
          <Switch />
        </label>
      </div>
    ),
  },
  {
    name: "Tabs",
    href: "/docs/components/tabs",
    preview: (
      <Tabs defaultValue="overview" className="items-center">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="text-center text-muted-foreground">
          Latest reading is within range.
        </TabsContent>
        <TabsContent value="history" className="text-center text-muted-foreground">
          Three panels in the last year.
        </TabsContent>
      </Tabs>
    ),
  },
  {
    name: "Toggle",
    href: "/docs/components/toggle",
    preview: (
      <div className="flex items-center gap-2">
        <Toggle aria-label="Bookmark" defaultPressed>
          <BookmarkIcon />
        </Toggle>
        <Toggle variant="outline" aria-label="Favourite">
          <StarIcon />
        </Toggle>
      </div>
    ),
  },
  {
    name: "Tooltip",
    href: "/docs/components/tooltip",
    preview: (
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="outline" size="icon" aria-label="Download report" />}
          >
            <DownloadIcon />
          </TooltipTrigger>
          <TooltipContent>Download report</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="outline" size="icon" aria-label="Share with doctor" />}
          >
            <ShareIcon />
          </TooltipTrigger>
          <TooltipContent>Share with doctor</TooltipContent>
        </Tooltip>
      </div>
    ),
  },
]

const predictUi: ShowcaseItem[] = [
  {
    name: "Bio Clock",
    href: "/docs/ui/bio-clock",
    className: "md:col-span-2",
    preview: (
      <BioClock
        bioAge={51}
        yearsValue="+4 Years"
        currentValue={2.4}
        className="max-w-md"
      />
    ),
  },
  {
    name: "Mascot",
    href: "/docs/ui/mascot",
    preview: <PredictMascot className="size-30" />,
  },
  {
    name: "Age Bar",
    href: "/docs/ui/age-bar",
    className: "md:col-span-2",
    preview: (
      <div className="w-full max-w-lg">
        <AgeBar biologicalAge={48} chronologicalAge={38} />
      </div>
    ),
  },
  {
    name: "Loader",
    href: "/docs/ui/loader",
    preview: <PredictLoader size={48} />,
  },
  {
    name: "Logo",
    href: "/docs/ui/logo",
    className: "md:col-span-2 lg:col-span-3",
    preview: (
      <div className="flex flex-wrap items-center justify-center gap-10">
        <Logo role="img" aria-label="PREDICT" className="h-10 size-80" />
        <LogoIcon aria-hidden className="size-12" />
      </div>
    ),
  },
]

const tools: ShowcaseItem[] = [
  {
    name: "Body Measurements",
    href: "/docs/tools/body-measurements",
    className: "md:col-span-2",
    preview: <BodyMeasurements />,
  },
  {
    name: "Reference Range",
    href: "/docs/tools/reference-range",
    className: "md:col-span-2 lg:col-span-1",
    preview: (
      <ReferenceRange
        name={crp.abbreviation}
        description={crp.name}
        value={3.5}
        unit={crp.unit}
        range={biomarkerRange(crp)}
        className="max-w-xs"
      />
    ),
  },
  {
    name: "Age Calculator",
    href: "/docs/tools/age-calculator",
    className: "md:col-span-2 lg:col-span-3",
    preview: <AgeCalculator />,
  },
]

function ShowcaseTile({ item }: { item: ShowcaseItem }) {
  return (
    <div className={cn("flex flex-col bg-white dark:bg-black", item.className)}>
      <div className="flex min-h-72 flex-1 items-center justify-center p-6">
        {item.preview}
      </div>
      <Link
        href={item.href}
        className="group flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground transition hover:text-foreground"
      >
        {item.name}
        <ArrowUpRightIcon className="size-3.5 transition group-hover:-translate-y-px group-hover:translate-x-px" />
      </Link>
    </div>
  )
}

function SectionHeading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-1 border-b px-6 py-8 md:px-10">
      <h2 className="text-xl font-medium tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

export function ComponentShowcase() {
  return (
    <TooltipProvider>
      <section className="border-b px-6 py-20 md:px-10 md:py-28">
        <div className="mb-3 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Design System
        </div>
        <h1 className="max-w-3xl text-4xl font-medium tracking-tight md:text-6xl">
          Components for clear health interfaces
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
          The shared building blocks behind PREDICT dashboards, reports, and
          clinical tools. Every component below is live. Try it, then open its
          docs.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button nativeButton={false} render={<Link href="/docs/components/accordion" />}>
            Browse components
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/docs" />}>
            Read the docs
          </Button>
        </div>
      </section>

      <SectionHeading
        title="Components"
        description="Inputs, overlays, and layout pieces, built on Base UI."
      />
      <section className="grid gap-px border-b bg-border md:grid-cols-2 lg:grid-cols-3">
        {components.map((item) => (
          <ShowcaseTile key={item.href} item={item} />
        ))}
        <Link
          href="/docs/components"
          className="group flex min-h-40 flex-col justify-between bg-white p-6 transition hover:bg-muted/40 md:col-span-2 dark:bg-black"
        >
          <span className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {components.length} components
          </span>
          <span className="flex items-center justify-between text-2xl font-medium tracking-tight">
            View all in the docs
            <ArrowRightIcon className="size-5 transition group-hover:translate-x-1" />
          </span>
        </Link>
      </section>

      <SectionHeading
        title="PREDICT UI"
        description="The brand and the pieces that sum up a person's results."
      />
      <section className="grid grid-flow-row-dense gap-px border-b bg-border md:grid-cols-2 lg:grid-cols-3">
        {predictUi.map((item) => (
          <ShowcaseTile key={item.href} item={item} />
        ))}
      </section>

      <SectionHeading
        title="Tools"
        description="Calculators and result cards for health data."
      />
      <section className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
        {tools.map((item) => (
          <ShowcaseTile key={item.href} item={item} />
        ))}
      </section>
    </TooltipProvider>
  )
}
