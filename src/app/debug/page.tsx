import { notFound } from "next/navigation";

export default function DebugPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-xl font-semibold">Debug</h1>
      <p className="mt-2 text-sm text-muted-foreground">Dev-only classify preview. Coming in a later phase.</p>
    </main>
  );
}
