import { DisconnectButton } from "@/components/disconnect-button";
import { Button, buttonVariants } from "@/components/ui/button";
import type { GmailConnection } from "@/lib/db/repo";

type Props = { connection: GmailConnection | null };

export function Header({ connection }: Props) {
  const active = connection?.status === "active";

  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <span className="font-semibold tracking-tight">Applyly</span>

      <div className="flex items-center gap-3 text-sm">
        {active ? (
          <span className="text-muted-foreground">
            <span className="text-green-600">●</span> Connected as {connection.google_email}
          </span>
        ) : (
          <a href="/auth/sign-in?consent=1" className={buttonVariants({ size: "sm" })}>
            {connection ? "Reconnect Gmail" : "Connect Gmail"}
          </a>
        )}
        {connection && <DisconnectButton />}
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
