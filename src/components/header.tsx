import { formatDistanceToNow } from "date-fns";
import { AvatarMenu } from "@/components/avatar-menu";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import type { AiProviderName } from "@/lib/config";
import type { GmailConnection } from "@/lib/db/repo";

type Props = { connection: GmailConnection | null; lastScanAt?: string | null; aiProvider: AiProviderName | null };

export function Header({ connection, lastScanAt, aiProvider }: Props) {
  const active = connection?.status === "active";

  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <Logo />

      <div className="flex items-center gap-3 text-sm">
        {active ? (
          <span className="text-muted-foreground">
            <span className="text-ring">●</span> Connected as {connection.google_email}
          </span>
        ) : (
          <a href="/auth/sign-in?consent=1" className={buttonVariants({ size: "sm" })}>
            {connection ? "Reconnect Gmail" : "Connect Gmail"}
          </a>
        )}
        {lastScanAt && (
          <span className="text-muted-foreground">Last scanned {formatDistanceToNow(new Date(lastScanAt), { addSuffix: true })}</span>
        )}
        <AvatarMenu hasConnection={Boolean(connection)} aiProvider={aiProvider} />
      </div>
    </header>
  );
}
