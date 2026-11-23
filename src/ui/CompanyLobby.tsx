import {
  MAX_COMPANY_HUMANS,
  companyDifficultyBlurb,
  companySeatLabel,
  reconcileCompany,
  type CompanySeat,
  type CompanySetup,
} from "../game/company";
import type { Team } from "../game/types";
import type { ArcadeDifficulty } from "../game/wavePlanner";
import { MAX_OBSERVERS, type RosterSeat, type WatcherSeat } from "../net/protocol";

interface CompanyLobbyProps {
  name: string;
  onName: (name: string) => void;
  role: "idle" | "host" | "guest";
  players: RosterSeat[];
  localPlayerId: string;
  localTeam: Team;
  setup: CompanySetup;
  invite: string;
  joinDraft: string;
  onJoinDraft: (value: string) => void;
  status: string;
  link: "off" | "connecting" | "open" | "failed" | "down";
  copied: boolean;
  canStart: boolean;
  onHost: () => void;
  onJoin: () => void;
  onCopy: () => void;
  onShare: () => void;
  onStart: () => void;
  onLeave: () => void;
  onDifficulty: (difficulty: ArcadeDifficulty) => void;
  onSeat: (team: Team, seat: CompanySeat) => void;
  onSit: (team: Team) => void;
  allowObservers: boolean;
  watchers: WatcherSeat[];
  watching: boolean;
  pendingWatch: boolean;
  copiedWatch: boolean;
  onAllowObservers: (on: boolean) => void;
  onObserve: () => void;
  onObserveJoin: () => void;
  onCopyWatch: () => void;
}

const SEATS: { id: CompanySeat; cost: string }[] = [
  { id: "human", cost: "Play" },
  { id: "assisted", cost: "Base" },
  { id: "cpu", cost: "Keep" },
];

function Column({
  team,
  title,
  place,
  seats,
  setup,
  role,
  localPlayerId,
  onSeat,
  onSit,
  sitLocked,
  hideSit,
}: {
  team: Team;
  title: string;
  place: string;
  seats: RosterSeat[];
  setup: CompanySetup;
  role: "idle" | "host" | "guest";
  localPlayerId: string;
  onSeat: (team: Team, seat: CompanySeat) => void;
  onSit: (team: Team) => void;
  sitLocked: boolean;
  hideSit: boolean;
}) {
  const mine = seats.filter((p) => p.team === team);
  const occupied = mine.length > 0;
  const seat = setup.sides[team];
  const mineHere = mine.some((p) => p.id === localPlayerId);
  return (
    <div className={`lobby-team company-col ${team === "you" ? "team-blue" : "team-red"}`}>
      <strong>{title}</strong>
      <span className="company-place">{place}</span>
      {mine.length === 0 ? (
        <span className="lobby-empty">No player</span>
      ) : (
        mine.map((p) => (
          <span key={p.id} className={p.id === localPlayerId ? "lobby-you" : undefined}>
            {p.name}
            {p.id === localPlayerId ? " (you)" : ""}
          </span>
        ))
      )}
      <div className="company-choices" role="group" aria-label={`${title} command`}>
        {SEATS.map((choice) => {
          const blocked = role === "guest" || (choice.id === "cpu" ? occupied : !occupied);
          return (
            <button
              key={choice.id}
              type="button"
              className="company-pick"
              aria-pressed={seat === choice.id}
              disabled={blocked}
              onClick={() => onSeat(team, choice.id)}
            >
              <strong>{companySeatLabel(choice.id)}</strong>
              <em>{choice.cost}</em>
            </button>
          );
        })}
      </div>
      {!hideSit && (
        <button type="button" className="ghost company-sit" onClick={() => onSit(team)} disabled={mineHere || sitLocked}>
          {mineHere ? "Your keep" : "Sit here"}
        </button>
      )}
    </div>
  );
}

export function CompanyLobby({
  name,
  onName,
  role,
  players,
  localPlayerId,
  localTeam,
  setup,
  invite,
  joinDraft,
  onJoinDraft,
  status,
  link,
  copied,
  canStart,
  onHost,
  onJoin,
  onCopy,
  onShare,
  onStart,
  onLeave,
  onDifficulty,
  onSeat,
  onSit,
  allowObservers,
  watchers,
  watching,
  pendingWatch,
  copiedWatch,
  onAllowObservers,
  onObserve,
  onObserveJoin,
  onCopyWatch,
}: CompanyLobbyProps) {
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const seated: RosterSeat[] =
    role === "idle"
      ? [{ id: localPlayerId, name: name.trim() || "Player", team: localTeam }]
      : players;
  const agreed = reconcileCompany(setup, seated);
  const guestWaiting = role === "guest";

  return (
    <div className="overlay title-overlay skirmish-lobby company-lobby">
      <h1>Company</h1>
      <p>
        Two players. Sit together against the CPU, or take a keep each. {MAX_COMPANY_HUMANS} humans — a third player
        is turned away. An observer does not take a keep.
      </p>

      <label className="lobby-label">
        Your name
        <input
          className="lobby-field"
          value={name}
          maxLength={24}
          autoComplete="nickname"
          onChange={(ev) => onName(ev.target.value)}
        />
      </label>

      <div className="lobby-teams" aria-label="Keeps">
        <Column
          team="you"
          title="Blue"
          place="South keep"
          seats={seated}
          setup={agreed}
          role={role}
          localPlayerId={localPlayerId}
          onSeat={onSeat}
          onSit={onSit}
          sitLocked={(role === "guest" && link !== "open") || pendingWatch}
          hideSit={watching || pendingWatch}
        />
        <Column
          team="foe"
          title="Red"
          place="North keep"
          seats={seated}
          setup={agreed}
          role={role}
          localPlayerId={localPlayerId}
          onSeat={onSeat}
          onSit={onSit}
          sitLocked={(role === "guest" && link !== "open") || pendingWatch}
          hideSit={watching || pendingWatch}
        />
      </div>

      <div className="difficulty-block">
        <span className="difficulty-label" id="company-difficulty-label">
          Difficulty
        </span>
        <div className="difficulty-picker" role="group" aria-labelledby="company-difficulty-label">
          {(
            [
              ["easy", "Easy"],
              ["normal", "Normal"],
              ["hard", "Hard"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ghost"
              aria-pressed={agreed.difficulty === id}
              disabled={guestWaiting}
              onClick={() => onDifficulty(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="difficulty-hint">{companyDifficultyBlurb(agreed)}</p>
      </div>

      {role === "idle" && (
        <>
          <button type="button" className="cta" onClick={onStart} disabled={!canStart}>
            Start
          </button>
          <button type="button" className="ghost" onClick={onHost}>
            Host match
          </button>
          <label className="lobby-label">
            Invite code or link
            <input
              className="lobby-field"
              value={joinDraft}
              placeholder="Paste a link or code"
              onChange={(ev) => onJoinDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") onJoin();
              }}
            />
          </label>
          <button type="button" className="ghost" onClick={onJoin} disabled={!joinDraft.trim()}>
            Join
          </button>
          <button type="button" className="ghost" onClick={onObserveJoin} disabled={!joinDraft.trim()}>
            Observe
          </button>
        </>
      )}

      {role === "host" && (
        <>
          <label className="lobby-watch">
            <input
              type="checkbox"
              checked={allowObservers}
              onChange={(ev) => onAllowObservers(ev.target.checked)}
            />
            Allow observers
          </label>
          <p className="lobby-stay">
            Share the link. Your friend sits on Blue with you, or on Red. Observers use the observer link and do not
            take a keep. Up to {MAX_OBSERVERS} can watch.
          </p>
          {allowObservers && invite && (
            <button type="button" className="ghost" onClick={onCopyWatch}>
              {copiedWatch ? "Observer link copied" : "Copy observer link"}
            </button>
          )}
          {watchers.length > 0 && (
            <p className="lobby-status">Observing: {watchers.map((w) => w.name).join(", ")}</p>
          )}
          {invite && (
            <input className="lobby-field" readOnly value={invite} onFocus={(ev) => ev.currentTarget.select()} />
          )}
          {invite && canShare && (
            <button type="button" className="cta" onClick={onShare}>
              Share via Messages
            </button>
          )}
          {invite && (
            <button type="button" className="ghost" onClick={onCopy}>
              {copied ? "Copied" : "Copy invite link"}
            </button>
          )}
          <button type="button" className="cta" onClick={onStart} disabled={!canStart || link !== "open"}>
            Start
          </button>
        </>
      )}

      {role === "guest" && link === "open" && !watching && !pendingWatch && (
        <button type="button" className="ghost" onClick={onObserve}>
          Observe instead of Sit here
        </button>
      )}
      {(watching || pendingWatch) && (
        <p>{watching ? "Observing. You have no keep and cannot give orders." : "Asking to observe."}</p>
      )}
      {guestWaiting && link === "open" && !watching && !pendingWatch && <p>Waiting for host to start</p>}
      {status && <p className="lobby-status">{status}</p>}

      <button type="button" className="ghost" onClick={onLeave}>
        Leave lobby
      </button>
    </div>
  );
}
