import { Building2 } from "lucide-react";

/** Login and signup: no sidebar (there's no account yet to show one for).
 * Navy brand panel on wide screens, the form on its own on a phone. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <section className="relative hidden w-[44%] max-w-[640px] flex-col justify-between bg-dark p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-dark">
            <Building2 size={17} aria-hidden="true" />
          </span>
          Office Shortlist
        </div>
        <div>
          <p className="max-w-[16ch] text-[44px] font-semibold leading-[1.05] tracking-[-0.035em]">
            From listing to client shortlist in minutes.
          </p>
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-white/70">
            Capture offices straight from Funda, keep them in one library, and send each client a live link that stays
            up to date.
          </p>
        </div>
        <p className="text-xs text-white/50">For the tenant representation team.</p>
      </section>
      <main className="flex flex-1 items-center justify-center px-5 py-12">{children}</main>
    </div>
  );
}
