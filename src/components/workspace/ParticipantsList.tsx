type P = { user_id: string; display_name: string | null; personality_type: string | null; online?: boolean };

export function ParticipantsList({ participants }: { participants: P[] }) {
  return (
    <div className="sticker p-4">
      <h3 className="font-display text-lg font-bold text-ink">In the room</h3>
      <ul className="mt-3 space-y-2">
        {participants.map((p) => (
          <li key={p.user_id} className="flex items-center gap-2">
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-display font-bold text-primary-foreground">
                {(p.display_name ?? "?").charAt(0).toUpperCase()}
              </div>
              <span
                className={`absolute -right-0 -bottom-0 h-3 w-3 rounded-full border-2 border-card ${p.online ? "bg-emerald-500" : "bg-muted"}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display font-semibold text-ink">{p.display_name ?? "Someone"}</div>
              <div className="text-[11px] text-muted-foreground">{p.personality_type ?? "—"}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
