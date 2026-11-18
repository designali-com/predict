"use client";
import type React from "react";
import { useRef } from "react"; 
import StackingCards, {
    StackingCardItem,
} from "@workspace/ui/components/stacking-cards"; 
import { Avatar, AvatarFallback,   } from "@workspace/ui/components/avatar";
import { LogoIcon } from "../logo";

const cards = [
    {

        title: "Ask anything.",
        description:
            "Biological aging happens silently - PREDICT makes it audible.",

    },
    {

        title: "Biological aging happens silently",
        description:
            "Biological aging happens silently - PREDICT makes it audible.",

    },
    {

        title: "PREDICT makes it audible.",
        description:
            "Biological aging happens silently - PREDICT makes it audible.",

    },
];

export function AskSection() {
    const container = useRef<HTMLDivElement>(null);

    return (
        <div className="w-full">
            <div className="flex items-center pt-20 pb-10 space-y-4 justify-center w-full flex-col">
                <h1 className="text-3xl font-medium">A Question.</h1>
            </div>


            <div className="w-full mx-auto max-w-sm md:max-w-4xl">
                <div
                    className="h-full relative w-full"
                    ref={container}
                >
                    <StackingCards
                        totalCards={cards.length}
                        scrollOptions={{ container: container }}
                    >
                        {cards.map(({ description, title }, index) => {
                            return (
                                <StackingCardItem
                                    key={index}
                                    index={index}
                                    className="h-full w-full"
                                >
                                    <div
                                        className="h-full overflow-hidden shadow-2xl/20 border bg-background rounded-3xl flex-col pb-0 p-4 flex w-full relative" >
                                        <div className="flex-1 flex flex-col my-6 mb-10 justify-center text-center">
                                            <h3 className="font-medium max-w-80 mx-auto text-4xl">{title}</h3>

                                        </div>
                                        <ChatInterface />
                                        <div className="pointer-events-none absolute -bottom-40 left-1/2 h-100 w-full -translate-x-1/2 rounded-full bg-gradient-to-t from-primary via-primary to-transparent blur-2xl" />
                                        <div className="pointer-events-none absolute -top-60 left-1/2 h-50 w-full -translate-x-1/2 rounded-full bg-gradient-to-t from-primary via-primary to-transparent blur-2xl" />

                                    </div>

                                </StackingCardItem>
                            );
                        })}
                    </StackingCards>
                </div>
                <p className="text-center text-muted-foreground py-10">
                    MuscleAge™ now 2.4 years younger
                </p>
            </div>
        </div>
    );
}

interface Message {
    id: string;
    sender: "user" | "bot";
    text: string;
}

const messages: Message[] = [
    {
        id: "1",
        sender: "user",
        text: "Why did my Muscle Age improve?",
    },
    {
        id: "2",
        sender: "bot",
        text: "Lower inflammation and stronger muscle function likely contributed.",
    },
    {
        id: "3",
        sender: "user",
        text: "Is my inflammation coming down?",
    },
    {
        id: "4",
        sender: "bot",
        text: "Yes - your inflammation markers are trending downward.",
    },
    {
        id: "5",
        sender: "user",
        text: "Can my blood reveal changes before my body feels them?",
    },
    {
        id: "6",
        sender: "bot",
        text: "Yes. Biology leaves clues months, sometimes years, before symptoms appear.",
    },
];

export function ChatInterface() {
    return (
        <div className="flex justify-center z-20 items-center">
            <div className="w-full h-full max-w-xl bg-background/80 border border-b-0 rounded-t-3xl p-3 md:p-6 space-y-5">
                {messages.map((message) => {
                    const isUser = message.sender === "user";

                    return (
                        <div
                            key={message.id}
                            className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"
                                }`}
                        >
                            {/* Bot Avatar */}
                            {!isUser && (
                                <Avatar className="h-9 w-9 flex items-center justify-center shrink-0 rounded-full">
                                    <AvatarFallback className="bg-white text-purple-600 font-bold text-lg">
                                       <LogoIcon className=""/>
                                    </AvatarFallback>
                                </Avatar>
                            )}

                            {/* Message Bubble */}
                            <div
                                className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm sm:text-base leading-relaxed ${isUser
                                    ? "bg-muted rounded-tr-sm"
                                    : "bg-primary/10 rounded-tl-sm"
                                    }`}
                            >
                                {message.text}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}