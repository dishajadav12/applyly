import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/header";
import { OutreachScan } from "@/components/outreach-scan";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AI_PROVIDERS } from "@/lib/config";
import { getGmailConnection, getUserSettings, listOutreach } from "@/lib/db/repo";
import { gmailMessageUrl } from "@/lib/gmail/links";
import { groupOutreachByCompany } from "@/lib/outreach";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Reference list of the recruiters the user has emailed, one row per company (collected from sent mail by scans). */
export default async function RecruitersPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  const [connection, settings, outreach] = userId
    ? await Promise.all([getGmailConnection(createAdminClient(), userId), getUserSettings(supabase, userId), listOutreach(supabase)])
    : [null, null, []];

  const companies = groupOutreachByCompany(outreach);
  const googleEmail = connection?.google_email;
  const aiProvider = (AI_PROVIDERS as readonly string[]).includes(settings?.ai_provider ?? "") ? (settings!.ai_provider as (typeof AI_PROVIDERS)[number]) : null;

  return (
    <>
      <Header connection={connection} lastScanAt={settings?.last_scan_at} aiProvider={aiProvider} />
      <main className="mx-auto w-full max-w-[1600px] space-y-6 p-8">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeft /> Dashboard
          </Link>
          <h1 className="text-xl font-semibold">Recruiters you&apos;ve emailed</h1>
        </div>

        <OutreachScan defaultStart="2025-08-25" />

        {companies.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No outreach found yet. Scan your sent emails above; recruiters you&apos;ve emailed will be collected from your sent mail.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Recruiter</TableHead>
                <TableHead>Emails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c, i) => (
                <TableRow key={c.companyKey} className="align-top">
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium">{c.company}</TableCell>
                  <TableCell>
                    <ul className="space-y-1">
                      {c.contacts.map((contact) => (
                        <li key={contact.email}>
                          {contact.name && <span>{contact.name} </span>}
                          <a href={`mailto:${contact.email}`} className="text-primary underline-offset-2 hover:underline">
                            {contact.email}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell>
                    <ul className="space-y-1">
                      {c.mails.map((m) => (
                        <li key={m.messageId}>
                          {googleEmail ? (
                            <a
                              href={gmailMessageUrl(googleEmail, m.rfc822MessageId, m.messageId)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                            >
                              {m.subject || "(no subject)"} <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            m.subject || "(no subject)"
                          )}
                          <span className="text-muted-foreground"> · {dateFormat.format(new Date(m.sentAt))}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </main>
    </>
  );
}
