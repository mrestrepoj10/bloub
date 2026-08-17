import { describe, expect, it } from 'vitest'
import { ACCESSORIES, ACCESSORY_BY_ID, type AccessoryRole } from './accessories'
import {
  DEFAULT_ACCENT,
  DEFAULT_FINISH,
  FINISHES,
  FINISH_BY_ID,
  accessoryColors,
  isCustomAccent,
  luminance,
  resolveAccent
} from './finishes'
import { COLORS, COLOR_BY_ID } from './skins'

const casque = ACCESSORY_BY_ID.get('casque')!
const gilet = ACCESSORY_BY_ID.get('gilet')!
const ROLES: AccessoryRole[] = ['corps', 'clair', 'sombre', 'bande']

const ENCRE = COLOR_BY_ID.get('encre')!.hex

/**
 * Eclat : saturation fois clarte.
 *
 * Ni l'une ni l'autre ne suffit a dire ce qu'est une teinte fluo. Le jaune neon
 * du casque est un peu MOINS sature que le jaune de securite, mais bien plus
 * clair ; l'orange neon du gilet, l'inverse. Ce que les deux ont en commun,
 * c'est de crier plus fort : une couleur vive et lumineuse a la fois.
 */
function eclat(hex: string) {
  const v = parseInt(hex.slice(1), 16)
  const canaux = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  const haut = Math.max(...canaux)
  const saturation = haut === 0 ? 0 : (haut - Math.min(...canaux)) / haut
  return saturation * luminance(hex)
}
const teintes = (finish: string, acc = casque, accent = DEFAULT_ACCENT, ink = ENCRE) =>
  accessoryColors(acc, { finish, accent, ink })

describe('catalogue des finitions', () => {
  it('a des ids uniques et une valeur par defaut qui existe', () => {
    expect(new Set(FINISHES.map((f) => f.id)).size).toBe(FINISHES.length)
    expect(FINISH_BY_ID.get(DEFAULT_FINISH)).toBeDefined()
  })

  /*
   * Une seule finition demande une couleur, et c'est ce qui autorise
   * l'interface a n'afficher le nuancier qu'avec elle : les trois autres
   * tirent leur teinte de l'objet ou du bot, un nuancier y serait inerte.
   */
  it('ne fait dependre qu une seule finition de la couleur d accent', () => {
    expect(FINISHES.filter((f) => f.tinted).map((f) => f.id)).toEqual(['accent'])
  })

  it('donne les quatre roles, en hex, quelle que soit la finition', () => {
    for (const f of FINISHES) {
      for (const acc of ACCESSORIES) {
        const palette = teintes(f.id, acc)
        for (const role of ROLES) expect(palette[role], `${f.id}/${role}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('retombe sur la finition par defaut pour un id inconnu', () => {
    // La valeur vient du localStorage ou d'une prop : elle n'est pas sure.
    expect(teintes('bariole')).toEqual(teintes(DEFAULT_FINISH))
  })
})

describe('couleur d accent', () => {
  it('accepte un id de la palette comme un hex de la pipette', () => {
    expect(resolveAccent('bleu')).toBe(COLOR_BY_ID.get('bleu')!.hex)
    expect(resolveAccent('#A1B2C3')).toBe('#a1b2c3')
  })

  it('refuse tout le reste', () => {
    // Une valeur trafiquee finirait sinon telle quelle dans un attribut `fill`.
    const defaut = COLOR_BY_ID.get(DEFAULT_ACCENT)!.hex
    for (const bidon of ['', 'rouge vif', '#12345', 'url(#x)', 'red;fill:blue']) {
      expect(resolveAccent(bidon)).toBe(defaut)
    }
    expect(resolveAccent(undefined)).toBe(defaut)
  })

  it('distingue la pipette du nuancier', () => {
    expect(isCustomAccent('#ff0000')).toBe(true)
    expect(isCustomAccent('bleu')).toBe(false)
    expect(isCustomAccent('nawak')).toBe(false)
  })
})

describe('chantier et fluo', () => {
  it('donnent a chaque objet SA teinte : casque jaune, gilet orange', () => {
    expect(teintes('chantier', casque).corps).toBe(casque.livery)
    expect(teintes('chantier', gilet).corps).toBe(gilet.livery)
    expect(teintes('chantier', casque).corps).not.toBe(teintes('chantier', gilet).corps)
  })

  it('poussent la meme teinte au neon en fluo', () => {
    expect(teintes('fluo', casque).corps).toBe(casque.fluo)
    for (const acc of ACCESSORIES) {
      expect(eclat(acc.fluo), acc.id).toBeGreaterThan(eclat(acc.livery))
    }
  })

  it('eclairent le reflet et assombrissent l ombre', () => {
    for (const f of ['chantier', 'fluo', 'accent'] as const) {
      const p = teintes(f, gilet)
      expect(luminance(p.clair), f).toBeGreaterThan(luminance(p.corps))
      expect(luminance(p.sombre), f).toBeLessThan(luminance(p.corps))
    }
  })

  it('ignorent la couleur d accent', () => {
    expect(teintes('chantier', gilet, 'rose')).toEqual(teintes('chantier', gilet, 'vert'))
    expect(teintes('fluo', gilet, 'rose')).toEqual(teintes('fluo', gilet, 'vert'))
  })
})

describe('accent', () => {
  it('peint les deux objets de la meme couleur choisie', () => {
    const rose = COLOR_BY_ID.get('rose')!.hex
    expect(teintes('accent', casque, 'rose').corps).toBe(rose)
    expect(teintes('accent', gilet, 'rose').corps).toBe(rose)
  })

  it('prend aussi une teinte libre venue de la pipette', () => {
    expect(teintes('accent', gilet, '#123456').corps).toBe('#123456')
  })

  /*
   * Une bande claire sur une coque claire disparait. Le cas se produit pour de
   * vrai : « creme » est dans la palette, et l'accent accepte n'importe quel
   * hex.
   */
  it('fait passer la bande de l autre cote sur une coque claire', () => {
    const clair = teintes('accent', gilet, 'creme')
    expect(luminance(clair.bande)).toBeLessThan(luminance(clair.corps))
    const sombre = teintes('accent', gilet, 'bleu')
    expect(luminance(sombre.bande)).toBeGreaterThan(luminance(sombre.corps))
  })
})

describe('ton sur ton', () => {
  it('ne depend que du bot : meme teinte pour les deux objets', () => {
    for (const c of COLORS) {
      expect(teintes('mono', casque, DEFAULT_ACCENT, c.hex)).toEqual(
        teintes('mono', gilet, DEFAULT_ACCENT, c.hex)
      )
    }
  })

  it('ignore la couleur d accent, qui ne la commande pas', () => {
    expect(teintes('mono', gilet, 'rose')).toEqual(teintes('mono', gilet, 'vert'))
  })

  /*
   * LE test de cette finition : prise telle quelle, la couleur du bot rendrait
   * l'objet invisible — il serait exactement de la teinte du corps qui le
   * porte. Elle est donc decalee, vers le clair sur un bot sombre et vers le
   * sombre sur un bot clair, et ca doit tenir sur les douze couleurs.
   */
  it('reste lisible sur chacune des douze couleurs du bot', () => {
    for (const c of COLORS) {
      const p = teintes('mono', casque, DEFAULT_ACCENT, c.hex)
      const ecart = Math.abs(luminance(p.corps) - luminance(c.hex))
      expect(ecart, `« ${c.id} »`).toBeGreaterThan(0.1)
      // et la bande doit encore se detacher de la coque
      expect(Math.abs(luminance(p.bande) - luminance(p.corps)), `« ${c.id} »`).toBeGreaterThan(0.08)
    }
  })
})

describe('luminance', () => {
  it('pese le vert plus que le bleu, comme l oeil', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBe(1)
    expect(luminance('#00ff00')).toBeGreaterThan(luminance('#0000ff'))
  })
})
