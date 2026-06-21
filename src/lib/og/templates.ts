import { h, type OgNode } from './h'
import type { OgData } from './data'

const INK = '#15233a'
const OCHRE = '#d49a3a'
const TERRACOTTA = '#b04a3a'
const PAPER = '#f3e8d2'
const WHITE = '#ffffff'

// The mark: "◆ shariq.dev" with an ochre diamond.
function mark(): OgNode {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', fontFamily: 'JetBrains Mono', fontSize: 24, color: WHITE } },
    h('div', { style: { color: OCHRE, marginRight: 10 } }, '◆'),
    h('div', { style: { display: 'flex' } }, 'shariq.dev')
  )
}

// ---------- Hybrid: post HAS a cover ----------
export function hybridTemplate(d: OgData): OgNode {
  return h(
    'div',
    {
      style: {
        position: 'relative',
        width: 1200,
        height: 630,
        display: 'flex',
        background: INK,
        fontFamily: 'Inter',
      },
    },
    h('img', {
      src: d.cover as string,
      style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' },
    }),
    h('div', {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1200,
        height: 630,
        backgroundImage:
          'linear-gradient(105deg, rgba(21,35,58,0.94) 30%, rgba(21,35,58,0.55) 58%, rgba(21,35,58,0.15) 100%)',
      },
    }),
    h('div', { style: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 12, background: TERRACOTTA } }),
    h(
      'div',
      {
        style: {
          position: 'absolute',
          top: 64,
          left: 76,
          right: 64,
          bottom: 56,
          display: 'flex',
          flexDirection: 'column',
          color: WHITE,
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontFamily: 'JetBrains Mono',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: OCHRE,
          },
        },
        d.eyebrow
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            marginTop: 'auto',
            maxWidth: 700,
            fontFamily: 'Fraunces',
            fontWeight: 600,
            fontSize: 78,
            lineHeight: 1.04,
            letterSpacing: -1,
          },
        },
        d.title
      ),
      h(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 34 } },
        mark(),
        h(
          'div',
          { style: { display: 'flex', fontFamily: 'JetBrains Mono', fontSize: 19, color: 'rgba(255,255,255,0.7)' } },
          `${d.dateLabel} · ${d.readingLabel}`
        )
      )
    )
  )
}

// ---------- Fallback: post has NO cover ----------
export function fallbackTemplate(d: OgData): OgNode {
  return h(
    'div',
    { style: { width: 1200, height: 630, display: 'flex', background: INK, fontFamily: 'Inter' } },
    // left text column (1.25fr of 2.25 → 667px)
    h(
      'div',
      {
        style: {
          position: 'relative',
          width: 667,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          padding: '70px 56px 60px 76px',
          color: WHITE,
        },
      },
      h('div', { style: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 12, background: OCHRE } }),
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontFamily: 'JetBrains Mono',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: OCHRE,
          },
        },
        d.eyebrow
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            marginTop: 'auto',
            maxWidth: 480,
            fontFamily: 'Fraunces',
            fontWeight: 600,
            fontSize: 76,
            lineHeight: 1.04,
            letterSpacing: -1,
          },
        },
        d.title
      ),
      h('div', { style: { display: 'flex', marginTop: 34 } }, mark())
    ),
    // right art panel (1fr → 533px) with palette geometric motif
    h(
      'div',
      {
        style: {
          position: 'relative',
          width: 533,
          height: 630,
          display: 'flex',
          backgroundImage: 'linear-gradient(135deg, #1b2c44, #15233a)',
        },
      },
      h('div', {
        style: { position: 'absolute', top: 150, left: 120, width: 150, height: 150, borderRadius: 999, border: `7px solid ${OCHRE}` },
      }),
      h('div', {
        style: { position: 'absolute', top: 300, left: 300, width: 90, height: 90, borderRadius: 999, background: TERRACOTTA },
      }),
      h('div', {
        style: { position: 'absolute', top: 200, left: 330, width: 70, height: 18, borderRadius: 9, background: OCHRE },
      }),
      h('div', {
        style: { position: 'absolute', top: 430, left: 150, width: 22, height: 22, borderRadius: 999, background: PAPER },
      }),
      h('div', {
        style: { position: 'absolute', top: 430, left: 195, width: 22, height: 22, borderRadius: 999, background: PAPER },
      })
    )
  )
}
