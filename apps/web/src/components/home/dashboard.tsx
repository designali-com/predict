import { Badge } from "@workspace/ui/components/badge";



export function DashboardSection() {
	return (
		<section className="mx-auto border-b border-dashed pb-10 w-full">
			<div className="flex items-center py-20  mx-auto max-w-60 md:max-w-md text-center space-y-4 justify-center w-full flex-col">
				<Badge>
					Inside the Platform
				</Badge>
				<h1 className="text-3xl font-medium">
					Your results. Your protocol. <br /> One dashboard.
				</h1>
				<p className="text-muted-foreground">
					Muscle-first diagnostics, specialist protocols, and continuous blood intelligence - combined. Both tests read the same underlying system, muscle, through the one medium that sees everything: blood.
				</p>
			</div>
 

			<div className="relative shadow-2xl max-w-80 md:max-w-4xl border rounded-3xl mx-auto p-2">
				<img
					alt="app screen"
					className="z-2 object-contain dark:hidden"
					height="1080"
					src="/images/dashboard-light.jpg"
					width="1920"
				/>
				<img
					alt="app screen"
					className="hidden object-contain bg-background dark:block"
					height="1080"
					src="/images/dashboard-dark.jpg"
					width="1920"
				/>
			</div>
			
			<p className="text-muted-foreground mx-auto max-w-80 md:max-w-full text-center pt-10">
				BLOOD BIOMARKER ANALYSIS · MUSCLE IMAGING SCAN
			</p>
		</section>
	);
}
