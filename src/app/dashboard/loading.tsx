/** A9: loading skeletons while the dashboard's server-fetched data resolves. */
export default function DashboardLoading() {
  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold tracking-tight">Applyly</span>
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      </header>
      <main className="mx-auto w-full max-w-[1600px] space-y-6 p-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="h-24 animate-pulse rounded-lg border bg-muted/40" />
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
            <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
