import { describe, expect, it } from 'vitest'
import {
  ACCESSORIES,
  ACCESSORY_BY_ID,
  NO_TILT,
  normalizeAccessories,
  toggleAccessory,
  type BotAccessory,
  type HeadTilt
} from './accessories'
import { EYE_H, EYE_SPLIT, REST_GAZE, eyePoses, headLean } from './face'
import { bodyMetrics, radiusAtAngle, toPoints, type Point } from './shape'
import { SHAPES } from './skins'

/** Mesures du corps pour une forme du personnalisateur, a l'echelle 1. */
function corps(radii: number[]) {
  return bodyMetrics(toPoints({ radii, rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 }, 1))
}

/**
 * La POSE DE REPOS, et non `NO_TILT` : au repos la tete penche deja de -26deg a
 * l'ecran, et c'est sur elle que le placement est cale. `NO_TILT` decrit une
 * tete parfaitement droite, que le bot n'a jamais.
 */
const REPOS_TILT: HeadTilt = { x: 0, y: 0, lean: headLean(REST_GAZE), roll: 0 }

const pieces = (acc: BotAccessory, radii: number[], head: HeadTilt = REPOS_TILT) =>
  acc.parts(corps(radii), head)

const points = (
  acc: BotAccessory,
  radii: number[],
  libres = false,
  head: HeadTilt = REPOS_TILT
): Point[] =>
  pieces(acc, radii, head)
    .filter((p) => !libres || !p.clipped)
    .flatMap((p) => p.pts)

/**
 * Balayage de poses de tete, plus large que ce que le bot produit vraiment :
 * releve sur tous les etats, toutes les expressions et les quatre coins du
 * suivi de curseur, l'ecart ne depasse pas 0.62 en x comme en y, ni 25deg de
 * roulis.
 */
const POSES: HeadTilt[] = [NO_TILT, REPOS_TILT]
for (const x of [-0.7, 0, 0.7]) {
  for (const y of [-0.7, 0, 0.7]) {
    for (const lean of [-45, -26, 0, 20]) {
      for (const roll of [-25, 0, 25]) POSES.push({ x, y, lean, roll })
    }
  }
}

/**
 * Ce que la derive du regard au repos deplace : mesuree a 0.06 rayon et 1,8deg.
 * C'est la seule pose qu'un export FIXE peut contenir, donc la seule que
 * `reach` ait a couvrir.
 */
const REPOS: HeadTilt[] = [REPOS_TILT]
for (const x of [-0.07, 0.07]) {
  for (const y of [-0.05, 0.05]) {
    for (const roll of [-2, 2]) REPOS.push({ x, y, lean: REPOS_TILT.lean + roll, roll })
  }
}

/** Demi-cote du viewBox de l'ecran, en rayons de boule (cf. le `VB` de BloubBot). */
const ECRAN = 1.58

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
    return { x: e.x * fit, haut: e.y * fit - demi, bas: e.y * fit + demi }
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
    it(`"${acc.id}" tient dans la portee qu il declare, au repos`, () => {
      // `reach` cadre l'export FIXE, qui rend la pose de repos : la derive du
      // regard est donc la seule chose qui bouge encore dessous.
      for (const forme of SHAPES) {
        for (const head of REPOS) {
          for (const p of points(acc, forme.radii, true, head)) {
            const r = Math.hypot(p.x, p.y)
            expect(r, `${acc.id} depasse sur « ${forme.id} »`).toBeLessThanOrEqual(acc.reach)
          }
        }
      }
    })

    it(`"${acc.id}" reste dans le viewBox de l ecran, tete penchee`, () => {
      // L'autre borne : une tete franchement tournee sort du cadre fixe, mais
      // ce mouvement-la ne se voit qu'a l'ecran et dans l'export d'un CYCLE,
      // qui tournent tous deux sur le viewBox large.
      for (const forme of SHAPES) {
        for (const head of POSES) {
          for (const p of points(acc, forme.radii, true, head)) {
            expect(Math.hypot(p.x, p.y), `${acc.id} sur « ${forme.id} »`).toBeLessThan(ECRAN)
          }
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

  it('reste sur le haut de la tete dans toutes les poses', () => {
    /*
     * Il ne depasse plus forcement du sommet une fois la tete penchee : sur une
     * forme pointue, un casque qui glisse vers l'avant passe sous la pointe, et
     * c'est ce qu'on veut voir. Ce qui doit tenir, c'est qu'il reste un
     * COUVRE-CHEF — dans la moitie haute, jamais en travers du visage.
     */
    for (const forme of SHAPES) {
      const body = corps(forme.radii)
      for (const head of POSES) {
        const ys = points(casque, forme.radii, false, head).map((p) => p.y)
        expect(Math.min(...ys), `« ${forme.id} »`).toBeLessThan(body.top * 0.5)
        // il reste dans la moitie haute : un bord de visiere peut plonger un
        // peu sous l'equateur d'une forme ecrasee, pas le couvre-chef entier
        expect(Math.max(...ys), `« ${forme.id} »`).toBeLessThan(body.bottom * 0.5)
      }
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
    /*
     * Le calage (`CASQUE_ASSISE`) est fait sur le cercle : la visiere s'arrete
     * au ras des yeux au repos. Mesure AU-DESSUS DE CHAQUE OEIL et non sur tout
     * l'objet : le casque est incline, donc son bord bas plonge du cote gauche
     * — la ou il n'y a aucun oeil, et ou plonger est justement ce qu'on veut
     * voir d'un casque porte de travers.
     */
    const cercle = SHAPES.find((s) => s.id === 'cercle')!.radii
    const pts = points(casque, cercle)
    for (const oeil of yeux(cercle)) {
      const dessus = pts.filter((p) => Math.abs(p.x - oeil.x) < 0.12)
      const bas = Math.max(...dessus.map((p) => p.y))
      expect(bas).toBeLessThanOrEqual(oeil.haut)
      // ... et pas perche a dix lieues au-dessus non plus
      expect(oeil.haut - bas).toBeLessThan(0.16)
    }
  })
})

describe('suivi de la tete', () => {
  const casque = ACCESSORY_BY_ID.get('casque')!
  const gilet = ACCESSORY_BY_ID.get('gilet')!
  const cercle = SHAPES.find((s) => s.id === 'cercle')!.radii
  /** Hauteur moyenne d'un objet : ce qui dit s'il monte ou s'il descend. */
  const hauteur = (acc: BotAccessory, head: HeadTilt) => {
    const pts = points(acc, cercle, false, head)
    return pts.reduce((somme, p) => somme + p.y, 0) / pts.length
  }
  const cote = (acc: BotAccessory, head: HeadTilt) => {
    const pts = points(acc, cercle, false, head)
    return pts.reduce((somme, p) => somme + p.x, 0) / pts.length
  }

  /*
   * Le calage du casque et du gilet est fait SUR LA POSE DE REPOS. L'ecart y
   * etant nul par construction, rien ne doit bouger tant que le regard ne bouge
   * pas — sinon tout le reglage relatif aux yeux serait a refaire.
   */
  it('ne deplace rien tant que la tete est dans sa pose de repos', () => {
    for (const acc of ACCESSORIES) {
      expect(pieces(acc, cercle, { ...REPOS_TILT })).toEqual(pieces(acc, cercle))
    }
  })

  /*
   * Le casque est perpendiculaire a l'AXE de la tete et non a l'ecran : au repos
   * cet axe penche deja de -26deg, donc un casque pose bien droit y flotte. Sa
   * seule mesure qui ne soit pas un ecart a la pose de repos.
   */
  it('incline le casque avec l axe de la tete, des la pose de repos', () => {
    const droit = points(casque, cercle, false, { ...REPOS_TILT, lean: 0 })
    const penche = points(casque, cercle)
    expect(penche).not.toEqual(droit)
    // il penche du meme cote que la tete, donc vers la gauche au repos
    const moyenne = (pts: Point[]) => pts.reduce((s, p) => s + p.x, 0) / pts.length
    expect(moyenne(penche)).toBeLessThan(moyenne(droit))
  })

  it('fait monter le casque quand la tete se leve, descendre quand elle baisse', () => {
    const haut = hauteur(casque, { ...REPOS_TILT, y: -0.4 })
    const repos = hauteur(casque, REPOS_TILT)
    const bas = hauteur(casque, { ...REPOS_TILT, y: 0.4 })
    expect(haut).toBeLessThan(repos)
    expect(repos).toBeLessThan(bas)
  })

  it('le fait glisser du cote ou la tete se tourne', () => {
    expect(cote(casque, { ...REPOS_TILT, x: 0.4 })).toBeGreaterThan(cote(casque, REPOS_TILT))
    expect(cote(casque, { ...REPOS_TILT, x: -0.4 })).toBeLessThan(cote(casque, REPOS_TILT))
  })

  /*
   * Le gilet est peint sur la MEME boule que le casque : une boule qui tourne
   * fait descendre son bas pendant que son sommet monte. Les deux objets vont
   * donc en sens inverse, et c'est ce qui se lit comme une rotation plutot que
   * comme deux dessins qui glissent ensemble.
   */
  it('emmene le gilet dans le meme sens, et bien moins loin', () => {
    // Il accompagne le mouvement au lieu de le contrarier : a l'envers, les
    // etats qui baissent le regard le faisaient remonter jusqu'aux yeux.
    expect(hauteur(gilet, { ...REPOS_TILT, y: 0.4 })).toBeGreaterThan(hauteur(gilet, REPOS_TILT))
    expect(cote(gilet, { ...REPOS_TILT, x: 0.4 })).toBeGreaterThan(cote(gilet, REPOS_TILT))
    // et toujours moins que le casque, qui est pose sur la tete meme
    const bouge = (acc: BotAccessory) =>
      Math.abs(hauteur(acc, { ...REPOS_TILT, y: 0.4 }) - hauteur(acc, REPOS_TILT))
    expect(bouge(gilet)).toBeLessThan(bouge(casque))
  })

  it('ne laisse jamais le gilet monter jusqu au visage', () => {
    /*
     * La gene est DISSYMETRIQUE, et c'est ce qui justifie le debattement du
     * meme nom : vers le bas le vetement n'a rien a heurter, vers le haut il y
     * a les yeux. Meme dans la pose la plus tordue, son col doit rester dans le
     * bas de la boule.
     *
     * Mesure sur ce qui est VISIBLE seulement : le gilet deborde franchement du
     * contour par construction (c'est le masque qui lui donne sa forme), donc
     * ses points lointains ne disent rien de ce qu'on voit.
     */
    for (const head of POSES) {
      const dedans = points(gilet, cercle, false, head).filter((p) => Math.hypot(p.x, p.y) <= 1)
      expect(Math.min(...dedans.map((p) => p.y)), `x=${head.x} y=${head.y}`).toBeGreaterThan(-0.35)
    }
  })

  it('penche chaque objet sur sa propre mesure, en miroir', () => {
    // Le casque suit l'inclinaison ABSOLUE de l'axe, le gilet l'ECART de roulis.
    // Tete droite de part et d'autre : deux inclinaisons opposees doivent
    // donner deux images en miroir, sinon un signe s'est perdu en route.
    const droit: HeadTilt = { x: 0, y: 0, lean: 0, roll: 0 }
    const cas = [
      { acc: casque, plus: { lean: 20 }, moins: { lean: -20 } },
      { acc: gilet, plus: { roll: 20 }, moins: { roll: -20 } }
    ]
    for (const { acc, plus, moins } of cas) {
      const repos = points(acc, cercle, false, droit)
      const droite = points(acc, cercle, false, { ...droit, ...plus })
      const gauche = points(acc, cercle, false, { ...droit, ...moins })
      expect(droite).not.toEqual(repos)
      const ecart = (a: Point[]) =>
        a.reduce((somme, p, i) => somme + (p.x - repos[i]!.x), 0) / a.length
      expect(ecart(droite)).toBeCloseTo(-ecart(gauche), 2)
    }
  })

  it('reste amorti : la tete se tourne plus que ce qu elle porte', () => {
    // Un objet qui suivrait au pied de la lettre quitterait le crane : le pole
    // de la tete se deplace de 0.9 rayon entre deux poses extremes.
    for (const acc of ACCESSORIES) {
      for (const axe of ['x', 'y'] as const) {
        const tete = 0.4
        const bouge = Math.abs(
          (axe === 'x' ? cote : hauteur)(acc, { ...REPOS_TILT, [axe]: tete }) -
            (axe === 'x' ? cote : hauteur)(acc, REPOS_TILT)
        )
        expect(bouge, `${acc.id}/${axe}`).toBeGreaterThan(0.02)
        expect(bouge, `${acc.id}/${axe}`).toBeLessThan(tete)
      }
    }
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
