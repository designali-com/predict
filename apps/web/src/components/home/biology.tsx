"use client"

import { useEffect } from "react"
import { motion, stagger, useAnimate } from "motion/react"

import {
	Floating,
	FloatingElement,
} from "@workspace/ui/components/canvasui/image-trail"
import { Badge } from "@workspace/ui/components/badge"

export interface DemoImage {
	url: string
	alt?: string
}

export const exampleImages = Array.from({ length: 8 }, (_, i) => ({ 
	dark: `/images/ecosystem/img-${i + 1}-dark.jpg`,
	alt: `Biology ecosystem ${i + 1}`,
}))

const floatingConfig = [
	{
	  imageIndex: 0,
	  depth: 0.5,
	  className: "top-[8%] left-[50%]",
	  sizeClass: "w-28 h-28 md:w-36 md:h-36",
	},
	{
	  imageIndex: 1,
	  depth: 1,
	  className: "top-[18%] left-[78%]",
	  sizeClass: "w-28 h-28 md:w-36 md:h-36",
	},
	{
	  imageIndex: 2,
	  depth: 2,
	  className: "top-[50%] left-[90%]",
	  sizeClass: "w-28 h-28 md:w-36 md:h-36",
	},
	{
	  imageIndex: 3,
	  depth: 1,
	  className: "top-[78%] left-[78%]",
	  sizeClass: "w-28 h-28 md:w-36 md:h-36",
	},
	{
	  imageIndex: 4,
	  depth: 1,
	  className: "top-[80%] left-[50%]",
	  sizeClass: "w-28 h-28 md:w-36 md:h-36",
	},
	{
	  imageIndex: 5,
	  depth: 2,
	  className: "top-[78%] left-[22%]",
	  sizeClass: "w-28 h-28 md:w-36 md:h-36",
	},
	{
	  imageIndex: 6,
	  depth: 4,
	  className: "top-[50%] left-[15%]",
	  sizeClass: "w-28 h-28 md:w-36 md:h-36",
	},
	{
	  imageIndex: 7,
	  depth: 1,
	  className: "top-[18%] left-[22%]",
	  sizeClass: "w-28 h-28 md:w-36 md:h-36",
	},
  ] as const

export const BiologySection = () => {
	const [scope, animate] = useAnimate()

	useEffect(() => {
		animate("img", { opacity: [0, 1] }, { duration: 0.5, delay: stagger(0.15) })
	}, [animate])

	const text =
		"VO2 MAX · ADVANCED BLOOD TEST · ACTIONABLE INSIGHTS · HYROX TRAINING · CUSTOMISED SUPPLEMENTS · LONGEVITY RETREAT · ";


	return (
		<section className="mx-auto relative border-b overflow-hidden border-dashed pb-10 w-full">
			<div className="w-full h-[700px] relative">
				<div className="absolute top-1/2 left-1/2 pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10">
					<div className="flex items-center py-20 mx-auto max-w-md text-center space-y-4 justify-center w-full flex-col">
						<Badge>The Ecosystem</Badge>
						<h1 className="text-3xl font-medium">
							Everything your biology needs.
						</h1>
						<p className="text-muted-foreground">
							One platform, personalized to you.
						</p>
					</div>
				</div>

				<div className=" overflow-hidden">
					<svg
						viewBox="0 0 300 300"
						className="absolute inset-0 h-full w-full animate-[spin_30s_linear_infinite]"
					>
						<defs>
							<path
								id="circlePath"
								d="  M 150,150 m -115,0 a 115,115 0 1,1 230,0 a 115,115 0 1,1 -230,0"
							/>
						</defs>

						<text
							className="fill-current opacity-10 text-sm font-medium uppercase"
						>
							<textPath href="#circlePath" startOffset="0%">
								{text}
							</textPath>
						</text>
					</svg>
				</div>

				<div
					className="flex w-full h-full justify-center items-center overflow-hidden relative"
					ref={scope}
				>
					<Floating sensitivity={-1} className="overflow-hidden">
						{floatingConfig.map((item, index) => {
							const img = exampleImages[item.imageIndex]

							if (!img) return null

							return (
								<FloatingElement
									key={index}
									depth={item.depth}
									className={item.className}
								> 

									{/* Dark theme */}
									<motion.img
										initial={{ opacity: 0 }}
										src={img.dark}
										alt={img.alt}
										className={`
            ${item.sizeClass}
            object-cover 
            hover:scale-105
            duration-200
            cursor-pointer rounded-xl
            transition-transform border border-dashed  p-1
          `}
									/>
								</FloatingElement>
							)
						})}
					</Floating>
				</div>
			</div>
		</section>
	)
}