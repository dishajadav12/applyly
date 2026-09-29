/**
 * Phase 11: a prominent "needs_reconnect" banner (distinct from the header's small status
 * button), shown above the scan controls when Gmail access has lapsed — most commonly Google's
 * 7-day refresh-token expiry in OAuth Testing mode (D17).
 */
export function ReconnectBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <span className="text-destructive">
        Gmail access needs to be reconnected. This usually happens after 7 days in Google&apos;s Testing mode.
      </span>
      <a href="/auth/sign-in?consent=1" className="font-medium text-destructive underline underline-offset-2">
        Reconnect Gmail
      </a>
    </div>
  );
}
