import type { AccessoryRole, BotAccessory } from './accessories'
import { COLOR_BY_ID, mixHex } from './skins'

/**
 * Comment les objets portes sont PEINTS.
 *
 * La geometrie (`accessories.ts`) ne connait que des roles — la coque, son
 * reflet, son ombre, une bande retroreflechissante ; ce fichier les traduit en
 * couleurs. C'est ce partage qui permet d'ajouter un jeu de teintes sans
 * recopier une seule forme, et un objet neuf sans ecrire une seule couleur.
 *
 * Quatre recettes, et elles ne se distinguent pas par le gout mais par la
 * SOURCE de leur couleur :
 *
 * - `chantier` prend la teinte propre de chaque objet (le casque est jaune, le
 *   gilet orange) : c'est le vrai materiel, la reference ;
 * - `fluo` prend sa version neon, la meme logique poussee a la visibilite ;
 * - `mono` prend la couleur DU BOT et la decale : le kit parait taille dans la
 *   meme matiere que lui. C'est la seule qui n'offre aucun choix, et c'est ce
 *   qui la rend monochrome ;
 * - `accent` prend une couleur choisie, palette ou pipette.
 *
 * Aucune n'est mesuree sur la video : comme `--ink`, ce sont des choix.
 */

/** Enumeres pour que la couche i18n verifie leurs traductions a la compilation. */
export type FinishId = 'chantier' | 'fluo' | 'mono' | 'accent'

export interface BotFinish {
  id: FinishId
  /**
   * true = la couleur d'accent s'applique, donc l'interface a une raison de la
   * demander. Les trois autres tirent leur teinte d'ailleurs : les proposer
   * avec un nuancier afficherait une commande sans effet.
   */
  tinted: boolean
}

export const FINISHES: BotFinish[] = [
  { id: 'chantier', tinted: false },
  { id: 'fluo', tinted: false },
  { id: 'mono', tinted: false },
  { id: 'accent', tinted: true }
]

// Map indexee par `string` : la valeur vient du localStorage ou d'une prop.
export const FINISH_BY_ID = new Map<string, BotFinish>(FINISHES.map((f) => [f.id, f]))
export const DEFAULT_FINISH: FinishId = 'chantier'

/** Couleur d'accent au premier lancement : elle doit trancher sur l'encre. */
export const DEFAULT_ACCENT = 'bleu'

const BLANC = '#ffffff'
const NOIR = '#000000'
/**
 * Gris argent des bandes retroreflechissantes. Pas un blanc : la ou une bande
 * touche le bord du corps, un blanc se confondait avec le fond d'une image
 * exportee et la boule paraissait ouverte par le bas.
 */
const ARGENT = '#d9e1e8'

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Couleur d'accent effective. La valeur stockee est soit un id de la palette du
 * personnalisateur (les memes douze couleurs, donc les memes libelles traduits),
 * soit un hex libre venu de la pipette. Tout le reste retombe sur le defaut :
 * elle est relue du localStorage, donc elle n'est pas sure — et une valeur
 * trafiquee finirait sinon telle quelle dans l'attribut `fill` du SVG exporte.
 */
export function resolveAccent(value: string | undefined): string {
  if (value && HEX.test(value)) return value.toLowerCase()
  const palette = COLOR_BY_ID.get(value ?? '')
  return palette?.hex ?? COLOR_BY_ID.get(DEFAULT_ACCENT)!.hex
}

/** true = la valeur vient de la pipette et non de la palette. */
export const isCustomAccent = (value: string) => HEX.test(value) && !COLOR_BY_ID.has(value)

/**
 * Luminance perceptuelle, 0 (noir) a 1 (blanc). Les coefficients sont ceux de
 * la luma Rec. 601 : l'oeil voit le vert bien plus clair que le bleu, et une
 * moyenne des trois canaux ferait passer un bleu vif pour une couleur claire.
 */
export function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16)
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255
}

/** Au-dela, une couleur est trop claire pour porter une bande argent. */
const TROP_CLAIR = 0.62

export type AccessoryPalette = Record<AccessoryRole, string>

/** Reflet et ombre d'une teinte : la meme couleur, eclaircie puis assombrie. */
function relief(base: string, bande: string): AccessoryPalette {
  return {
    corps: base,
    clair: mixHex(base, BLANC, 0.26),
    sombre: mixHex(base, NOIR, 0.22),
    // Une bande claire sur une coque claire disparait : au-dela du seuil, elle
    // passe de l'autre cote. Sans ca, un accent creme donnait un gilet uni.
    bande: luminance(base) > TROP_CLAIR ? mixHex(base, NOIR, 0.5) : bande
  }
}

/**
 * Ton sur ton : la couleur du bot, DECALEE.
 *
 * Prise telle quelle, elle rendrait les objets invisibles — ils seraient
 * exactement de la teinte du corps sur lequel ils sont poses. Ils sont donc
 * pousses vers le clair sur un bot sombre et vers le sombre sur un bot clair,
 * ce qui garde un objet lisible sur les douze couleurs de la palette.
 */
function tonSurTon(ink: string): AccessoryPalette {
  const contraste = luminance(ink) < 0.5 ? BLANC : NOIR
  const corps = mixHex(ink, contraste, 0.34)
  return {
    corps,
    clair: mixHex(corps, BLANC, 0.2),
    sombre: mixHex(corps, NOIR, 0.16),
    bande: mixHex(corps, contraste, 0.42)
  }
}

export interface FinishContext {
  finish: string
  /** couleur d'accent, telle qu'elle est stockee (id de palette ou hex) */
  accent: string
  /** couleur du bot, en hex : c'est la source du ton sur ton */
  ink: string
}

/**
 * Les quatre teintes d'un objet pour la finition demandee.
 *
 * Resolue par OBJET et non une fois pour toutes : en chantier comme en fluo,
 * chacun porte sa propre teinte — un casque jaune sur un gilet orange.
 */
export function accessoryColors(acc: BotAccessory, ctx: FinishContext): AccessoryPalette {
  switch (FINISH_BY_ID.get(ctx.finish)?.id ?? DEFAULT_FINISH) {
    case 'fluo':
      return relief(acc.fluo, BLANC)
    case 'mono':
      return tonSurTon(ctx.ink)
    case 'accent':
      return relief(resolveAccent(ctx.accent), ARGENT)
    default:
      return relief(acc.livery, ARGENT)
  }
}
