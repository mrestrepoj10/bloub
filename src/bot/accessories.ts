import { TAU } from './math'
import type { BodyMetrics, Point } from './shape'

/**
 * Objets portes par le bot : casque de chantier, gilet de securite.
 *
 * Troisieme source de formes, et elle ne se melange ni aux silhouettes
 * d'animation (`profiles.ts`, relevees sur la video) ni aux formes du
 * personnalisateur (`skins.ts`) : ce ne sont pas des corps, ce sont des objets
 * POSES sur un corps quelconque. D'ou le contrat ci-dessous — un accessoire ne
 * connait pas la forme choisie, il recoit les mesures de la silhouette a
 * l'instant t (`BodyMetrics`) et s'y adapte. C'est ce qui lui evite de flotter
 * au-dessus d'un hexagone ou de rentrer dans une goutte.
 *
 * Comme les etats declarent des `ArcSpec` sans jamais les tracer, les parties
 * sont declarees en unites de rayon de boule : seul le moteur connait l'echelle
 * du viewBox, donc c'est lui qui rasterise.
 *
 * Leurs couleurs sont CHOISIES et non mesurees, comme `--ink` : un gilet de
 * chantier est orange haute visibilite parce que c'est ce qui le rend
 * reconnaissable, et il le reste quelle que soit la couleur du bot.
 */

/** Enumeres pour que la couche i18n verifie leurs traductions a la compilation. */
export type AccessoryId = 'casque' | 'gilet'

/**
 * Un emplacement ne porte qu'un objet a la fois : deux casques n'ont pas de
 * sens, un casque et un gilet si.
 */
export type AccessorySlot = 'tete' | 'torse'

export interface AccessoryPart {
  /** contour ferme, en unites de rayon de boule */
  pts: Point[]
  fill: string
  /**
   * true = peint SUR le corps, donc taille par le masque de la silhouette. Le
   * masque etant celui qui perce les yeux, une partie decoupee ne peut pas non
   * plus les recouvrir : c'est ce qui autorise le gilet a deborder franchement
   * du contour sans avoir a suivre la forme choisie.
   */
  clipped?: boolean
}

export interface BotAccessory {
  id: AccessoryId
  slot: AccessorySlot
  /**
   * Distance maximale au centre atteinte par les parties NON decoupees, en
   * unites de rayon de boule. Le cadre d'export s'y ajuste (`demiCadre`,
   * `src/ui/export.ts`) : sans elle, un casque qui depasse de la boule se
   * ferait rogner en silence sur l'image exportee. Verifiee sur toutes les
   * formes du personnalisateur par `accessories.test.ts`.
   */
  reach: number
  /** Contours de l'objet pour la silhouette mesuree a cet instant. */
  parts(body: BodyMetrics): AccessoryPart[]
}

/* ------------------------------------------------------------- primitives */

/** Ellipse fermee, en sens horaire. */
function ellipse(cx: number, cy: number, rx: number, ry: number, steps = 36): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * TAU
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }
  })
}

/**
 * Demi-ellipse superieure fermee par sa base : la calotte du casque. Le
 * segment du bas reste droit, c'est lui qui s'appuie sur le crane.
 */
function dome(cx: number, cy: number, rx: number, ry: number, steps = 28): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = Math.PI + (i / steps) * Math.PI
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }
  })
}

/** Rectangle, dans l'ordre horaire. */
function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ]
}

/* ---------------------------------------------------------------- casque */

/** Jaune de securite, sa nervure eclairee et la visiere dans son ombre. */
const CASQUE = '#f2b21a'
const CASQUE_NERVURE = '#ffd45e'
const CASQUE_VISIERE = '#d18f0f'

/**
 * Hauteurs exprimees en FRACTION du crane et non en valeur absolue : la capsule
 * culmine a 0.62 rayon la ou le triangle monte a 1.12, et un casque pose « 0.22
 * sous le sommet » tomberait sur les yeux de l'une pendant qu'il flotterait
 * au-dessus de l'autre.
 *
 * 0.22 est ce qui laisse la visiere juste au-dessus des yeux au repos : ils
 * culminent a 0.69 rayon (pose mesuree, `REST_GAZE`), le bas de la visiere se
 * pose a 0.695. Un casque se porte au ras des sourcils.
 */
const CASQUE_ASSISE = 0.22
/**
 * Largeur de la calotte, en fraction de la corde du crane a cette hauteur. Un
 * peu moins que la corde : posee pile dessus, elle donnait un couvercle plat.
 */
const CASQUE_LARGEUR = 0.88
/**
 * Hauteur de la calotte, en fraction de sa DEMI-largeur — donc une proportion
 * de casque et non de crane. Rapportee au crane, une forme pointue portait un
 * chapeau haut de forme pendant qu'une forme aplatie portait un couvercle.
 * 0.85 est ce qui donne la coque quasi hemispherique d'un casque de chantier.
 */
const CASQUE_COQUE = 0.85
/** Debord lateral de la visiere, en fraction du crane. */
const CASQUE_DEBORD = 0.13
/** Demi-epaisseur de la visiere, en fraction du crane. */
const CASQUE_EPAISSEUR = 0.075
/**
 * Demi-largeur minimale de la calotte, en fraction du crane : sur une forme
 * pointue (le triangle, la goutte) la corde est presque nulle, et le casque se
 * reduirait a un trait.
 */
const CASQUE_MINI = 0.34
/**
 * Demi-largeur maximale, en fraction de la demi-largeur du CORPS. Une forme a
 * sommet plat (le squircle, l'hexagone) a une corde presque aussi large que
 * tout le corps a la hauteur de l'assise : sans plafond, le casque y devenait
 * une coque geante qui recouvrait la boule entiere.
 */
const CASQUE_MAXI = 0.62
/** Largeur de la nervure, en fraction de la calotte. */
const CASQUE_NERVURE_L = 0.22

function casque(body: BodyMetrics): AccessoryPart[] {
  // Hauteur du crane : tout le casque s'exprime en fraction de cette mesure,
  // donc il grandit avec la tete au lieu d'etre cale sur le cercle seul.
  const crane = -body.top
  const assise = body.top * (1 - CASQUE_ASSISE)
  const corde = body.chordAt(assise)
  const demi = Math.min(
    Math.max(corde ? ((corde.x1 - corde.x0) / 2) * CASQUE_LARGEUR : 0, CASQUE_MINI * crane),
    ((body.right - body.left) / 2) * CASQUE_MAXI
  )
  const cx = corde ? (corde.x0 + corde.x1) / 2 : 0
  const hauteur = demi * CASQUE_COQUE

  return [
    { pts: dome(cx, assise, demi, hauteur), fill: CASQUE },
    { pts: dome(cx, assise, demi * CASQUE_NERVURE_L, hauteur), fill: CASQUE_NERVURE },
    {
      pts: ellipse(cx, assise, demi + CASQUE_DEBORD * crane, CASQUE_EPAISSEUR * crane),
      fill: CASQUE_VISIERE
    }
  ]
}

/* ----------------------------------------------------------------- gilet */

/**
 * Orange haute visibilite et bandes retroreflechissantes.
 *
 * Les bandes sont un gris argent et non un blanc : la ou elles touchent le bord
 * du corps, un blanc se confondait avec le fond d'une image exportee — la boule
 * paraissait ouverte par le bas.
 */
const GILET = '#f4661d'
const GILET_BANDE = '#d9e1e8'

/**
 * Le gilet est entierement DECOUPE par le corps : ses contours debordent donc
 * volontairement (`GILET_DEHORS`), et c'est le masque de la silhouette qui lui
 * donne sa forme. Aucun rattrapage a faire par forme, et le vetement epouse
 * aussi bien la capsule que le nuage.
 *
 * Ses hauteurs HAUTES sont absolues : elles sont calees sur les YEUX, qui vivent
 * sur la sphere et pas sur le contour (la ceinture, elle, suit le bas du corps,
 * voir `GILET_CEINTURE`). Au repos l'oeil exterieur descend
 * a 0.34 rayon ; le col du gilet part a 0.10 au-dessus du centre, donc bien en
 * dessous. Le masque interdit de toute facon au vetement de couvrir un oeil,
 * mais un col qui vient le lecher se verrait quand meme. Sur une forme aplatie
 * (la capsule) les yeux redescendent vers le col — ils sont recales au rayon
 * reel du profil — et le col passe alors tout pres d'eux ; c'est la limite
 * assumee, et un test verifie qu'il reste sous le regard sur les huit formes.
 */
const GILET_DEHORS = 1.5
const GILET_BAS = 1.6
/**
 * Demi-ouverture centrale : la fermeture, qui laisse voir le corps. Etroite —
 * large, elle ouvrait un coin de corps du col jusqu'au bas de la boule, et le
 * vetement se lisait comme deux pans separes plutot que comme un gilet.
 */
const GILET_OUVERTURE = 0.07
/** Hauteur de l'epaule au bord exterieur, puis a la naissance du col. */
const GILET_EPAULE = 0.02
const GILET_COL = -0.1
const GILET_COL_X = 0.62
/** Pointe du V, ou les deux pans se rejoignent. */
const GILET_V = 0.34
/** Bande verticale (bretelle) : ses x, et le haut de son parcours. */
const GILET_BRETELLE = [0.7, 0.86] as const
const GILET_BRETELLE_Y = -0.05
/**
 * Bande horizontale (ceinture), en fraction du BAS du corps et non en valeur
 * absolue : posee a une hauteur fixe, elle tombait pile sur le bord inferieur
 * des formes courtes (le triangle s'arrete a 0.73) et n'y laissait qu'un cheveu
 * d'orange en dessous, qu'on lit comme un trait parasite.
 */
const GILET_CEINTURE = [0.62, 0.76] as const

/** Un pan et ses bandes ; `cote` vaut -1 a gauche, +1 a droite. */
function pan(cote: number, bas: number): AccessoryPart[] {
  const x = (v: number) => cote * v
  const ceintureHaut = GILET_CEINTURE[0] * bas
  const ceintureBas = GILET_CEINTURE[1] * bas
  return [
    {
      pts: [
        { x: x(GILET_DEHORS), y: GILET_EPAULE },
        { x: x(GILET_COL_X), y: GILET_COL },
        { x: x(GILET_OUVERTURE), y: GILET_V },
        { x: x(GILET_OUVERTURE), y: GILET_BAS },
        { x: x(GILET_DEHORS), y: GILET_BAS }
      ],
      fill: GILET,
      clipped: true
    },
    {
      pts: rect(x(GILET_BRETELLE[0]), GILET_BRETELLE_Y, x(GILET_BRETELLE[1]), ceintureBas),
      fill: GILET_BANDE,
      clipped: true
    },
    {
      pts: rect(x(GILET_OUVERTURE), ceintureHaut, x(GILET_DEHORS), ceintureBas),
      fill: GILET_BANDE,
      clipped: true
    }
  ]
}

function gilet(body: BodyMetrics): AccessoryPart[] {
  return [...pan(-1, body.bottom), ...pan(1, body.bottom)]
}

/* ------------------------------------------------------------- catalogue */

export const ACCESSORIES: BotAccessory[] = [
  // 1.30 : le pire cas est le squircle, dont le sommet plat porte la calotte la
  // plus large, donc la plus haute (1.25). Verifie sur les huit formes par un
  // test — c'est cette valeur qui elargit le cadre d'export.
  { id: 'casque', slot: 'tete', reach: 1.3, parts: casque },
  // Rien ne depasse : tout est decoupe par le corps.
  { id: 'gilet', slot: 'torse', reach: 0, parts: gilet }
]

// Map indexee par `string` : les appelants interrogent avec une valeur relue du
// localStorage ou d'une prop, donc non validee.
export const ACCESSORY_BY_ID = new Map<string, BotAccessory>(ACCESSORIES.map((a) => [a.id, a]))

/**
 * Nettoie une liste d'ids : inconnus retires, doublons ecartes, un seul objet
 * par emplacement. Sert au chargement (le stockage n'est pas sur) comme a
 * l'ecriture.
 */
export function normalizeAccessories(ids: readonly string[]): AccessoryId[] {
  const out: AccessoryId[] = []
  const slots = new Set<AccessorySlot>()
  for (const id of ids) {
    const acc = ACCESSORY_BY_ID.get(id)
    if (!acc || slots.has(acc.slot)) continue
    slots.add(acc.slot)
    out.push(acc.id)
  }
  return out
}

/**
 * Met ou retire un objet. Une vignette deja retenue se declique donc, et poser
 * un casque retire celui qu'on portait — l'emplacement tranche a notre place.
 */
export function toggleAccessory(ids: readonly string[], id: AccessoryId): AccessoryId[] {
  const porte = ids.includes(id)
  const slot = ACCESSORY_BY_ID.get(id)!.slot
  const restant = normalizeAccessories(ids).filter(
    (autre) => ACCESSORY_BY_ID.get(autre)!.slot !== slot
  )
  return porte ? restant : normalizeAccessories([...restant, id])
}
