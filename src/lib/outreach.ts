/** Pure grouping of outreach_emails rows for the Recruiters page and the dashboard's Recruiter column. */
export type OutreachRow = {
  message_id: string;
  to_email: string;
  to_name: string | null;
  rfc822_message_id: string | null;
  company: string;
  company_key: string;
  subject: string;
  sent_at: string;
};

export type OutreachContact = { email: string; name: string | null };
export type OutreachMail = { messageId: string; rfc822MessageId: string | null; subject: string; sentAt: string; toEmails: string[] };
export type CompanyOutreach = { companyKey: string; company: string; contacts: OutreachContact[]; mails: OutreachMail[]; lastSentAt: string };

/** One entry per company (company_key), most recently contacted first; its contacts and mails newest first. */
export function groupOutreachByCompany(rows: OutreachRow[]): CompanyOutreach[] {
  const byCompany = new Map<string, CompanyOutreach>();

  for (const r of [...rows].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))) {
    let group = byCompany.get(r.company_key);
    if (!group) {
      group = { companyKey: r.company_key, company: r.company, contacts: [], mails: [], lastSentAt: r.sent_at };
      byCompany.set(r.company_key, group);
    }

    const contact = group.contacts.find((c) => c.email === r.to_email);
    if (!contact) group.contacts.push({ email: r.to_email, name: r.to_name });
    else if (!contact.name && r.to_name) contact.name = r.to_name;

    const mail = group.mails.find((m) => m.messageId === r.message_id);
    if (mail) mail.toEmails.push(r.to_email);
    else group.mails.push({ messageId: r.message_id, rfc822MessageId: r.rfc822_message_id, subject: r.subject, sentAt: r.sent_at, toEmails: [r.to_email] });
  }

  return [...byCompany.values()].sort((a, b) => Date.parse(b.lastSentAt) - Date.parse(a.lastSentAt));
}

/** company_key -> recruiter addresses emailed there, for the dashboard's Recruiter column fallback. */
export function outreachEmailsByCompanyKey(rows: OutreachRow[]): Record<string, string[]> {
  return Object.fromEntries(groupOutreachByCompany(rows).map((g) => [g.companyKey, g.contacts.map((c) => c.email)]));
}
