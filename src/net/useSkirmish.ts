import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  MAX_COMPANY_HUMANS,
  companySetupValid,
  defaultCompany,
  reconcileCompany,
  type CompanySetup,
} from "../game/company";
import { skirmishMap, skirmishMaps } from "../game/map";
import type { GameRenderer } from "../game/render3d";
import type { GameSim } from "../game/sim";
import type { ArcadeDifficulty } from "../game/wavePlanner";
import type { Team } from "../game/types";
import type { MapDef } from "../game/types";
import {
  HOST_PLAYER_ID,
  MAX_OBSERVERS,
  MAX_SKIRMISH_PLAYERS,
  createRoomId,
  inviteLink,
  observerLink,
  parseRoomInput,
  pickBalancedTeam,
  type NetMsg,
  type RosterSeat,
  type WatcherSeat,
} from "./protocol";
import { emoteById, pruneChatLines, pushChatLine, sanitizeChatText, type ChatLine } from "./chat";
import { RELAY_STATUS } from "./ice";
import { ROOM_OPEN_STATUS, SkirmishLink } from "./skirmish";

const DEFAULT_MAP = skirmishMaps()[0].id;
const NAME_KEY = "roadkeep_name";
const PLAYER_KEY = "roadkeep_player_id";
const PICTURE_REJECTED = "The match picture was rejected.";

export interface LobbyState {
  open: boolean;
  role: "idle" | "host" | "guest";
  live: boolean;
  roomId: string;
  invite: string;
  players: RosterSeat[];
  /** PeerJS peer id → roster seat id (host only). */
  peerToPlayer: Record<string, string>;
  status: string;
  joinDraft: string;
  copied: boolean;
  pingMs: number | null;
  path: string;
  link: "off" | "connecting" | "open" | "failed" | "down";
  selectedMapId: string;
  localPlayerId: string;
  localTeam: Team;
  mode: "skirmish" | "company";
  company: CompanySetup;
  /** Host opt-in. Closed rooms still refuse a subscribe hello. */
  allowObservers: boolean;
  watchers: WatcherSeat[];
  /** This client is subscribed and holds no keep. */
  watching: boolean;
  /** Joiner asked to observe and is waiting for the host to accept. */
  pendingWatch: boolean;
  copiedWatch: boolean;
}

function loadName() {
  try {
    const saved = localStorage.getItem(NAME_KEY)?.trim();
    if (saved) return saved.slice(0, 24);
  } catch {
    /* private mode */
  }
  return "Player";
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim() || "Player");
  } catch {
    /* private mode */
  }
}

function loadPlayerId() {
  try {
    const saved = localStorage.getItem(PLAYER_KEY)?.trim();
    if (saved) return saved;
  } catch {
    /* private mode */
  }
  const id = createRoomId();
  try {
    localStorage.setItem(PLAYER_KEY, id);
  } catch {
    /* private mode */
  }
  return id;
}

const idleLobby = (): LobbyState => ({
  open: false,
  role: "idle",
  live: false,
  roomId: "",
  invite: "",
  players: [],
  peerToPlayer: {},
  status: "",
  joinDraft: "",
  copied: false,
  pingMs: null,
  path: "",
  link: "off",
  selectedMapId: DEFAULT_MAP,
  localPlayerId: HOST_PLAYER_ID,
  localTeam: "you",
  mode: "skirmish",
  company: defaultCompany(),
  allowObservers: false,
  watchers: [],
  watching: false,
  pendingWatch: false,
  copiedWatch: false,
});

function seatStatus(mode: LobbyState["mode"], players: number, watchers: number) {
  const cap = mode === "company" ? MAX_COMPANY_HUMANS : MAX_SKIRMISH_PLAYERS;
  const eyes = watchers > 0 ? ` · ${watchers} observing` : "";
  if (mode === "company") return `${players}/${cap} seated${eyes}`;
  return `${players}/${cap} seated · teams auto-balance${eyes}`;
}

function bothTeamsSeated(players: RosterSeat[]) {
  return players.some((p) => p.team === "you") && players.some((p) => p.team === "foe");
}

export function useSkirmish(sim: GameSim, rendererRef: RefObject<GameRenderer | null>) {
  const [name, setNameState] = useState(loadName);
  const [lobby, setLobby] = useState<LobbyState>(idleLobby);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const nameRef = useRef(name);
  nameRef.current = name;
  const roleRef = useRef<"solo" | "host" | "guest">("solo");
  const liveRef = useRef(false);
  const linkRef = useRef<SkirmishLink | null>(null);
  const lobbyRef = useRef(lobby);
  lobbyRef.current = lobby;
  const pictureWarned = useRef(false);
  const guestPlayerIdRef = useRef(loadPlayerId());
  /** Host maps PeerJS peer id → stable player id (players and observers). */
  const peerMapRef = useRef(new Map<string, string>());
  const watchingRef = useRef(false);
  const wantWatchRef = useRef(false);
  const playerIdsRef = useRef(new Set<string>());
  const watcherIdsRef = useRef(new Set<string>());
  watchingRef.current = lobby.watching;
  playerIdsRef.current = new Set(lobby.players.map((p) => p.id));
  watcherIdsRef.current = new Set(lobby.watchers.map((w) => w.id));
  const chatIdRef = useRef(1);

  const setName = useCallback((value: string) => {
    const next = value.slice(0, 24);
    setNameState(next);
    saveName(next);
    if (linkRef.current && lobbyRef.current.link === "open") {
      const playerId =
        lobbyRef.current.role === "host" ? HOST_PLAYER_ID : lobbyRef.current.localPlayerId;
      linkRef.current.send({
        t: "hello",
        name: next.trim() || "Player",
        playerId,
        watch: lobbyRef.current.watching || wantWatchRef.current,
      });
      if (lobbyRef.current.role === "host") {
        setLobby((s) => {
          const players = s.players.map((p) =>
            p.id === HOST_PLAYER_ID ? { ...p, name: next.trim() || "Player" } : p,
          );
          linkRef.current?.send({ t: "roster", players });
          return { ...s, players };
        });
      }
    }
  }, []);

  const leave = useCallback(() => {
    linkRef.current?.close();
    linkRef.current = null;
    roleRef.current = "solo";
    liveRef.current = false;
    pictureWarned.current = false;
    peerMapRef.current.clear();
    watchingRef.current = false;
    wantWatchRef.current = false;
    sim.setObserver(false);
    sim.setOrderSink(null);
    sim.setRemoteNote(null);
    sim.setLinkDown(false);
    sim.clearPvpRoster();
    sim.setMatchMode("ai");
    sim.setLocalTeam("you");
    sim.setLocalPlayerId(HOST_PLAYER_ID);
    sim.reset();
    rendererRef.current?.setHomeSide("you");
    setChatLines([]);
    setLobby(idleLobby());
    const url = new URL(window.location.href);
    if (url.searchParams.has("room") || url.searchParams.has("watch")) {
      url.searchParams.delete("room");
      url.searchParams.delete("watch");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, [rendererRef, sim]);

  const beginGuest = useCallback(
    (map: Parameters<GameSim["adoptMap"]>[0], team: Team, playerId: string, company?: CompanySetup) => {
      sim.setMatchMode("pvp");
      sim.setLocalTeam(team);
      sim.setLocalPlayerId(playerId);
      if (company) sim.setCompany(company);
      else sim.clearCompany();
      sim.setRemoteNote(null);
      sim.setOrderSink((order) =>
        linkRef.current?.send({ t: "order", playerId, order }),
      );
      sim.adoptMap(map);
      sim.getState().phase = "running";
      sim.getState().paused = false;
      liveRef.current = true;
      roleRef.current = "guest";
      rendererRef.current?.setHomeSide(team);
      setLobby((s) => ({
        ...s,
        open: false,
        live: true,
        link: "open",
        status: "",
        localTeam: team,
        localPlayerId: playerId,
        watching: false,
        pendingWatch: false,
        mode: company ? "company" : "skirmish",
        company: company ?? defaultCompany(),
      }));
    },
    [rendererRef, sim],
  );

  const beginWatch = useCallback(
    (map: Parameters<GameSim["adoptMap"]>[0], company?: CompanySetup) => {
      const playerId = guestPlayerIdRef.current;
      watchingRef.current = true;
      wantWatchRef.current = true;
      sim.setMatchMode("pvp");
      sim.setObserver(true);
      sim.setLocalTeam("you");
      sim.setLocalPlayerId(playerId);
      if (company) sim.setCompany(company);
      else sim.clearCompany();
      sim.setRemoteNote(null);
      sim.setOrderSink(null);
      sim.adoptMap(map);
      sim.getState().phase = "running";
      sim.getState().paused = false;
      liveRef.current = true;
      roleRef.current = "guest";
      rendererRef.current?.setFieldView(true);
      setLobby((s) => ({
        ...s,
        open: false,
        live: true,
        watching: true,
        pendingWatch: false,
        link: "open",
        status: "",
        localTeam: "you",
        localPlayerId: playerId,
        mode: company ? "company" : s.mode,
        company: company ?? s.company,
      }));
    },
    [rendererRef, sim],
  );

  const warnPicture = useCallback(() => {
    if (pictureWarned.current) return;
    pictureWarned.current = true;
    sim.pushToast(PICTURE_REJECTED);
    if (roleRef.current === "host") linkRef.current?.send({ t: "note", text: PICTURE_REJECTED });
  }, [sim]);

  const onMessage = useCallback(
    (msg: NetMsg, fromPeerId?: string) => {
      if (msg.t === "hello") {
        const who = msg.name.trim().slice(0, 24) || "Player";
        const playerId = msg.playerId;
        const watch = msg.watch === true;
        if (roleRef.current === "host" && fromPeerId) {
          if (watch) {
            setLobby((s) => {
              if (!s.allowObservers) {
                linkRef.current?.sendTo(fromPeerId, {
                  t: "full",
                  reason: "The host has not allowed observers.",
                });
                peerMapRef.current.delete(fromPeerId);
                linkRef.current?.dropGuest(fromPeerId);
                return s;
              }
              const already = s.watchers.some((w) => w.id === playerId);
              if (!already && s.watchers.length >= MAX_OBSERVERS) {
                linkRef.current?.sendTo(fromPeerId, {
                  t: "full",
                  reason: `Observer seats are full (${MAX_OBSERVERS}).`,
                });
                peerMapRef.current.delete(fromPeerId);
                linkRef.current?.dropGuest(fromPeerId);
                return s;
              }
              peerMapRef.current.set(fromPeerId, playerId);
              const players = s.players.filter((p) => p.id !== playerId);
              playerIdsRef.current = new Set(players.map((p) => p.id));
              const watchers = already
                ? s.watchers.map((w) => (w.id === playerId ? { ...w, name: who } : w))
                : [...s.watchers.filter((w) => w.id !== playerId), { id: playerId, name: who }];
              watcherIdsRef.current = new Set(watchers.map((w) => w.id));
              const company =
                s.mode === "company" && !liveRef.current ? reconcileCompany(s.company, players) : s.company;
              if (players.length !== s.players.length) sim.setPvpRoster(players);
              if (liveRef.current) {
                linkRef.current?.sendTo(fromPeerId, {
                  t: "watch",
                  map: sim.getActiveMap(),
                  company: s.mode === "company" ? company : undefined,
                });
                linkRef.current?.sendTo(fromPeerId, { t: "snap", snap: sim.exportSnapshot() });
              } else {
                linkRef.current?.send({ t: "roster", players });
                if (s.mode === "company") {
                  linkRef.current?.send({ t: "company", difficulty: company.difficulty, sides: company.sides });
                }
                linkRef.current?.sendTo(fromPeerId, { t: "watching" });
              }
              return {
                ...s,
                players,
                watchers,
                company,
                peerToPlayer: { ...s.peerToPlayer, [fromPeerId]: playerId },
                status: liveRef.current ? s.status : seatStatus(s.mode, players.length, watchers.length),
              };
            });
            return;
          }
          setLobby((s) => {
            const cap = s.mode === "company" ? MAX_COMPANY_HUMANS : MAX_SKIRMISH_PLAYERS;
            const watchers = s.watchers.filter((w) => w.id !== playerId);
            if (s.players.some((p) => p.id === playerId)) {
              peerMapRef.current.set(fromPeerId, playerId);
              const players = s.players.map((p) => (p.id === playerId ? { ...p, name: who } : p));
              const company = s.mode === "company" ? reconcileCompany(s.company, players) : s.company;
              linkRef.current?.send({ t: "roster", players });
              if (s.mode === "company" && !liveRef.current) {
                linkRef.current?.send({ t: "company", difficulty: company.difficulty, sides: company.sides });
              }
              return {
                ...s,
                players,
                watchers,
                company,
                peerToPlayer: { ...s.peerToPlayer, [fromPeerId]: playerId },
                status: liveRef.current ? s.status : seatStatus(s.mode, players.length, watchers.length),
              };
            }
            if (s.players.length >= cap) {
              const reason = s.mode === "company" ? "Company seats two players." : "This match is full (6 players).";
              if (s.watchers.some((w) => w.id === playerId)) {
                linkRef.current?.sendTo(fromPeerId, { t: "note", text: `${reason} You are still observing.` });
                linkRef.current?.sendTo(fromPeerId, { t: "watching" });
                return s;
              }
              linkRef.current?.sendTo(fromPeerId, { t: "full", reason });
              peerMapRef.current.delete(fromPeerId);
              linkRef.current?.dropGuest(fromPeerId);
              return s;
            }
            peerMapRef.current.set(fromPeerId, playerId);
            const team = pickBalancedTeam(s.players);
            const players = [...s.players, { id: playerId, name: who, team }];
            const company = s.mode === "company" ? reconcileCompany(s.company, players) : s.company;
            linkRef.current?.send({ t: "roster", players });
            if (s.mode === "company") {
              linkRef.current?.send({ t: "company", difficulty: company.difficulty, sides: company.sides });
            }
            sim.setPvpRoster(players);
            playerIdsRef.current = new Set(players.map((p) => p.id));
            watcherIdsRef.current = new Set(watchers.map((w) => w.id));
            return {
              ...s,
              players,
              watchers,
              company,
              peerToPlayer: { ...s.peerToPlayer, [fromPeerId]: playerId },
              status: liveRef.current ? "A player joined." : seatStatus(s.mode, players.length, watchers.length),
            };
          });
        }
        return;
      }
      if (msg.t === "observe") {
        if (roleRef.current !== "host" || !fromPeerId || liveRef.current) return;
        const playerId = peerMapRef.current.get(fromPeerId);
        if (!playerId || playerId === HOST_PLAYER_ID) return;
        setLobby((s) => {
          if (!s.allowObservers) {
            linkRef.current?.sendTo(fromPeerId, { t: "note", text: "The host has not allowed observers." });
            return s;
          }
          const already = s.watchers.some((w) => w.id === playerId);
          if (!already && s.watchers.length >= MAX_OBSERVERS) {
            linkRef.current?.sendTo(fromPeerId, {
              t: "note",
              text: `Observer seats are full (${MAX_OBSERVERS}).`,
            });
            return s;
          }
          const seated = s.players.find((p) => p.id === playerId);
          const players = s.players.filter((p) => p.id !== playerId);
          const name = seated?.name ?? "Observer";
          const watchers = already ? s.watchers : [...s.watchers, { id: playerId, name }];
          playerIdsRef.current = new Set(players.map((p) => p.id));
          watcherIdsRef.current = new Set(watchers.map((w) => w.id));
          const company = s.mode === "company" ? reconcileCompany(s.company, players) : s.company;
          linkRef.current?.send({ t: "roster", players });
          if (s.mode === "company") {
            linkRef.current?.send({ t: "company", difficulty: company.difficulty, sides: company.sides });
          }
          linkRef.current?.sendTo(fromPeerId, { t: "watching" });
          sim.setPvpRoster(players);
          return {
            ...s,
            players,
            watchers,
            company,
            status: seatStatus(s.mode, players.length, watchers.length),
          };
        });
        return;
      }
      if (msg.t === "watching") {
        if (roleRef.current !== "guest" || liveRef.current) return;
        watchingRef.current = true;
        sim.setObserver(true);
        sim.setOrderSink(null);
        setLobby((s) => ({ ...s, watching: true, pendingWatch: false, status: "Observing. You have no keep." }));
        return;
      }
      if (msg.t === "watch") {
        if (roleRef.current !== "guest") return;
        beginWatch(msg.map, msg.company);
        return;
      }
      if (msg.t === "rewatch") {
        if (roleRef.current !== "guest" || !watchingRef.current || lobbyRef.current.link !== "open") return;
        if (msg.company) sim.setCompany(msg.company);
        else sim.clearCompany();
        if (!sim.applyRematch(msg.mapId)) return;
        sim.setObserver(true);
        sim.setOrderSink(null);
        rendererRef.current?.setFieldView(true);
        setChatLines([]);
        setLobby((s) => ({
          ...s,
          selectedMapId: msg.mapId,
          live: true,
          watching: true,
          open: false,
          link: "open",
          mode: msg.company ? "company" : s.mode,
          company: msg.company ?? s.company,
        }));
        return;
      }
      if (msg.t === "company") {
        if (roleRef.current === "host" || liveRef.current) return;
        setLobby((s) => ({
          ...s,
          mode: "company",
          company: { difficulty: msg.difficulty, sides: { you: msg.sides.you, foe: msg.sides.foe } },
        }));
        return;
      }
      if (msg.t === "seat") {
        if (roleRef.current !== "host" || lobbyRef.current.mode !== "company" || liveRef.current) return;
        const playerId = fromPeerId ? peerMapRef.current.get(fromPeerId) : undefined;
        if (!playerId) return;
        setLobby((s) => {
          if (!s.players.some((p) => p.id === playerId)) return s;
          const players = s.players.map((p) => (p.id === playerId ? { ...p, team: msg.team } : p));
          const company = reconcileCompany(s.company, players);
          linkRef.current?.send({ t: "roster", players });
          linkRef.current?.send({ t: "company", difficulty: company.difficulty, sides: company.sides });
          sim.setPvpRoster(players);
          const mine = players.find((p) => p.id === s.localPlayerId);
          return { ...s, players, company, localTeam: mine?.team ?? s.localTeam };
        });
        return;
      }
      if (msg.t === "roster") {
        setLobby((s) => {
          const mine = msg.players.find((p) => p.id === s.localPlayerId);
          return {
            ...s,
            players: msg.players,
            localTeam: watchingRef.current ? s.localTeam : (mine?.team ?? s.localTeam),
          };
        });
        if (roleRef.current === "guest" && !watchingRef.current) sim.setPvpRoster(msg.players);
        return;
      }
      if (msg.t === "start") {
        if (watchingRef.current) return;
        beginGuest(msg.map, msg.team, msg.playerId, msg.company);
        return;
      }
      if (msg.t === "pick") {
        if (roleRef.current !== "guest" || !skirmishMap(msg.mapId)) return;
        setLobby((s) => ({ ...s, selectedMapId: msg.mapId }));
        return;
      }
      if (msg.t === "rematch") {
        if (roleRef.current !== "guest" || lobbyRef.current.link !== "open") return;
        if (msg.company) sim.setCompany(msg.company);
        else sim.clearCompany();
        if (!sim.applyRematch(msg.mapId)) return;
        sim.setLocalTeam(msg.team);
        sim.setLocalPlayerId(msg.playerId);
        rendererRef.current?.setHomeSide(msg.team);
        setChatLines([]);
        setLobby((s) => ({
          ...s,
          selectedMapId: msg.mapId,
          live: true,
          open: false,
          link: "open",
          localTeam: msg.team,
          localPlayerId: msg.playerId,
          mode: msg.company ? "company" : "skirmish",
          company: msg.company ?? defaultCompany(),
        }));
        return;
      }
      if (msg.t === "order") {
        if (roleRef.current === "host") {
          const seatId = fromPeerId ? peerMapRef.current.get(fromPeerId) : undefined;
          if (
            !seatId ||
            seatId !== msg.playerId ||
            watcherIdsRef.current.has(seatId) ||
            !playerIdsRef.current.has(seatId)
          ) {
            return;
          }
        }
        sim.applyRemoteOrder(msg.order, msg.playerId);
        return;
      }
      if (msg.t === "snap") {
        if (!sim.applySnapshot(msg.snap)) warnPicture();
        return;
      }
      if (msg.t === "note") {
        if (msg.text === PICTURE_REJECTED) warnPicture();
        else sim.pushToast(msg.text);
        return;
      }
      if (msg.t === "chat") {
        const text = sanitizeChatText(msg.text);
        if (!text) return;
        // Host relays guest chat to every peer.
        if (roleRef.current === "host") linkRef.current?.send(msg);
        if (msg.playerId === lobbyRef.current.localPlayerId) return;
        const id = chatIdRef.current++;
        setChatLines((lines) =>
          pushChatLine(
            lines,
            {
              playerId: msg.playerId,
              name: msg.name.trim().slice(0, 24) || "Player",
              team: msg.team,
              text,
              emote: msg.emote,
              at: Date.now(),
            },
            id,
          ),
        );
        return;
      }
      if (msg.t === "pong") {
        const ms = Math.max(0, Date.now() - msg.at);
        setLobby((s) => ({ ...s, pingMs: ms }));
      }
    },
    [beginGuest, beginWatch, rendererRef, sim, warnPicture],
  );

  const sendChatPayload = useCallback((text: string, emote?: string) => {
    const cleaned = sanitizeChatText(text);
    if (!cleaned || !liveRef.current || lobbyRef.current.link !== "open" || watchingRef.current) return;
    const playerId = lobbyRef.current.localPlayerId;
    const team = lobbyRef.current.localTeam;
    const who = nameRef.current.trim().slice(0, 24) || "Player";
    const msg: NetMsg = { t: "chat", playerId, name: who, team, text: cleaned, emote };
    const id = chatIdRef.current++;
    setChatLines((lines) =>
      pushChatLine(lines, { playerId, name: who, team, text: cleaned, emote, at: Date.now() }, id),
    );
    linkRef.current?.send(msg);
  }, []);

  const sendChat = useCallback(
    (text: string) => {
      sendChatPayload(text);
    },
    [sendChatPayload],
  );

  const sendEmote = useCallback(
    (emoteId: string) => {
      const emote = emoteById(emoteId);
      if (!emote) return;
      sendChatPayload(emote.text, emote.id);
    },
    [sendChatPayload],
  );

  useEffect(() => {
    if (!lobby.live) return;
    const id = window.setInterval(() => {
      setChatLines((lines) => {
        const next = pruneChatLines(lines);
        return next.length === lines.length ? lines : next;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [lobby.live]);

  const openLink = useCallback(
    (role: "host" | "guest", roomId: string) => {
      linkRef.current?.close();
      pictureWarned.current = false;
      const link = new SkirmishLink({
        onReady: (id) => {
          setLobby((s) => ({
            ...s,
            roomId: id,
            invite: inviteLink(id),
            status:
              s.status === RELAY_STATUS || s.status === ROOM_OPEN_STATUS || s.status.startsWith("Reopening")
                ? s.status
                : "Connecting",
          }));
        },
        onConnected: () => {
          const playerId = role === "host" ? HOST_PLAYER_ID : guestPlayerIdRef.current;
          const watch = role === "guest" && wantWatchRef.current;
          link.send({
            t: "hello",
            name: nameRef.current.trim() || "Player",
            playerId,
            ...(watch ? { watch: true } : {}),
          });
          setLobby((s) => ({
            ...s,
            link: "open",
            status:
              role === "host"
                ? ROOM_OPEN_STATUS
                : watch
                  ? "Connected — asking to observe"
                  : "Connected — waiting for roster",
          }));
        },
        onGuestConnected: () => {
          setLobby((s) => ({
            ...s,
            link: "open",
            status: seatStatus(s.mode, s.players.length, s.watchers.length),
          }));
        },
        onGuestDisconnected: (peerId) => {
          const playerId = peerMapRef.current.get(peerId);
          peerMapRef.current.delete(peerId);
          if (!playerId) return;
          setLobby((s) => {
            const wasPlayer = s.players.some((p) => p.id === playerId);
            const players = s.players.filter((p) => p.id !== playerId);
            const watchers = s.watchers.filter((w) => w.id !== playerId);
            const company =
              s.mode === "company" && !liveRef.current ? reconcileCompany(s.company, players) : s.company;
            if (wasPlayer) {
              linkRef.current?.send({ t: "roster", players });
              if (s.mode === "company" && !liveRef.current) {
                linkRef.current?.send({ t: "company", difficulty: company.difficulty, sides: company.sides });
              }
              sim.setPvpRoster(players);
            }
            const remotePlayers = players.filter((p) => p.id !== HOST_PLAYER_ID);
            const opponentGone = liveRef.current && wasPlayer && remotePlayers.length === 0 && watchers.length === 0;
            if (opponentGone) sim.setLinkDown(true);
            const peerToPlayer = { ...s.peerToPlayer };
            delete peerToPlayer[peerId];
            playerIdsRef.current = new Set(players.map((p) => p.id));
            watcherIdsRef.current = new Set(watchers.map((w) => w.id));
            return {
              ...s,
              players,
              watchers,
              company,
              peerToPlayer,
              link: opponentGone ? "down" : s.link,
              status: !liveRef.current
                ? seatStatus(s.mode, players.length, watchers.length)
                : wasPlayer
                  ? "A player left."
                  : s.status,
            };
          });
        },
        onMessage,
        onStatus: (text) => setLobby((s) => ({ ...s, status: text })),
        onDirectFail: (text) =>
          setLobby((s) => ({ ...s, status: text, link: "failed", pendingWatch: false })),
        onPath: (kind) => {
          setLobby((s) => ({
            ...s,
            path: kind,
            status: s.live ? s.status : `Connected · ${kind}`,
          }));
        },
        onReject: warnPicture,
        onDown: (text) => {
          const wasLive = liveRef.current;
          if (wasLive) sim.setLinkDown(true);
          setLobby((s) => ({
            ...s,
            link: "down",
            status: wasLive ? "Connection lost." : text,
          }));
        },
      });
      linkRef.current = link;
      if (role === "host") link.host(roomId);
      else link.join(roomId);
    },
    [onMessage, sim, warnPicture],
  );

  const hostMatch = useCallback(() => {
    const id = createRoomId();
    const self = nameRef.current.trim() || "Player";
    const mode = lobbyRef.current.mode;
    const seat = mode === "company" ? lobbyRef.current.localTeam : "you";
    roleRef.current = "host";
    liveRef.current = false;
    peerMapRef.current.clear();
    const players: RosterSeat[] = [{ id: HOST_PLAYER_ID, name: self, team: seat }];
    const company = mode === "company" ? reconcileCompany(lobbyRef.current.company, players) : defaultCompany();
    sim.setLocalPlayerId(HOST_PLAYER_ID);
    sim.setObserver(false);
    sim.setPvpRoster(players);
    wantWatchRef.current = false;
    watchingRef.current = false;
    setLobby({
      open: true,
      role: "host",
      live: false,
      roomId: id,
      invite: "",
      players,
      peerToPlayer: {},
      status: "Connecting",
      joinDraft: "",
      copied: false,
      pingMs: null,
      path: "",
      link: "connecting",
      selectedMapId: DEFAULT_MAP,
      localPlayerId: HOST_PLAYER_ID,
      localTeam: seat,
      mode,
      company,
      allowObservers: false,
      watchers: [],
      watching: false,
      pendingWatch: false,
      copiedWatch: false,
    });
    openLink("host", id);
  }, [openLink, sim]);

  const joinMatch = useCallback(
    (raw?: string, watch = false) => {
      const roomId = parseRoomInput(raw ?? lobbyRef.current.joinDraft);
      if (!roomId) {
        setLobby((s) => ({ ...s, open: true, status: "Paste an invite link or code first." }));
        return;
      }
      const self = nameRef.current.trim() || "Player";
      const playerId = guestPlayerIdRef.current;
      const mode = lobbyRef.current.mode;
      roleRef.current = "guest";
      liveRef.current = false;
      wantWatchRef.current = watch;
      watchingRef.current = false;
      sim.setObserver(false);
      sim.setLocalPlayerId(playerId);
      setLobby({
        open: true,
        role: "guest",
        live: false,
        roomId,
        invite: "",
        players: watch ? [] : [{ id: playerId, name: self, team: "foe" }],
        peerToPlayer: {},
        status: watch ? "Connecting as observer" : "Connecting",
        joinDraft: roomId,
        copied: false,
        pingMs: null,
        path: "",
        link: "connecting",
        selectedMapId: DEFAULT_MAP,
        localPlayerId: playerId,
        localTeam: watch ? "you" : "foe",
        mode,
        company: mode === "company" ? lobbyRef.current.company : defaultCompany(),
        allowObservers: false,
        watchers: [],
        watching: false,
        pendingWatch: watch,
        copiedWatch: false,
      });
      openLink("guest", roomId);
    },
    [openLink, sim],
  );

  const announceMap = useCallback(() => {
    if (roleRef.current !== "host" || lobbyRef.current.link !== "open") return;
    const mapId = lobbyRef.current.selectedMapId;
    if (!skirmishMap(mapId)) return;
    linkRef.current?.send({ t: "pick", mapId });
  }, []);

  const pickMap = useCallback((mapId: string) => {
    if (roleRef.current !== "host" || !skirmishMap(mapId)) return;
    setLobby((s) => ({ ...s, selectedMapId: mapId }));
    if (lobbyRef.current.link === "open") linkRef.current?.send({ t: "pick", mapId });
  }, []);

  const fanout = useCallback(
    (kind: "start" | "rematch", mapOrId: MapDef | string, company?: CompanySetup) => {
      const players = lobbyRef.current.players;
      const watcherIds = watcherIdsRef.current;
      for (const [peerId, playerId] of peerMapRef.current) {
        if (watcherIds.has(playerId)) {
          if (kind === "start") linkRef.current?.sendTo(peerId, { t: "watch", map: mapOrId as MapDef, company });
          else linkRef.current?.sendTo(peerId, { t: "rewatch", mapId: mapOrId as string, company });
          continue;
        }
        const seat = players.find((p) => p.id === playerId);
        if (!seat) continue;
        if (kind === "start") {
          linkRef.current?.sendTo(peerId, {
            t: "start",
            map: mapOrId as MapDef,
            team: seat.team,
            playerId: seat.id,
            company,
          });
        } else {
          linkRef.current?.sendTo(peerId, {
            t: "rematch",
            mapId: mapOrId as string,
            team: seat.team,
            playerId: seat.id,
            company,
          });
        }
      }
      linkRef.current?.send({ t: "snap", snap: sim.exportSnapshot() });
    },
    [sim],
  );

  const rematch = useCallback(() => {
    if (roleRef.current !== "host" || !liveRef.current || lobbyRef.current.link !== "open") return;
    const mapId = lobbyRef.current.selectedMapId;
    const players = lobbyRef.current.players;
    const company =
      lobbyRef.current.mode === "company" ? reconcileCompany(lobbyRef.current.company, players) : undefined;
    if (company) sim.setCompany(company);
    else sim.clearCompany();
    if (!sim.applyRematch(mapId)) return;
    if (company) setLobby((s) => ({ ...s, company }));
    sim.setPvpRoster(players);
    setChatLines([]);
    fanout("rematch", mapId, company);
    rendererRef.current?.setHomeSide(lobbyRef.current.localTeam);
  }, [fanout, rendererRef, sim]);

  const startSkirmish = useCallback(() => {
    if (roleRef.current !== "host") return;
    const players = lobbyRef.current.players;
    if (!bothTeamsSeated(players)) return;
    sim.clearCompany();
    sim.setMatchMode("pvp");
    sim.setLocalTeam("you");
    sim.setLocalPlayerId(HOST_PLAYER_ID);
    sim.setObserver(false);
    sim.setOrderSink(null);
    sim.setPvpRoster(players);
    sim.setRemoteNote((text) => linkRef.current?.send({ t: "note", text }));
    sim.startMatch();
    const map = sim.getActiveMap();
    fanout("start", map);
    liveRef.current = true;
    rendererRef.current?.setHomeSide("you");
    setChatLines([]);
    setLobby((s) => ({ ...s, open: false, live: true, link: "open", status: "", localTeam: "you" }));
  }, [fanout, rendererRef, sim]);

  const shareInvite = useCallback(async () => {
    const invite = lobbyRef.current.invite;
    if (!invite || !navigator.share) return;
    try {
      await navigator.share({ title: "MULE", text: "Join my MULE match", url: invite });
    } catch {
      /* dismissed */
    }
  }, []);

  const copyInvite = useCallback(async () => {
    const invite = lobbyRef.current.invite;
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
    } catch {
      /* field stays selectable */
    }
    setLobby((s) => ({ ...s, copied: true }));
  }, []);

  const openLobby = useCallback(() => {
    setLobby((s) => ({ ...idleLobby(), open: true, mode: "skirmish", joinDraft: s.joinDraft }));
  }, []);

  const openCompany = useCallback(() => {
    setLobby((s) => ({
      ...idleLobby(),
      open: true,
      mode: "company",
      joinDraft: s.joinDraft,
      company: defaultCompany(),
      localTeam: "you",
    }));
  }, []);

  const pushCompany = useCallback(
    (players: RosterSeat[], company: CompanySetup) => {
      const next = reconcileCompany(company, players);
      if (lobbyRef.current.role === "host" && lobbyRef.current.link === "open") {
        linkRef.current?.send({ t: "roster", players });
        linkRef.current?.send({ t: "company", difficulty: next.difficulty, sides: next.sides });
        sim.setPvpRoster(players);
      }
      return next;
    },
    [sim],
  );

  const companyPlayersOf = (s: LobbyState) =>
    s.role === "idle"
      ? [{ id: HOST_PLAYER_ID, name: nameRef.current.trim() || "Player", team: s.localTeam }]
      : s.players;

  const setCompanyDifficulty = useCallback(
    (difficulty: ArcadeDifficulty) => {
      if (roleRef.current === "guest") return;
      setLobby((s) => {
        const players = companyPlayersOf(s);
        const company = pushCompany(players, { ...s.company, difficulty });
        return { ...s, company };
      });
    },
    [pushCompany],
  );

  const setCompanySeat = useCallback(
    (team: Team, seat: CompanySetup["sides"]["you"]) => {
      if (roleRef.current === "guest") return;
      setLobby((s) => {
        const players = companyPlayersOf(s);
        const occupied = players.some((p) => p.team === team);
        if (seat === "cpu" && occupied) return s;
        if (seat !== "cpu" && !occupied) return s;
        const company = pushCompany(players, {
          ...s.company,
          sides: { ...s.company.sides, [team]: seat },
        });
        return { ...s, company };
      });
    },
    [pushCompany],
  );

  const sitCompany = useCallback(
    (team: Team) => {
      if (roleRef.current === "guest") {
        if (lobbyRef.current.link === "open") linkRef.current?.send({ t: "seat", team });
        return;
      }
      setLobby((s) => {
        if (s.role === "idle") {
          const players = [{ id: HOST_PLAYER_ID, name: nameRef.current.trim() || "Player", team }];
          return { ...s, localTeam: team, company: reconcileCompany(s.company, players) };
        }
        const players = s.players.map((p) => (p.id === HOST_PLAYER_ID ? { ...p, team } : p));
        const company = pushCompany(players, s.company);
        return { ...s, players, company, localTeam: team };
      });
    },
    [pushCompany],
  );

  const startCompany = useCallback(() => {
    if (roleRef.current === "guest") return;
    const lobbyNow = lobbyRef.current;
    const self = nameRef.current.trim() || "Player";
    const players: RosterSeat[] =
      lobbyNow.role === "idle"
        ? [{ id: HOST_PLAYER_ID, name: self, team: lobbyNow.localTeam }]
        : lobbyNow.players;
    const setup = reconcileCompany(lobbyNow.company, players);
    if (!companySetupValid(setup, players)) return;
    if (lobbyNow.role === "host" && lobbyNow.link !== "open") return;
    const guests = players.filter((p) => p.id !== HOST_PLAYER_ID);
    const me = players.find((p) => p.id === HOST_PLAYER_ID) ?? players[0];
    if (!me) return;
    sim.setCompany(setup);
    sim.setObserver(false);
    sim.setLocalTeam(me.team);
    sim.setLocalPlayerId(HOST_PLAYER_ID);
    sim.setOrderSink(null);
    sim.setPvpRoster(players);
    rendererRef.current?.setHomeSide(me.team);
    if (guests.length === 0 && lobbyNow.watchers.length === 0) {
      linkRef.current?.close();
      linkRef.current = null;
      roleRef.current = "solo";
      liveRef.current = false;
      sim.setMatchMode("ai");
      sim.setRemoteNote(null);
      sim.startMatch();
      setChatLines([]);
      setLobby((s) => ({
        ...s,
        open: false,
        live: false,
        role: "idle",
        link: "off",
        company: setup,
        localTeam: me.team,
        players,
      }));
      return;
    }
    sim.setMatchMode("pvp");
    sim.setRemoteNote((text) => linkRef.current?.send({ t: "note", text }));
    sim.startMatch();
    const map = sim.getActiveMap();
    fanout("start", map, setup);
    liveRef.current = true;
    roleRef.current = "host";
    setChatLines([]);
    setLobby((s) => ({
      ...s,
      open: false,
      live: true,
      link: "open",
      status: "",
      company: setup,
      localTeam: me.team,
    }));
  }, [fanout, rendererRef, sim]);

  const setAllowObservers = useCallback((on: boolean) => {
    if (roleRef.current === "guest") return;
    setLobby((s) => ({ ...s, allowObservers: on }));
  }, []);

  const askToObserve = useCallback(() => {
    if (roleRef.current !== "guest" || lobbyRef.current.link !== "open" || liveRef.current) return;
    if (lobbyRef.current.watching) return;
    wantWatchRef.current = true;
    linkRef.current?.send({ t: "observe" });
    setLobby((s) => ({ ...s, pendingWatch: true, status: "Asking to observe" }));
  }, []);

  const copyObserverInvite = useCallback(async () => {
    const roomId = lobbyRef.current.roomId;
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(observerLink(roomId));
    } catch {
      /* field stays selectable */
    }
    setLobby((s) => ({ ...s, copiedWatch: true, copied: false }));
  }, []);

  const setJoinDraft = useCallback((joinDraft: string) => {
    setLobby((s) => ({ ...s, open: true, joinDraft }));
  }, []);

  useEffect(() => {
    if (!lobby.open) return;
    let released = false;
    let sentinel: WakeLockSentinel | null = null;
    const hold = () => {
      const locks = navigator.wakeLock;
      if (!locks || sentinel || released) return;
      void locks
        .request("screen")
        .then((lock) => {
          if (released) void lock.release();
          else sentinel = lock;
        })
        .catch(() => {
          /* refused */
        });
    };
    hold();
    const onVis = () => {
      if (document.visibilityState !== "visible") {
        sentinel = null;
        return;
      }
      hold();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release();
    };
  }, [lobby.open]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) joinMatch(room, params.get("watch") === "1");
    return () => {
      linkRef.current?.close();
      linkRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companyRoster =
    lobby.role === "idle"
      ? [{ team: lobby.localTeam }]
      : lobby.players;
  const companyCanStart =
    lobby.mode === "company" &&
    lobby.role !== "guest" &&
    companySetupValid(reconcileCompany(lobby.company, companyRoster), companyRoster) &&
    (lobby.role === "idle" || lobby.link === "open");

  return {
    name,
    setName,
    lobby,
    chatLines,
    sendChat,
    sendEmote,
    roleRef,
    liveRef,
    linkRef,
    openLobby,
    openCompany,
    setJoinDraft,
    hostMatch,
    joinMatch,
    startSkirmish,
    startCompany,
    setCompanyDifficulty,
    setCompanySeat,
    sitCompany,
    announceMap,
    pickMap,
    rematch,
    shareInvite,
    copyInvite,
    copyObserverInvite,
    setAllowObservers,
    askToObserve,
    leave,
    canStart: lobby.role === "host" && bothTeamsSeated(lobby.players) && lobby.link === "open",
    companyCanStart,
  };
}
