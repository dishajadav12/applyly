import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Applyly</h1>
      <p className="text-muted-foreground">
        Reconstruct your job applications from Gmail. Read-only access, and email bodies are never stored.
      </p>
      <div>
        <Button disabled>Sign in with Google (coming soon)</Button>
      </div>
    </main>
  );
}
