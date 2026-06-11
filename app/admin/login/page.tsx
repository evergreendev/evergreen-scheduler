import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminSession, isAdminPasswordConfigured, isValidAdminPassword } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";

  const password = String(formData.get("password") ?? "");

  if (!isValidAdminPassword(password)) {
    redirect("/admin/login?error=invalid");
  }

  await createAdminSession();
  redirect("/admin/team");
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const configured = isAdminPasswordConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f0e8] px-6 py-10 text-[#1f2a24]">
      <section className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl">
        <p className="text-sm font-black uppercase tracking-[0.3em] text-[#4d7c59]">Admin</p>
        <h1 className="mt-3 text-4xl font-black">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-[#5f665f]">
          Enter the admin password configured on the server.
        </p>

        {!configured ? (
          <div className="mt-6 rounded-2xl border border-[#d8c7a3] bg-[#fbfaf6] p-4 text-sm font-bold text-[#7a4c00]">
            Set ADMIN_PASSWORD in .env before using the admin area.
          </div>
        ) : null}

        {params.error ? (
          <div className="mt-6 rounded-2xl border border-[#d8c7a3] bg-[#fbfaf6] p-4 text-sm font-bold text-[#7a4c00]">
            Invalid admin password.
          </div>
        ) : null}

        <form action={login} className="mt-6 grid gap-4">
          <input
            name="password"
            required
            type="password"
            placeholder="Admin password"
            className="rounded-xl border border-[#d8c7a3] px-4 py-3"
            disabled={!configured}
          />
          <button disabled={!configured} className="rounded-xl bg-[#12382b] px-5 py-3 font-black text-white disabled:opacity-60">
            Sign in
          </button>
        </form>

        <Link href="/book" className="mt-6 inline-block font-bold text-[#12382b]">
          Back to booking page
        </Link>
      </section>
    </main>
  );
}
