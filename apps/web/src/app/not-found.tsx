import Link from "next/link";
import { Button } from "@workspace/ui/components/button";

export default function NotFound() {
    return (
        <main className="flex min-h-screen items-center justify-center px-6">
            <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                <div className="mb-6 rounded-full border border-border bg-muted px-4 py-2">
                    <span className="text-sm font-medium text-muted-foreground">
                        Error 404
                    </span>
                </div>

                <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
                    Page not found
                </h1>

                <p className="mt-4 max-w-md text-muted-foreground">
                    The page you're looking for doesn't exist, may have been moved,
                    or the URL may be incorrect.
                </p>

                <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                    <Button >
                        <Link href="/">Go Home</Link>
                    </Button>

                    <Button variant="outline">
                        <Link href="/dashboard">Dashboard</Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}