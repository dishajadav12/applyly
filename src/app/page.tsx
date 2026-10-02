import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <h1><Logo className="[&_img]:h-12" /></h1>
      <p className="text-muted-foreground">
        Reconstruct your job applications from Gmail. Read-only access, and email bodies are never stored.
      </p>
      <div>
        <a href="/auth/sign-in" className={buttonVariants()}>
          Sign in with Google
        </a>
      </div>
    </main>
  );
}
