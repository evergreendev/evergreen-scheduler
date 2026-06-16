"use client";

import { useState } from "react";

type Role = "WRITER" | "PHOTOGRAPHER";

type PriorityMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  sortOrder: number;
  hasGoogleCalendar: boolean;
};

type GroupedMembers = Record<Role, PriorityMember[]>;

const roles: { value: Role; label: string }[] = [
  { value: "WRITER", label: "Writers" },
  { value: "PHOTOGRAPHER", label: "Photographers" },
];

function groupMembers(members: PriorityMember[]): GroupedMembers {
  return {
    WRITER: members
      .filter((member) => member.role === "WRITER")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    PHOTOGRAPHER: members
      .filter((member) => member.role === "PHOTOGRAPHER")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  };
}

function moveMember(members: PriorityMember[], draggedId: string, targetId: string) {
  const nextMembers = [...members];
  const draggedIndex = nextMembers.findIndex((member) => member.id === draggedId);
  const targetIndex = nextMembers.findIndex((member) => member.id === targetId);

  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return nextMembers;
  }

  const [dragged] = nextMembers.splice(draggedIndex, 1);
  nextMembers.splice(targetIndex, 0, dragged);
  return nextMembers.map((member, index) => ({ ...member, sortOrder: index }));
}

export function TeamPriorityList({ members }: { members: PriorityMember[] }) {
  const [groups, setGroups] = useState<GroupedMembers>(() => groupMembers(members));
  const [dragged, setDragged] = useState<{ id: string; role: Role } | null>(null);
  const [savingRole, setSavingRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function saveOrder(role: Role, nextMembers: PriorityMember[]) {
    setSavingRole(role);
    setStatus(null);

    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, orderedIds: nextMembers.map((member) => member.id) }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save priority.");
      }

      setStatus("Priority saved.");
    } catch (error) {
      setGroups(groupMembers(members));
      setStatus(error instanceof Error ? error.message : "Unable to save priority.");
    } finally {
      setSavingRole(null);
    }
  }

  function handleDrop(role: Role, targetId: string) {
    if (!dragged || dragged.role !== role) return;

    setDragged(null);
    setGroups((currentGroups) => {
      const nextMembers = moveMember(currentGroups[role], dragged.id, targetId);
      void saveOrder(role, nextMembers);
      return { ...currentGroups, [role]: nextMembers };
    });
  }

  return (
    <section className="rounded-[1.5rem] bg-white p-6 shadow-lg">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-black">Scheduling priority</h2>
          <p className="mt-2 text-sm font-medium text-[#5f665f]">
            Drag people higher in their role. Email-only members can be assigned and receive the booking invite by email.
          </p>
        </div>
        {status ? <p className="text-sm font-bold text-[#4d7c59]">{status}</p> : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <div key={role.value} className="rounded-2xl border border-[#d8c7a3] bg-[#fbfaf6] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">{role.label}</h3>
              {savingRole === role.value ? <span className="text-sm font-bold text-[#5f665f]">Saving...</span> : null}
            </div>

            <div className="mt-4 grid gap-2">
              {groups[role.value].map((member, index) => (
                <button
                  key={member.id}
                  type="button"
                  draggable
                  onDragStart={() => setDragged({ id: member.id, role: role.value })}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(role.value, member.id)}
                  onDragEnd={() => setDragged(null)}
                  className={`grid cursor-grab grid-cols-[2.5rem_1fr] items-center gap-3 rounded-xl border px-3 py-3 text-left active:cursor-grabbing ${
                    dragged?.id === member.id ? "border-[#12382b] bg-white" : "border-[#d8c7a3] bg-white"
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12382b] text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-black text-[#1f2a24]">{member.name}</span>
                    <span className="block truncate text-sm font-medium text-[#5f665f]">
                      {member.email}
                      {!member.active ? " - inactive" : ""}
                      {member.active && !member.hasGoogleCalendar ? " - email only" : ""}
                    </span>
                  </span>
                </button>
              ))}

              {groups[role.value].length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8c7a3] p-4 text-sm font-bold text-[#5f665f]">
                  No {role.label.toLowerCase()} yet.
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
