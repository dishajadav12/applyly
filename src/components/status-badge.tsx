import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/config";
import { cn } from "@/lib/utils";

// A9: "Status is a colored badge." One color per stage, terminal statuses get their own
// tone (green/red/gray), "Unknown" is muted. Dark-mode variants included throughout.
const STATUS_STYLES: Record<Status, string> = {
  Applied: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "Recruiter Contacted": "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  Assessment: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  Interviewing: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "Final Round": "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  Offer: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Rejected: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  Withdrawn: "bg-muted text-muted-foreground",
  Unknown: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", STATUS_STYLES[status], className)}>
      {status}
    </Badge>
  );
}
