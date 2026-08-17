import { describe, expect, it } from 'vitest'
import {
  ACCESSORIES,
  ACCESSORY_BY_ID,
  normalizeAccessories,
  toggleAccessory,
  type BotAccessory
} from './accessories'
import { EYE_H, EYE_SPLIT, REST_GAZE, eyePoses } from './face'
import { bodyMetrics, radiusAtAngle, toPoints, type Point } from './shape'
import { SHAPES } from './skins'

/** Mesures du corps pour une forme du personnalisateur, a l'echelle 1. */
function corps(radii: number[]) {
  return bodyMetrics(toPoints({ radii, rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 }, 1))
}

const pieces = (acc: BotAccessory, radii: number[]) => acc.parts(corps(radii))

const points = (acc: BotAccessory, radii: number[], libres = false): Point[] =>
  pieces(acc, radii)
    .filter((p) => !libres || !p.clipped)
    .flatMap((p) => p.pts)

/**
 * Etendue verticale des yeux AU REPOS pour une forme donnee, en unites de rayon
 * de boule. Les yeux vivent sur une sphere, donc ils sont recales au rayon reel
 * du profil dans leur direction (`radiusAtAngle`, comme le fait le moteur) : sur
 * une forme aplatie ils remontent vers le sommet, et c'est justement le cas ou
 * un objet pose sur la tete vient les chercher.
 */
function yeux(radii: number[]) {
  return eyePoses(REST_GAZE, 1, EYE_SPLIT).map((e) => {
    const fit = radiusAtAngle(radii, Math.atan2(e.y, e.x))
    // demi-hauteur de la gelule projetee a l'ecran
    const demi = (EYE_H / 2) * Math.abs(e.d)
    return { haut: e.y * fit - demi, bas: e.y * fit + demi }
  })
}

describe('catalogue des accessoires', () => {
  it('a des ids uniques', () => {
    expect(new Set(ACCESSORIES.map((a) => a.id)).size).toBe(ACCESSORIES.length)
    expect(ACCESSORY_BY_ID.size).toBe(ACCESSORIES.length)
  })

  it('propose de quoi habiller la tete et le torse', () => {
    expect(ACCESSORIES.map((a) => a.slot)).toContain('tete')
    expect(ACCESSORIES.map((a) => a.slot)).toContain('torse')
  })
})

describe('liste portee', () => {
  it('jette les ids inconnus', () => {
    expect(normalizeAccessories(['casque', 'chapeau', ''])).toEqual(['casque'])
  })

  it('ne garde qu un objet par emplacement', () => {
    // Deux objets d'emplacements differents cohabitent, deux du meme non.
    expect(normalizeAccessories(['casque', 'gilet'])).toEqual(['casque', 'gilet'])
    expect(normalizeAccessories(['casque', 'casque'])).toEqual(['casque'])
  })

  it('bascule : un clic pose, le suivant retire', () => {
    expect(toggleAccessory([], 'casque')).toEqual(['casque'])
    expect(toggleAccessory(['casque'], 'casque')).toEqual([])
    expect(toggleAccessory(['casque'], 'gilet')).toEqual(['casque', 'gilet'])
    expect(toggleAccessory(['casque', 'gilet'], 'casque')).toEqual(['gilet'])
  })
})

describe('geometrie sur toutes les formes', () => {
  /*
   * LE test du fichier, le pendant de celui du cadre d'export : c'est `reach`
   * qui decide de la largeur du cadre (`demiCadre`, src/ui/export.ts), donc un
   * casque qui monterait plus haut que sa portee declaree se ferait rogner en
   * silence sur l'image exportee.
   */
  for (const acc of ACCESSORIES) {
    it(`"${acc.id}" tient dans la portee qu il declare`, () => {
      for (const forme of SHAPES) {
        for (const p of points(acc, forme.radii, true)) {
          const r = Math.hypot(p.x, p.y)
          expect(r, `${acc.id} depasse sur « ${forme.id} »`).toBeLessThanOrEqual(acc.reach)
        }
      }
    })

    it(`"${acc.id}" dessine quelque chose sur chaque forme`, () => {
      for (const forme of SHAPES) {
        const parts = pieces(acc, forme.radii)
        expect(parts.length).toBeGreaterThan(0)
        for (const p of parts) {
          expect(p.pts.length).toBeGreaterThanOrEqual(3)
          expect(['corps', 'clair', 'sombre', 'bande']).toContain(p.role)
          for (const point of p.pts) expect(Number.isFinite(point.x + point.y)).toBe(true)
        }
      }
    })
  }
})

describe('casque', () => {
  const casque = ACCESSORY_BY_ID.get('casque')!

  it('se pose SUR le crane et le deborde par le haut', () => {
    for (const forme of SHAPES) {
      const body = corps(forme.radii)
      const ys = points(casque, forme.radii).map((p) => p.y)
      // la calotte passe au-dessus du sommet, la visiere reste sur la tete
      expect(Math.min(...ys), `« ${forme.id} »`).toBeLessThan(body.top)
      expect(Math.max(...ys), `« ${forme.id} »`).toBeGreaterThan(body.top)
      expect(Math.max(...ys), `« ${forme.id} »`).toBeLessThan(0)
    }
  })

  it('garde une largeur lisible meme sur une forme pointue', () => {
    // Sur le triangle ou la goutte, la corde du crane est presque nulle : sans
    // plancher, le casque se reduirait a un trait.
    for (const forme of SHAPES) {
      const xs = points(casque, forme.radii).map((p) => p.x)
      expect(Math.max(...xs) - Math.min(...xs), `« ${forme.id} »`).toBeGreaterThan(0.6)
    }
  })

  it('se pose juste au-dessus des yeux sur la forme par defaut', () => {
    // Le calage (`CASQUE_ASSISE`) est fait sur le cercle : la visiere s'arrete
    // au ras des yeux au repos. Sur les formes aplaties elle les recouvre, et
    // c'est le masque du visage qui les repunche (cf. BloubBot.vue) — la place
    // manque, l'oeil exterieur y montant plus haut que le sommet du crane.
    const cercle = SHAPES.find((s) => s.id === 'cercle')!.radii
    const bas = Math.max(...points(casque, cercle).map((p) => p.y))
    const oeilHaut = Math.min(...yeux(cercle).map((e) => e.haut))
    expect(bas).toBeLessThanOrEqual(oeilHaut)
    // ... et pas perche a dix lieues au-dessus non plus
    expect(oeilHaut - bas).toBeLessThan(0.1)
  })
})

describe('gilet', () => {
  const gilet = ACCESSORY_BY_ID.get('gilet')!

  it('est entierement decoupe par le corps, donc ne deborde de rien', () => {
    for (const part of pieces(gilet, SHAPES[0]!.radii)) expect(part.clipped).toBe(true)
    expect(gilet.reach).toBe(0)
  })

  it('deborde volontairement du contour : c est le masque qui lui donne sa forme', () => {
    // Sans ce debord, le vetement ne toucherait pas le bord des formes larges.
    const large = Math.max(...points(gilet, SHAPES[0]!.radii).map((p) => Math.abs(p.x)))
    expect(large).toBeGreaterThan(Math.max(...SHAPES.flatMap((s) => s.radii)))
  })

  it('ne monte pas jusqu aux yeux sur la forme par defaut', () => {
    // Le masque interdit de toute facon au vetement de couvrir un oeil, mais un
    // col qui vient le lecher se verrait quand meme.
    const cercle = SHAPES.find((s) => s.id === 'cercle')!.radii
    const haut = Math.min(...points(gilet, cercle).map((p) => p.y))
    expect(haut).toBeGreaterThan(Math.max(...yeux(cercle).map((e) => e.bas)))
  })

  it('reste sous le regard sur toutes les formes', () => {
    // Sur une forme aplatie (la capsule) les yeux redescendent vers le col : le
    // profil les rapproche du centre, la ou le cercle leur laisse toute la
    // hauteur. Le col passe alors a cote d'eux — jamais dessus, le masque s'en
    // charge — mais il ne doit en aucun cas remonter jusqu'a couper un regard.
    for (const forme of SHAPES) {
      const haut = Math.min(...points(gilet, forme.radii).map((p) => p.y))
      const centres = yeux(forme.radii).map((e) => (e.haut + e.bas) / 2)
      expect(haut, `« ${forme.id} »`).toBeGreaterThan(Math.max(...centres))
    }
  })
})
