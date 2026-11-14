"use client";

import { PlusIcon, MessageSquareIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { cn } from "@workspace/ui/lib/utils";

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  loading: boolean;
  className?: string;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  loading,
  className,
}: ConversationSidebarProps) {
  return (
    <div className={cn("flex h-full w-64 shrink-0 flex-col border-r", className)}>
      <div className="p-3">
        <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Chat history
        </p>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onNewChat}>
          <PlusIcon className="size-4" />
          New chat
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-1 p-2 pt-0">
          {conversations.length === 0 && !loading && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          )}

          {conversations.map((conversation) => (
            <Button variant="ghost" size="default"
 key={conversation.id}
 type="button"
 onClick={() => onSelect(conversation.id)}
 className={cn(
 "flex min-w-0 items-center gap-2 px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted md:py-2",
 conversation.id === activeId && "bg-muted font-medium",
 )}
 >
              <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{conversation.title || "New chat"}</span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
