import { useMemo, useState } from 'react';
import {
  BOTTOMS,
  BROW_STYLES,
  CLOTH_COLORS,
  EYE_COLORS,
  EYE_STYLES,
  FACIAL_HAIR,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  MOUTH_STYLES,
  SKIN_TONES,
  TOPS,
  randomAvatar,
  type Avatar,
} from '../../shared/avatar';
import type { Dir } from '../../shared/map';
import { api } from '../api';
import { emit } from '../net';
import { getState, setState, toast, useStore } from '../store';
import { sound } from '../sound';
import { AvatarStage, Confetti } from '../ui/common';
import { avatarPortrait, drawAvatar, type Anim } from '../world/avatarRender';

const thumbCache = new Map<string, string>();
function bodyThumb(a: Avatar, size = 72): string {
  const key = JSON.stringify(a) + size;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = size * 2;
  cv.height = size * 2;
  const c = cv.getContext('2d')!;
  drawAvatar(c, a, size, size * 2 - 10, (size * 2) / 64, { dir: 'down', anim: 'idle', t: 0.3 });
  const url = cv.toDataURL();
  if (thumbCache.size > 400) thumbCache.clear();
  thumbCache.set(key, url);
  return url;
}

const LABELS: Record<string, string> = {
  short: 'Short', buzz: 'Buzz', spiky: 'Spiky', curly: 'Curly', afro: 'Afro', wavy: 'Wavy', long: 'Long', bob: 'Bob',
  ponytail: 'Ponytail', bun: 'Bun', braids: 'Braids', locs: 'Locs', mohawk: 'Mohawk', bald: 'Bald',
  round: 'Round', happy: 'Happy', sleepy: 'Sleepy', wink: 'Wink', lashes: 'Lashes', cool: 'Cool',
  normal: 'Normal', thick: 'Thick', arched: 'Arched', none: 'None',
  smile: 'Smile', grin: 'Grin', neutral: 'Chill', smirk: 'Smirk', open: 'Laugh', tongue: 'Silly',
  stubble: 'Stubble', mustache: 'Mustache', goatee: 'Goatee', beard: 'Beard',
  square: 'Square', shades: 'Shades', stars: 'Stars',
  cap: 'Cap', beanie: 'Beanie', party: 'Party', crown: 'Crown', headphones: 'Headphones', bow: 'Bow', cowboy: 'Cowboy', flower: 'Flowers',
  tee: 'Tee', hoodie: 'Hoodie', jacket: 'Jacket', tank: 'Tank', sweater: 'Sweater', suit: 'Suit', dress: 'Dress', jersey: 'Jersey',
  jeans: 'Jeans', pants: 'Pants', shorts: 'Shorts', skirt: 'Skirt',
};

type Tab = 'face' | 'hair' | 'outfit' | 'extras';

export function Creator() {
  const user = useStore((s) => s.user)!;
  const inParty = useStore((s) => !!s.party);
  const [a, setA] = useState<Avatar>(() => user.avatar ?? randomAvatar());
  const [name, setName] = useState(user.displayName);
  const [tab, setTab] = useState<Tab>('face');
  const [dir, setDir] = useState<Dir>('down');
  const [anim, setAnim] = useState<Anim>('idle');
  const [emote, setEmote] = useState<string | null>(null);
  const [emoteKey, setEmoteKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const isNew = !user.avatar;

  const set = (patch: Partial<Avatar>) => {
    sound.play('pop');
    setA((cur) => ({ ...cur, ...patch }));
    setEmote('wave');
    setEmoteKey((k) => k + 1);
  };

  const save = async () => {
    sound.unlock();
    setSaving(true);
    try {
      const { user: u } = await api.updateMe({ avatar: a, displayName: name.trim() || user.displayName });
      setState({ user: u });
      sound.play('correct');
      if (getState().party) {
        emit('profile:updated');
        setState({ screen: 'party' });
      } else {
        const pending = getState().pendingCode;
        setState({ screen: 'home' });
        if (isNew && !pending) toast('Looking good! Now throw a party or join one 🎉', 'success');
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const rotate = () => {
    const order: Dir[] = ['down', 'right', 'up', 'left'];
    setDir(order[(order.indexOf(dir) + 1) % 4]);
  };

  const headOpts = <K extends keyof Avatar>(key: K, values: readonly Avatar[K][]) => (
    <div className="opt-grid">
      {values.map((v) => (
        <button key={String(v)} className={`opt ${a[key] === v ? 'on' : ''}`} onClick={() => set({ [key]: v } as Partial<Avatar>)}>
          <img src={avatarPortrait({ ...a, [key]: v }, 64)} alt="" />
          {LABELS[String(v)] ?? String(v)}
        </button>
      ))}
    </div>
  );

  const bodyOpts = <K extends keyof Avatar>(key: K, values: readonly Avatar[K][]) => (
    <div className="opt-grid">
      {values.map((v) => (
        <button key={String(v)} className={`opt ${a[key] === v ? 'on' : ''}`} onClick={() => set({ [key]: v } as Partial<Avatar>)}>
          <img src={bodyThumb({ ...a, [key]: v })} alt="" />
          {LABELS[String(v)] ?? String(v)}
        </button>
      ))}
    </div>
  );

  const colors = (key: keyof Avatar, list: readonly string[]) => (
    <div className="swatches">
      {list.map((c) => (
        <button
          key={c}
          className={`swatch ${a[key] === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => set({ [key]: c } as Partial<Avatar>)}
          aria-label={c}
        />
      ))}
    </div>
  );

  const flags = (
    <div className="row wrap" style={{ gap: 8 }}>
      {(['freckles', 'blush', 'earrings'] as const).map((k) => (
        <button key={k} className={`chip ${a[k] ? 'on' : ''}`} onClick={() => set({ [k]: !a[k] })}>
          {k === 'freckles' ? '✨ Freckles' : k === 'blush' ? '🌸 Blush' : '💛 Earrings'}
        </button>
      ))}
    </div>
  );

  const body = useMemo(() => {
    switch (tab) {
      case 'face':
        return (
          <>
            <Section title="Skin tone">{colors('skin', SKIN_TONES)}</Section>
            <Section title="Eyes">{headOpts('eyes', EYE_STYLES)}</Section>
            <Section title="Eye color">{colors('eyeColor', EYE_COLORS)}</Section>
            <Section title="Mouth">{headOpts('mouth', MOUTH_STYLES)}</Section>
            <Section title="Brows">{headOpts('brows', BROW_STYLES)}</Section>
            <Section title="Details">{flags}</Section>
          </>
        );
      case 'hair':
        return (
          <>
            <Section title="Hair color">{colors('hairColor', HAIR_COLORS)}</Section>
            <Section title="Hairstyle">{headOpts('hairStyle', HAIR_STYLES)}</Section>
            <Section title="Facial hair">{headOpts('facialHair', FACIAL_HAIR)}</Section>
          </>
        );
      case 'outfit':
        return (
          <>
            <Section title="Top">{bodyOpts('top', TOPS)}</Section>
            <Section title="Top color">{colors('topColor', CLOTH_COLORS)}</Section>
            <Section title="Accent color">{colors('accentColor', CLOTH_COLORS)}</Section>
            <Section title="Bottoms">{bodyOpts('bottom', BOTTOMS)}</Section>
            <Section title="Bottoms color">{colors('bottomColor', CLOTH_COLORS)}</Section>
            <Section title="Shoes">{colors('shoeColor', CLOTH_COLORS)}</Section>
          </>
        );
      case 'extras':
        return (
          <>
            <Section title="Headwear">{headOpts('hat', HATS)}</Section>
            <Section title="Hat color">{colors('hatColor', CLOTH_COLORS)}</Section>
            <Section title="Glasses">{headOpts('glasses', GLASSES)}</Section>
          </>
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, a]);

  return (
    <div className="party-bg">
      {isNew && <Confetti count={14} />}
      <div className="creator">
        <div className="creator-preview">
          <h1 style={{ fontSize: 28, textAlign: 'center' }}>{isNew ? 'Create your character' : 'Edit your character'}</h1>
          <div className="stage">
            <div className="stage-floor" />
            <AvatarStage avatar={a} dir={dir} anim={anim} emote={emote} poseSeq={emoteKey} scale={2.8} footY={0.9} />
          </div>
          <div className="preview-controls">
            <button className="chip" onClick={rotate}>
              🔄 Turn
            </button>
            {(['idle', 'walk', 'dance'] as Anim[]).map((m) => (
              <button key={m} className={`chip ${anim === m ? 'on' : ''}`} onClick={() => setAnim(m)}>
                {m === 'idle' ? '🧍 Chill' : m === 'walk' ? '🚶 Walk' : '🕺 Dance'}
              </button>
            ))}
            <button
              className="chip"
              onClick={() => {
                sound.play('reveal');
                setA(randomAvatar());
                setEmote('party');
                setEmoteKey((k) => k + 1);
              }}
            >
              🎲 Surprise me
            </button>
          </div>
        </div>
        <div className="creator-panel">
          <div style={{ padding: '14px 16px 0' }}>
            <div className="field">
              <label htmlFor="dn">Display name</label>
              <input id="dn" className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="creator-tabs">
            {(
              [
                ['face', '🙂 Face'],
                ['hair', '💇 Hair'],
                ['outfit', '👕 Outfit'],
                ['extras', '🧢 Extras'],
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="creator-body scroll">{body}</div>
          <div className="creator-footer">
            {!isNew && (
              <button className="btn ghost" onClick={() => setState({ screen: inParty ? 'party' : 'home' })}>
                Cancel
              </button>
            )}
            <button className="btn yellow block lg" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : isNew ? "I'm ready to party! 🎉" : 'Save look ✨'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="opt-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}
