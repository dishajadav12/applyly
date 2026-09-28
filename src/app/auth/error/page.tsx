import { buttonVariants } from "@/components/ui/button";

const MESSAGES: Record<string, { title: string; body: React.ReactNode }> = {
  scope: {
    title: "Gmail read access is required",
    body: "Applyly needs read-only access to your Gmail to find job emails. On Google's consent screen, make sure the Gmail permission stays ticked, then try again.",
  },
  no_refresh_token: {
    title: "Google didn't grant offline access",
    body: (
      <>
        Google did not return a long-lived token. Remove Applyly at{" "}
        <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          myaccount.google.com/permissions
        </a>
        , then try again.
      </>
    ),
  },
  denied: {
    title: "Sign-in was cancelled",
    body: "Google sign-in did not complete. You can try again whenever you're ready.",
  },
  exchange: {
    title: "Something went wrong signing you in",
    body: "The sign-in could not be completed. Please try again.",
  },
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = MESSAGES[reason ?? ""] ?? MESSAGES.exchange;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{message.title}</h1>
      <p className="text-sm text-muted-foreground">{message.body}</p>
      <div>
        <a href="/auth/sign-in?consent=1" className={buttonVariants()}>
          Try again
        </a>
      </div>
    </main>
  );
}
