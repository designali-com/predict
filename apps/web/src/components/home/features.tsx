 
import type React from "react";
import { ZapIcon, ShieldCheckIcon, ActivityIcon, GlobeIcon } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

type FeatureType = {
	title: string;
	icon: React.ReactNode;
	description: string;
};

export function FeaturesSection() {
	return (
        <section className=" border-b border-dashed">
		<div className="mx-auto grid max-w-4xl border-x border-dashed grid-cols-2 gap-4 py-4 md:grid-cols-4">
			{features.map((feature, index) => (
				<div
					className="relative flex flex-col items-center justify-center p-2"
					key={feature.title}
				>
					{feature.icon}
					<h3 className="mt-4 text-center font-medium text-xl lg:text-3xl">
						{feature.title}
					</h3>
					<p className="mt-1 text-center text-muted-foreground text-sm">
						{feature.description}
					</p>
				</div>
			))}
		</div>
        </section>
	);
}

const features: FeatureType[] = [
	{
		title: "3K+",
		icon: (
			<ZapIcon
			/>
		),
		description: "Reports",
	},
	{
		title: "95%",
		icon: (
			<ShieldCheckIcon
			/>
		),
		description: "Accuracy",
	},
	{
		title: "48",
		icon: (
			<ActivityIcon
			/>
		),
		description: "Hours",
	},
	{
		title: "40+",
		icon: (
			<GlobeIcon
			/>
		),
		description: "Biomarkers",
	},
];
