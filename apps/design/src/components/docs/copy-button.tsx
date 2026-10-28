"use client";

import { Button } from "@workspace/ui/components/button";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";

import { useCopyToClipboard } from "@/src/hooks/use-copy";

import { cn } from "@workspace/ui/lib/utils";

import { Check, Copy } from "lucide-react";

import type * as React from "react";

export function CopyButton({
  value,
  className,
  variant = "ghost",
  ...props
}: React.ComponentProps<typeof Button> & {
  value: string;
  src?: string;
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn(
              "absolute top-1.5 right-1.5 z-3 size-9 bg-code opacity-70 hover:opacity-100 focus-visible:opacity-100 sm:size-8",
              className
            )}
            data-slot="copy-button"
            onClick={() => copyToClipboard(value)}
            size="icon"
            variant={variant}
            {...props}
          >
            <span className="sr-only">Copy</span>

            {isCopied ? (
              <Check strokeWidth={2} />
            ) : (
              <Copy strokeWidth={2} />
            )}
          </Button>
        }
      />

      <TooltipContent>
        {isCopied ? "Copied" : "Copy to Clipboard"}
      </TooltipContent>
    </Tooltip>
  );
}