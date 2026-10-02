import Image from "next/image";

/** Brand logo: the mark alone on small screens, the horizontal text lockup from md up; swaps for dark mode. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`} aria-label="Applyly">
      <Image src="/brand/logo-mark.png" alt="" width={274} height={270} priority className="h-8 w-auto md:hidden dark:hidden" />
      <Image src="/brand/logo-mark-dark.png" alt="" width={274} height={270} priority className="hidden h-8 w-auto dark:block md:hidden dark:md:hidden" />
      <Image src="/brand/logo-text.png" alt="Applyly" width={396} height={100} priority className="hidden h-8 w-auto md:block dark:hidden dark:md:hidden" />
      <Image src="/brand/logo-text-dark.png" alt="Applyly" width={396} height={100} priority className="hidden h-8 w-auto dark:md:block" />
    </span>
  );
}
