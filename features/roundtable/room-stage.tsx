'use client';
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Roundtable } from '@/shared/types';
import './room-stage.css';

export const TURN_MS = 16000;
const seats = [
  { x: 23, y: 35, face: 7 },
  { x: 83, y: 44, face: 1 },
  { x: 10, y: 67, face: 7 },
  { x: 89, y: 79, face: 1 },
];
const podiums = [
  { x: 39, y: 48 },
  { x: 63, y: 51 },
  { x: 39, y: 63 },
  { x: 63, y: 66 },
];
const agentLibrary = [
  { id: 'evidence', name: '证据核验员' },
  { id: 'counter', name: '反方追问者' },
  { id: 'context', name: '背景补充员' },
];
const guestSpots = [
  { x: 32, y: 82 },
  { x: 69, y: 82 },
  { x: 51, y: 37 },
];
type GuestAgent = (typeof agentLibrary)[number] & { x: number; y: number };
type WalkSprite =
  | 'walk-front'
  | 'walk-back'
  | 'walk-left'
  | 'walk-right'
  | 'walk-front-left'
  | 'walk-front-right'
  | 'walk-back-left'
  | 'walk-back-right';
function walkSprite(dx: number, dy: number): WalkSprite {
  const horizontal = Math.abs(dx) > 8;
  const vertical = Math.abs(dy) > 8;
  if (horizontal && vertical)
    return `walk-${dy > 0 ? 'front' : 'back'}-${dx > 0 ? 'right' : 'left'}`;
  if (horizontal) return dx > 0 ? 'walk-right' : 'walk-left';
  return dy > 0 ? 'walk-front' : 'walk-back';
}
function seatedSprite(face: number) {
  return face === 7 ? 'sit-front-right' : 'sit-front-left';
}
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const frames = new Map<string, HTMLCanvasElement>();
function load(name: string) {
  if (!imageCache.has(name))
    imageCache.set(
      name,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = '/roundtable/characters/basic/' + name + '.png';
      }),
    );
  return imageCache.get(name)!;
}
// Remove only the connected neutral studio backdrop while drawing existing sprite sheets.
function frame(
  img: HTMLImageElement,
  rect: number[],
  key: string,
  matte: boolean,
) {
  if (frames.has(key)) return frames.get(key)!;
  const [x, y, w, h] = rect;
  const source = document.createElement('canvas');
  source.width = Math.max(1, Math.round(w));
  source.height = Math.max(1, Math.round(h));
  const sourceCtx = source.getContext('2d', { willReadFrequently: true })!;
  sourceCtx.drawImage(img, x, y, w, h, 0, 0, source.width, source.height);
  if (matte) {
    const width = source.width,
      height = source.height,
      size = width * height;
    const data = sourceCtx.getImageData(0, 0, width, height),
      p = data.data;
    const seen = new Uint8Array(size),
      queue: number[] = [];
    const neutral = (n: number) => {
      const k = n * 4,
        high = Math.max(p[k], p[k + 1], p[k + 2]),
        low = Math.min(p[k], p[k + 1], p[k + 2]);
      return p[k + 3] === 0 || (high > 55 && high < 225 && high - low < 25);
    };
    const enqueue = (n: number) => {
      if (!seen[n] && neutral(n)) {
        seen[n] = 1;
        queue.push(n);
      }
    };
    for (let col = 0; col < width; col++) {
      enqueue(col);
      enqueue((height - 1) * width + col);
    }
    for (let row = 0; row < height; row++) {
      enqueue(row * width);
      enqueue(row * width + width - 1);
    }
    for (let q = 0; q < queue.length; q++) {
      const n = queue[q];
      const k = n * 4;
      p[k + 3] = 0;
      const neighbours = [
        n % width ? n - 1 : -1,
        n % width < width - 1 ? n + 1 : -1,
        n >= width ? n - width : -1,
        n < size - width ? n + width : -1,
      ];
      for (const next of neighbours) {
        if (next < 0 || seen[next] || !neutral(next)) continue;
        const b = next * 4,
          delta = Math.max(
            Math.abs(p[k] - p[b]),
            Math.abs(p[k + 1] - p[b + 1]),
            Math.abs(p[k + 2] - p[b + 2]),
          );
        if (p[b + 3] === 0 || delta <= 6) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    // Dark vignette corners in the atlas are foreground-colored, but always touch
    // a cell edge. Keep only the largest isolated subject component.
    const componentSeen = new Uint8Array(size);
    let subject: number[] = [];
    for (let start = 0; start < size; start++) {
      if (componentSeen[start] || p[start * 4 + 3] <= 12) continue;
      const component: number[] = [],
        pending = [start];
      let touchesEdge = false;
      componentSeen[start] = 1;
      for (let q = 0; q < pending.length; q++) {
        const n = pending[q],
          col = n % width,
          row = Math.floor(n / width);
        component.push(n);
        if (col === 0 || col === width - 1 || row === 0 || row === height - 1)
          touchesEdge = true;
        const neighbours = [
          col ? n - 1 : -1,
          col < width - 1 ? n + 1 : -1,
          row ? n - width : -1,
          row < height - 1 ? n + width : -1,
        ];
        for (const next of neighbours) {
          if (next >= 0 && !componentSeen[next] && p[next * 4 + 3] > 12) {
            componentSeen[next] = 1;
            pending.push(next);
          }
        }
      }
      if (!touchesEdge && component.length > subject.length)
        subject = component;
    }
    if (subject.length) {
      const keep = new Uint8Array(size);
      for (const n of subject) keep[n] = 1;
      for (let n = 0; n < size; n++) if (!keep[n]) p[n * 4 + 3] = 0;
    }
    sourceCtx.putImageData(data, 0, 0);
  }
  const pixels = sourceCtx.getImageData(0, 0, source.width, source.height).data;
  let left = source.width,
    top = source.height,
    right = -1,
    bottom = -1;
  for (let row = 0; row < source.height; row++) {
    for (let col = 0; col < source.width; col++) {
      if (pixels[(row * source.width + col) * 4 + 3] > 12) {
        left = Math.min(left, col);
        top = Math.min(top, row);
        right = Math.max(right, col);
        bottom = Math.max(bottom, row);
      }
    }
  }
  const c = document.createElement('canvas');
  c.width = 150;
  c.height = 200;
  const ctx = c.getContext('2d')!;
  if (right >= left && bottom >= top) {
    const subjectWidth = right - left + 1,
      subjectHeight = bottom - top + 1,
      scale = Math.min(144 / subjectWidth, 194 / subjectHeight),
      drawWidth = subjectWidth * scale,
      drawHeight = subjectHeight * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      source,
      left,
      top,
      subjectWidth,
      subjectHeight,
      (150 - drawWidth) / 2,
      198 - drawHeight,
      drawWidth,
      drawHeight,
    );
  }
  frames.set(key, c);
  return c;
}

type Action =
  | '坐着倾听'
  | '起立'
  | '走向圆桌'
  | '挥手示意'
  | '发言中'
  | '返回沙发'
  | '坐下'
  | '坐着思考'
  | '打个盹';
function Sprite({
  action,
  face,
  tick,
  walking,
}: {
  action: Action;
  face: number;
  tick: number;
  walking: WalkSprite;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawVersion = useRef(0);
  useEffect(() => {
    const version = ++drawVersion.current;
    let cancelled = false;
    const moving = action === '走向圆桌' || action === '返回沙发';
    const seated =
      action === '坐着倾听' ||
      action === '坐着思考' ||
      action === '打个盹' ||
      action === '坐下';
    const wave = action === '挥手示意' || action === '发言中';
    const name = moving ? walking : seated ? seatedSprite(face) : 'wave-front';
    let index = 0,
      rect: number[];
    if (moving) {
      index = tick % 6;
      rect = [index * 362, 0, 362, 724];
    } else if (seated) rect = [0, 0, 1254, 1254];
    else {
      index = wave ? tick % 6 : 0;
      rect = [index * 362, 0, 362, 724];
    }
    load(name)
      .then((img) => {
        if (cancelled || version !== drawVersion.current || !ref.current)
          return;
        const ctx = ref.current.getContext('2d')!;
        ctx.clearRect(0, 0, 150, 200);
        const drawing = frame(img, rect, name + ':' + rect.join(','), false);
        ctx.drawImage(drawing, 0, 0);
      })
      .catch(() => {
        if (!cancelled && version === drawVersion.current && ref.current) {
          const ctx = ref.current.getContext('2d')!;
          ctx.clearRect(0, 0, 150, 200);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(75, 105, 42, 65, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [action, face, tick, walking]);
  return <canvas ref={ref} width={150} height={200} aria-hidden="true" />;
}

export function RoomStage({
  round,
  visible,
  playing,
  scene,
  onScene,
  onTurnEnd,
}: {
  round: Roundtable;
  visible: number;
  playing: boolean;
  scene: string;
  onScene: (scene: string | null) => void;
  onTurnEnd: () => void;
}) {
  const [clock, setClock] = useState(0);
  const [playhead, setPlayhead] = useState({ message: '', elapsed: 0 });
  const time = useRef({ message: '', elapsed: 0, last: 0 });
  const completed = useRef('');
  const message = round.messages[Math.min(visible, round.messages.length) - 1];
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [guestAgents, setGuestAgents] = useState<GuestAgent[]>([]);
  const [draggingAgent, setDraggingAgent] = useState('');
  const worldRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);
  function addAgent(id: string, position?: { x: number; y: number }) {
    const agent = agentLibrary.find((item) => item.id === id);
    if (!agent || guestAgents.some((item) => item.id === id)) return;
    const spot = position ?? guestSpots[guestAgents.length % guestSpots.length];
    setGuestAgents((current) => [...current, { ...agent, ...spot }]);
  }
  // Guests walk in by themselves when it is their turn to interject; the
  // presence is derived from the transcript instead of effect-driven state.
  const summonedGuests = useMemo(() => {
    const seen = new Set<string>();
    for (
      let i = 0;
      i < Math.min(visible, round.messages.length);
      i++
    ) {
      const speaker = round.messages[i].speakerRoleId;
      if (agentLibrary.some((agent) => agent.id === speaker))
        seen.add(speaker);
    }
    return [...seen].map((id, index) => {
      const agent = agentLibrary.find((item) => item.id === id)!;
      return { ...agent, ...guestSpots[index % guestSpots.length] };
    });
  }, [round.messages, visible]);
  const presentGuests = useMemo(() => {
    const manual = new Set(guestAgents.map((agent) => agent.id));
    const auto = summonedGuests
      .filter((agent) => !manual.has(agent.id))
      .map((agent, index) => ({
        ...agent,
        ...guestSpots[
          (guestAgents.length + index) % guestSpots.length
        ],
      }));
    return [...guestAgents, ...auto];
  }, [guestAgents, summonedGuests]);
  function positionInWorld(clientX: number, clientY: number) {
    const bounds = worldRef.current?.getBoundingClientRect();
    if (
      !bounds ||
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    )
      return null;
    return {
      x: Math.min(
        86,
        Math.max(14, ((clientX - bounds.left) / bounds.width) * 100),
      ),
      y: Math.min(
        86,
        Math.max(30, ((clientY - bounds.top) / bounds.height) * 100),
      ),
    };
  }
  function finishAgentDrag(id: string, clientX: number, clientY: number) {
    const position = positionInWorld(clientX, clientY);
    if (position) addAgent(id, position);
    setDraggingAgent('');
  }
  function dropAgent(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const id =
      event.dataTransfer.getData('application/x-round-agent') ||
      event.dataTransfer.getData('text/plain') ||
      draggingAgent;
    finishAgentDrag(id, event.clientX, event.clientY);
  }
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now();
      if (time.current.message !== message?.id)
        time.current = { message: message?.id ?? '', elapsed: 0, last: now };
      if (playing)
        time.current.elapsed = Math.min(
          TURN_MS,
          time.current.elapsed + now - time.current.last,
        );
      time.current.last = now;
      setClock(now);
      setPlayhead({
        message: time.current.message,
        elapsed: time.current.elapsed,
      });
    }, 100);
    return () => clearInterval(timer);
  }, [message?.id, playing]);
  const elapsed = playhead.message === message?.id ? playhead.elapsed : 0;
  useEffect(() => {
    if (playing && elapsed >= TURN_MS && completed.current !== message?.id) {
      completed.current = message?.id ?? '';
      onTurnEnd();
    }
    if (!playing) completed.current = '';
    if (elapsed < TURN_MS) completed.current = '';
  }, [elapsed, playing, message?.id, onTurnEnd]);
  const tick = reduced ? 0 : Math.floor(clock / 190);
  const state = (active: boolean, index: number): Action => {
    if (!active || elapsed >= 15000) {
      const idle = Math.floor(clock / 3800 + index * 2) % 9;
      return reduced
        ? '坐着倾听'
        : idle === 3
          ? '坐着思考'
          : idle === 6
            ? '打个盹'
            : '坐着倾听';
    }
    if (elapsed < 900) return '坐着倾听';
    if (elapsed < 1700) return '起立';
    if (elapsed < 3900) return '走向圆桌';
    if (elapsed < 5300) return '挥手示意';
    if (elapsed < 11800) return '发言中';
    if (elapsed < 14300) return '返回沙发';
    return '坐下';
  };
  return (
    <section className="room-experience" aria-label="可视化圆桌">
      <div className="room-controls">
        <div className="room-control-bar">
          <div className="room-control-tabs">
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              aria-expanded={settingsOpen}
              aria-controls="room-settings"
            >
              场景设置
            </button>
            <button
              type="button"
              onClick={() => setLibraryOpen(!libraryOpen)}
              aria-expanded={libraryOpen}
              aria-controls="agent-library"
            >
              Agent 库{presentGuests.length > 0 && <b>{presentGuests.length}</b>}
            </button>
          </div>
          <span>{playing ? '圆桌进行中' : '已暂停'}</span>
        </div>
        {settingsOpen && (
          <div id="room-settings">
            {[
              ['morning', '晨光共创室'],
              ['strategy', '黄昏作战室'],
              ['night', '夜间研究室'],
            ].map(([id, name]) => (
              <button
                key={id}
                type="button"
                aria-pressed={scene === id}
                onClick={() => onScene(id)}
              >
                {name}
              </button>
            ))}
            <button type="button" onClick={() => onScene(null)}>
              跟随讨论进度
            </button>
          </div>
        )}
        {libraryOpen && (
          <div id="agent-library" className="agent-library">
            {agentLibrary.map((agent) => {
              const joined = presentGuests.some((item) => item.id === agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  draggable={!joined}
                  disabled={joined}
                  onDragStart={(event) => {
                    setDraggingAgent(agent.id);
                    event.dataTransfer.setData(
                      'application/x-round-agent',
                      agent.id,
                    );
                    event.dataTransfer.setData('text/plain', agent.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onPointerDown={() => setDraggingAgent(agent.id)}
                  onDragEnd={(event) =>
                    finishAgentDrag(agent.id, event.clientX, event.clientY)
                  }
                  onClick={() => addAgent(agent.id)}
                >
                  <span className="agent-library-avatar" aria-hidden="true" />
                  <strong>{agent.name}</strong>
                  <em>{joined ? '已加入' : '拖入场景'}</em>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div
        ref={worldRef}
        className={'room-world room-' + scene}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={dropAgent}
        onPointerUp={(event) => {
          if (draggingAgent)
            finishAgentDrag(draggingAgent, event.clientX, event.clientY);
        }}
      >
        {['morning', 'strategy', 'night'].map((s) => (
          <div
            key={s}
            className={'room-backdrop ' + (s === scene ? 'shown' : '')}
            style={{ backgroundImage: 'url(/roundtable/scenes/' + s + '.png)' }}
            aria-hidden="true"
          />
        ))}
        <div className="room-sunbeam" aria-hidden="true" />
        <div className="room-lamp" aria-hidden="true" />
        {round.roles.slice(0, 4).map((role, i) => {
          const seat = seats[i],
            target = podiums[i],
            active = role.id === message?.speakerRoleId;
          const action = state(active, i),
            returning = action === '返回沙发';
          let progress = active
            ? elapsed < 1700
              ? 0
              : elapsed < 3900
                ? (elapsed - 1700) / 2200
                : elapsed < 11800
                  ? 1
                  : elapsed < 14300
                    ? 1 - (elapsed - 11800) / 2500
                    : 0
            : 0;
          if (reduced) progress = action === '发言中' ? 1 : 0;
          const x = seat.x + (target.x - seat.x) * progress,
            y = seat.y + (target.y - seat.y) * progress,
            direction = walkSprite(
              (target.x - seat.x) * (returning ? -1 : 1),
              (target.y - seat.y) * (returning ? -1 : 1),
            );
          return (
            <div
              key={role.id}
              className={
                'room-person ' +
                (action === '发言中' || action === '挥手示意'
                  ? 'talking '
                  : '') +
                (action === '坐下' ||
                action === '坐着倾听' ||
                action === '坐着思考' ||
                action === '打个盹'
                  ? 'seated'
                  : 'standing')
              }
              style={{ left: x + '%', top: y + '%', zIndex: Math.round(y) }}
              data-action={action}
            >
              <div
                className={
                  'room-body ' + (action === '打个盹' ? 'sleeping' : '')
                }
              >
                <Sprite
                  action={action}
                  face={seat.face}
                  tick={tick}
                  walking={direction}
                />
              </div>
              <span className="room-name">{role.name}</span>
            </div>
          );
        })}
        {presentGuests.map((agent, index) => (
          <div
            key={agent.id}
            className="room-person room-guest standing"
            style={{
              left: agent.x + '%',
              top: agent.y + '%',
              zIndex: Math.round(agent.y),
            }}
          >
            <div className="room-body">
              <Sprite
                action="起立"
                face={7}
                tick={tick + index}
                walking="walk-front"
              />
            </div>
            <span className="room-name">{agent.name}</span>
          </div>
        ))}
      </div>
      <div className="room-caption" aria-live="polite">
        <span>
          主持人已安排 ·{' '}
          {round.roles.find((r) => r.id === message?.speakerRoleId)?.name} ·{' '}
          {round.scheduler?.mode === 'autonomous'
            ? `第 ${visible} 轮`
            : `${visible} / ${round.messages.length}`}
        </span>
        <p>
          {elapsed >= 5300 || !playing
            ? message?.content
            : '正在起身前往圆桌，请稍候…'}
        </p>
      </div>
    </section>
  );
}
