import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { LiquidMetal } from "@paper-design/shaders-react";
import {
	ClaudeAI,
	Grok,
	Instagram,
	LinkedIn,
	OpenAI,
} from "../logos";
import { ThemeSwitcher } from "../common/toggle-mode";

export function Footer() {
	return (
		<footer
			className={cn(
				"relative mx-auto container border-dashed lg:border-x",
			)}
		>
			<div className="grid grid-cols-6 gap-3 p-6">
				{/* -------------------------------- */}
				{/* BRAND / SOCIAL */}
				{/* -------------------------------- */}

				<div className="col-span-6 flex flex-col gap-4 md:col-span-4">
					<p className="max-w-sm text-balance text-muted-foreground text-sm">
						A brand owned by Control Age Health Pvt. Ltd.
					</p>

					<div className="flex items-center gap-1">
						<ThemeSwitcher />

						{socialLinks.map((item, index) => (
							<a
								key={`social-${item.link}-${index}`}
								href={item.link}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Social media"
							>
								<Button
 size="icon-lg"
 variant="ghost"
 >
									{item.icon}
								</Button>
							</a>
						))}
					</div>
				</div>

				{/* -------------------------------- */}
				{/* RESOURCES */}
				{/* -------------------------------- */}

				<div className="col-span-3 hidden w-full md:col-span-1 md:block">
					<span className="text-muted-foreground text-xs">
						Biomarkers
					</span>

					<div className="mt-2 flex flex-col gap-2">
						{biomarkersLinks.map(({ href, label }) => (
							<a
								className="w-max text-sm hover:underline"
								href={href}
								key={label}
							>
								{label}
							</a>
						))}
					</div>
				</div>

				{/* -------------------------------- */}
				{/* COMPANY */}
				{/* -------------------------------- */}

				<div className="col-span-3 w-full md:col-span-1">
					<span className="text-muted-foreground text-xs">
						Company
					</span>

					<div className="mt-2 flex flex-col gap-2">
						{company.map(({ href, title }) => (
							<a
								className="w-max text-sm hover:underline"
								href={href}
								key={title}
							>
								{title}
							</a>
						))}
					</div>
				</div>

				 

				<div className="col-span-3 w-full md:col-span-1">
					<span className="text-muted-foreground text-xs">
						Ask AI about Predict
					</span>

					<div className="mt-2 flex gap-2">
						{aiLinks.map((item, index) => (
							<a
								key={`ai-${index}`}
								href={item.link}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={`Ask ${item.name} about Predict`}
							>
								<Button
 size="icon-lg"
 variant="outline"
 className="group"
 >
									<span className="opacity-60 transition-opacity group-hover:opacity-100">
										{item.icon}
									</span>
								</Button>
							</a>
						))}
					</div>
				</div>
			</div>

			{/* -------------------------------- */}
			{/* COPYRIGHT */}
			{/* -------------------------------- */}

			<div className="flex items-center justify-center gap-2 border-t border-dashed py-4">
				<p className="text-center text-muted-foreground text-xs">
					&copy; {new Date().getFullYear()} Predict Fit, All rights reserved
				</p>
			</div>

			{/* -------------------------------- */}
			{/* LIQUID METAL LOGO */}
			{/* -------------------------------- */}

			<div className="border-t border-dashed">
				<LiquidMetal
					className="mx-auto flex h-full w-full max-w-100 md:max-w-200 xl:max-w-full"
					width={1600}
					height={300}
					image="/logo.svg"
					colorBack="#aaaaac00"
					colorTint="#ffffff"
					shape="diamond"
					repetition={2}
					softness={0.1}
					shiftRed={0.3}
					shiftBlue={0.3}
					distortion={0.07}
					contour={0.4}
					angle={70}
					speed={1}
					scale={0.6}
				/>
			</div>
		</footer>
	);
}

/* -------------------------------- */
/* COMPANY LINKS */
/* -------------------------------- */

const company = [
	{
		title: "About",
		href: "/docs",
	},
	{
		title: "Terms of Service",
		href: "/docs/terms",
	},
];

const biomarkersLinks = [
	{ href: '/biomarkers/aldolase-a', label: 'Aldolase A' },
	{ href: '/biomarkers/crp', label: 'CRP' },
	{ href: '/biomarkers/mda', label: 'MDA' },
	{ href: '/biomarkers/vitamin-d', label: 'Vitamin D' },
]

/* -------------------------------- */
/* RESOURCE LINKS */
/* -------------------------------- */

const resources = [
	{
		title: "Blog",
		href: "#",
	},
	{
		title: "Help Center",
		href: "#",
	},
	{
		title: "Contact Support",
		href: "#",
	},
	{
		title: "Community",
		href: "#",
	},
	{
		title: "Security",
		href: "#",
	},
];

/* -------------------------------- */
/* SOCIAL LINKS */
/* -------------------------------- */

const socialLinks = [
	{
		icon: <Instagram />,
		link: "https://www.instagram.com/predict.fit/",
	},
	{
		icon: <LinkedIn />,
		link: "https://www.linkedin.com/company/predict.fit",
	},
];

/* -------------------------------- */
/* ASK AI LINKS */
/* -------------------------------- */

const predictPrompt = `
Tell me about PREDICT by Predict Fit.

Explain:
1. What PREDICT is
2. How its biomarker-driven approach works
3. What Muscle Age™ means
4. What health insights PREDICT provides
5. How someone can get started

Use information from the official Predict Fit website where possible.
`.trim();

const encodedPrompt = encodeURIComponent(predictPrompt);

const aiLinks = [
	{
		name: "ChatGPT",
		icon: <OpenAI />,
		link: `https://chatgpt.com/?q=${encodedPrompt}`,
	},
	{
		name: "Claude",
		icon: <ClaudeAI />,
		link: `https://claude.ai/new?q=${encodedPrompt}`,
	},
	{
		name: "Grok",
		icon: <Grok />,
		link: `https://grok.com/?q=${encodedPrompt}`,
	},
];