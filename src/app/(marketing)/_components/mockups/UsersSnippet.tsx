import { cn } from "@/lib/utils";

import { Code, MockCard, MockSnippet, MockTable, Pill } from "./frame";

/** Features › Access & audit: Settings › Users with role badges, plus two audit rows. */
const USERS = [
  { name: "Ananya Rao", email: "ananya@acme.test", role: "Admin", tone: "info", active: true, initials: "AR" },
  { name: "Priya Nair", email: "priya@acme.test", role: "Planner", tone: "queued", active: true, initials: "PN" },
  { name: "Meera Iyer", email: "meera@acme.test", role: "Supervisor", tone: "queued", active: true, initials: "MI" },
  { name: "Rahul Sen", email: "rahul@acme.test", role: "Viewer", tone: "low", active: false, initials: "RS" },
] as const;

const AUDIT = [
  { when: "07 Sep 09:41", who: "Ananya Rao", what: "User Rahul Sen deactivated · sessions revoked" },
  { when: "07 Sep 09:12", who: "Priya Nair", what: "Order SO-000118 status QUEUED → IN_PROGRESS" },
  { when: "06 Sep 15:40", who: "Meera Iyer", what: "Stock RM-AL6061-BAR ISSUE −18.500 kg (SO-000118)" },
] as const;

export function UsersSnippet() {
  return (
    <MockSnippet caption="Illustration of Settings › Users with four people and their role badges, one deactivated, followed by three audit-log rows with actor, change and time.">
      <MockCard>
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <div>
            <div className="text-[12px] font-semibold text-foreground">Users</div>
            <div className="text-[10px] text-stone-500">Acme Precision Works · 4 users</div>
          </div>
          <span className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-medium text-white">Invite user</span>
        </div>
        <MockTable
          head={
            <>
              <th>User</th>
              <th className="hidden @md:table-cell">Email</th>
              <th>Role</th>
              <th className="hidden @sm:table-cell">Status</th>
            </>
          }
        >
          {USERS.map((u) => (
            <tr key={u.email} className={cn(!u.active && "text-stone-400")}>
              <td>
                <span className="inline-flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[9px] font-semibold",
                      u.active ? "bg-teal-100 text-teal-900" : "bg-stone-100 text-stone-500",
                    )}
                  >
                    {u.initials}
                  </span>
                  <span className={cn("font-medium", u.active ? "text-foreground" : "text-stone-500")}>{u.name}</span>
                </span>
              </td>
              <td className="hidden @md:table-cell">
                <Code className={cn("text-[11px]", !u.active && "text-stone-400")}>{u.email}</Code>
              </td>
              <td>
                <Pill tone={u.tone}>{u.role}</Pill>
              </td>
              <td className="hidden @sm:table-cell">{u.active ? <Pill tone="active">Active</Pill> : <Pill tone="inactive">Inactive</Pill>}</td>
            </tr>
          ))}
        </MockTable>
      </MockCard>

      <MockCard className="mt-2.5">
        <div className="px-3 pt-2.5 pb-1.5 text-[12px] font-semibold text-foreground">Audit log</div>
        <ul className="divide-y divide-stone-100">
          {AUDIT.map((row) => (
            <li key={row.when} className="grid grid-cols-[5.5rem_1fr] items-start gap-2 px-3 py-2 text-[11px] leading-4 @sm:grid-cols-[6rem_5.5rem_1fr]">
              <span className="text-stone-500">{row.when}</span>
              <span className="hidden font-medium text-foreground @sm:block">{row.who}</span>
              <span className="text-stone-700">
                <span className="font-medium text-foreground @sm:hidden">{row.who} · </span>
                {row.what}
              </span>
            </li>
          ))}
        </ul>
      </MockCard>
    </MockSnippet>
  );
}
