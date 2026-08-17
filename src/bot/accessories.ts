import { REST_GAZE, headLean } from './face'
import { TAU, clamp } from './math'
import { bodyMetrics, toPoints, type BodyMetrics, type Point } from './shape'

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
 * Ce fichier ne peint rien : chaque partie declare le ROLE qu'elle joue dans
 * l'objet (la coque, son reflet, son ombre, une bande retroreflechissante) et
 * c'est la finition qui lui donne sa teinte (`finishes.ts`). Sans ce partage,
 * proposer un jeu de couleurs demandait de recopier la geometrie autant de fois
 * qu'il y a de finitions.
 *
 * Chaque objet garde quand meme SES teintes de reference, celles du vrai
 * materiel : `livery` (le jaune de securite, l'orange haute visibilite) et
 * `fluo`, sa version poussee au neon. Choisies et non mesurees, comme `--ink`.
 */

/** Enumeres pour que la couche i18n verifie leurs traductions a la compilation. */
export type AccessoryId = 'casque' | 'gilet'

/**
 * Un emplacement ne porte qu'un objet a la fois : deux casques n'ont pas de
 * sens, un casque et un gilet si.
 */
export type AccessorySlot = 'tete' | 'torse'

/**
 * A quoi sert une partie dans l'objet. C'est la finition qui traduit ces roles
 * en couleurs, donc un objet neuf n'a pas a savoir de quelles teintes il sera
 * peint — juste ou tombent ses lumieres.
 */
export type AccessoryRole = 'corps' | 'clair' | 'sombre' | 'bande'

export interface AccessoryPart {
  /** contour ferme, en unites de rayon de boule */
  pts: Point[]
  role: AccessoryRole
  /**
   * true = peint SUR le corps, donc taille par le masque de la silhouette. Le
   * masque etant celui qui perce les yeux, une partie decoupee ne peut pas non
   * plus les recouvrir : c'est ce qui autorise le gilet a deborder franchement
   * du contour sans avoir a suivre la forme choisie.
   */
  clipped?: boolean
}

/**
 * Ou en est la tete par rapport a sa POSE DE REPOS.
 *
 * Un objet porte n'est pas plante a une hauteur fixe : le corps est une tete,
 * et quand elle se leve ou se tourne, ce qu'elle porte suit. Le moteur mesure
 * donc le deplacement du sommet du crane (`headTop`, face.ts) et le passe ici.
 *
 * L'ecart est pris a la pose de repos et non a une tete droite : c'est ce qui
 * garde intact le calage fait sur cette pose — a l'arret, rien ne bouge — et ne
 * fait bouger les objets que quand le regard, lui, change vraiment.
 *
 * Amorti, pas applique tel quel : le pole de la tete se deplace de 0.9 rayon
 * entre deux poses extremes, et un casque qui suivrait au pied de la lettre
 * quitterait le crane. Chaque objet decide de sa part (`*_SUIVI`).
 */
export interface HeadTilt {
  /** deplacement du sommet du crane, en unites de rayon de boule */
  x: number
  y: number
  /**
   * Inclinaison ABSOLUE de l'axe de la tete a l'ecran, en degres. Pas un ecart :
   * ce qui se porte SUR la tete est perpendiculaire a son axe, quel qu'il soit —
   * au repos deja, ou la tete penche de -26deg. Un casque pose bien droit sur
   * une tete inclinee a l'air de flotter dessus, et c'est ce qui se voyait.
   */
  lean: number
  /**
   * Roulis, en degres, ECART a la pose de repos. Pour ce qui pend au corps
   * plutot que de se poser sur la tete : un vetement suit la pesanteur, il ne se
   * met pas de travers parce que la tete est tournee. Il ne bouge donc que
   * lorsqu'elle bouge.
   */
  roll: number
}

/** Tete droite, au repos : ce que voit un appel qui ne pilote pas la pose. */
export const NO_TILT: HeadTilt = { x: 0, y: 0, lean: 0, roll: 0 }

/**
 * La POSE DE REPOS, celle sur laquelle tout le placement est cale : la tete y
 * penche deja de -26deg a l'ecran. C'est aussi la seule pose qu'un export fixe
 * puisse contenir, donc celle qui sert a mesurer l'encombrement d'un objet.
 */
export const REST_TILT: HeadTilt = { x: 0, y: 0, lean: headLean(REST_GAZE), roll: 0 }

/* ------------------------------------------------------- reglages fins */

/**
 * Ce qu'on peut retoucher a la main sur un objet porte.
 *
 * Les valeurs mesurees restent le point de depart : un reglage est un ECART a
 * ce depart, jamais une valeur absolue. Un curseur laisse donc a zero (ou a un,
 * pour un facteur) rend exactement le dessin calibre, et le bouton « remettre a
 * zero » n'a rien a recalculer.
 *
 * Les identifiants sont enumeres pour que la couche i18n verifie leurs libelles
 * a la compilation, comme partout ailleurs.
 */
export type KnobId =
  | 'taille'
  | 'largeur'
  | 'hauteur'
  | 'visiere'
  | 'epaisseur'
  | 'nervure'
  | 'col'
  | 'bandes'
  | 'x'
  | 'y'
  | 'angle'

export interface AccessoryKnob {
  id: KnobId
  /** valeur au repos : 1 pour un facteur, 0 pour un decalage */
  base: number
  min: number
  max: number
  step: number
}

/** Reglages d'un objet, par identifiant de curseur. */
export type AccessoryTweaks = Partial<Record<KnobId, number>>
/** Reglages de tous les objets. */
export type TweakMap = Partial<Record<AccessoryId, AccessoryTweaks>>

/**
 * Valeur effective d'un curseur : celle reglee si elle tient dans les bornes,
 * la valeur de repos sinon. Le stockage n'est pas sur, et une valeur non finie
 * rendrait tout le contour `NaN` — donc invisible, sans rien pour le dire.
 */
export function knobValue(knob: AccessoryKnob, tweaks: AccessoryTweaks = {}): number {
  const v = tweaks[knob.id]
  return v === undefined || !Number.isFinite(v) ? knob.base : clamp(v, knob.min, knob.max)
}

/** Lecteur de curseurs pour un objet : `k('taille')` rend la valeur effective. */
function reglages(knobs: AccessoryKnob[], tweaks: AccessoryTweaks = {}) {
  return (id: KnobId) => {
    const knob = knobs.find((k) => k.id === id)
    return knob ? knobValue(knob, tweaks) : 0
  }
}

/**
 * Nettoie des reglages relus (stockage, prop) : objets et curseurs inconnus
 * retires, valeurs bornees, non finies jetees. Une entree vide disparait, ce qui
 * garde le stockage lisible.
 */
export function normalizeTweaks(brut: unknown): TweakMap {
  if (!brut || typeof brut !== 'object') return {}
  const out: TweakMap = {}
  for (const acc of ACCESSORIES) {
    const lu = (brut as Record<string, unknown>)[acc.id]
    if (!lu || typeof lu !== 'object') continue
    const garde: AccessoryTweaks = {}
    for (const knob of acc.knobs) {
      const v = (lu as Record<string, unknown>)[knob.id]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      const borne = clamp(v, knob.min, knob.max)
      if (borne !== knob.base) garde[knob.id] = borne
    }
    if (Object.keys(garde).length) out[acc.id] = garde
  }
  return out
}

/** Un objet est-il retouche ? Sert au bouton de remise a zero. */
export const isTweaked = (tweaks: AccessoryTweaks | undefined) =>
  !!tweaks && Object.keys(tweaks).length > 0

export interface BotAccessory {
  id: AccessoryId
  slot: AccessorySlot
  /** Teinte de reference, celle du vrai materiel. */
  livery: string
  /** La meme, poussee au neon, pour la finition fluo. */
  fluo: string
  /** Ce qui se regle a la main sur cet objet. */
  knobs: AccessoryKnob[]
  /** Contours de l'objet pour la silhouette, la pose de tete et les reglages. */
  parts(body: BodyMetrics, head: HeadTilt, tweaks?: AccessoryTweaks): AccessoryPart[]
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

/** Fait tourner des points de `deg` degres autour de (cx, cy). */
function pivot(pts: Point[], cx: number, cy: number, deg: number): Point[] {
  if (!deg) return pts
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return pts.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }
  })
}

/** Translate des points. */
const bouge = (pts: Point[], dx: number, dy: number): Point[] =>
  pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))

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
 * Largeur de la calotte, en fraction de la corde du crane a cette hauteur.
 *
 * TOUTE la corde, et c'est une correction : a 0.88, la calotte etait plus
 * etroite que le crane a l'endroit meme ou elle s'y pose, donc le sommet du
 * corps ressortait de chaque cote au-dessus de la visiere. Un casque enfonce
 * dans la tete, avec deux oreilles noires qui depassent. Un couvre-chef couvre.
 */
const CASQUE_LARGEUR = 1
/**
 * Hauteur de la calotte, en fraction de sa DEMI-largeur — donc une proportion
 * de casque et non de crane. Rapportee au crane, une forme pointue portait un
 * chapeau haut de forme pendant qu'une forme aplatie portait un couvercle.
 * 0.78 donne la coque un peu surbaissee d'un casque de chantier.
 */
const CASQUE_COQUE = 0.78
/**
 * Visiere : son debord lateral et sa demi-epaisseur, en fraction de la
 * DEMI-LARGEUR DE LA CALOTTE et non du crane.
 *
 * Rapportee au crane, elle gardait sa taille pendant que la calotte retrecissait
 * sur une forme pointue : le triangle et la goutte portaient un sombrero, large
 * rebord sous une toute petite coque. Rapportee a la calotte, le casque grandit
 * et retrecit d'un seul tenant.
 */
const CASQUE_DEBORD = 0.21
const CASQUE_EPAISSEUR = 0.12
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
const CASQUE_MAXI = 0.72
/** Largeur de la nervure, en fraction de la calotte. */
const CASQUE_NERVURE_L = 0.22
/**
 * Part du deplacement du crane que le casque suit, et part du roulis dont il
 * penche. Amorti : la tete se tourne de bien plus que ce qu'un casque bouge sur
 * elle, et au-dela le couvre-chef se met a glisser comme s'il etait trop grand.
 *
 * Ce n'est pas un simple decalage de dessin : l'assise est REMESUREE a sa
 * nouvelle hauteur, donc le casque se rechausse sur la corde du crane a cet
 * endroit-la. C'est ce qui le garde pose sur la tete au lieu de flotter
 * au-dessus des que le regard se leve.
 */
const CASQUE_SUIVI = 0.32
/**
 * Part de l'inclinaison de la tete que le casque prend, et il la prend AUTOUR
 * DU CENTRE DE LA BOULE.
 *
 * Autour de son assise, il basculerait sur place : un bord s'enfoncerait dans le
 * crane pendant que l'autre decollerait, et la tete ressortirait par le trou.
 * Autour du centre, il glisse sur la sphere en gardant son rayon — donc il reste
 * chausse — exactement comme un decor peint sur une boule qui tourne. Ca ne
 * change rien a sa portee non plus, une rotation autour du centre conservant les
 * distances.
 */
const CASQUE_ROULIS = 0.35
/**
 * Bornes de l'assise, en fraction du crane. Elles bornent du meme coup la
 * portee de l'objet (`reach`), donc le cadre d'export : sans elles, une pose
 * extreme sortirait le casque du cadre.
 */
const CASQUE_HAUT = 0.9
const CASQUE_BAS = 0.55
/** Debattement lateral maximal, en unites de rayon de boule. */
const CASQUE_ECART = 0.18

/**
 * Curseurs du casque : sa taille d'ensemble, la geometrie de chacune de ses
 * pieces, sa place et son inclinaison. Les bornes sont larges — c'est un
 * reglage de gout, pas une mesure — mais fermees des deux cotes : le cadre
 * d'export se calcule sur le dessin obtenu, il faut qu'il reste fini.
 */
const CASQUE_KNOBS: AccessoryKnob[] = [
  { id: 'taille', base: 1, min: 0.6, max: 1.5, step: 0.01 },
  { id: 'largeur', base: 1, min: 0.6, max: 1.4, step: 0.01 },
  { id: 'hauteur', base: 1, min: 0.5, max: 1.8, step: 0.01 },
  { id: 'visiere', base: 1, min: 0, max: 2.5, step: 0.01 },
  { id: 'epaisseur', base: 1, min: 0.2, max: 2.5, step: 0.01 },
  { id: 'nervure', base: 1, min: 0, max: 2.5, step: 0.01 },
  { id: 'x', base: 0, min: -0.4, max: 0.4, step: 0.005 },
  { id: 'y', base: 0, min: -0.4, max: 0.4, step: 0.005 },
  { id: 'angle', base: 0, min: -60, max: 60, step: 1 }
]

function casque(body: BodyMetrics, head: HeadTilt, tweaks?: AccessoryTweaks): AccessoryPart[] {
  const k = reglages(CASQUE_KNOBS, tweaks)
  // Hauteur du crane : tout le casque s'exprime en fraction de cette mesure,
  // donc il grandit avec la tete au lieu d'etre cale sur le cercle seul.
  const crane = -body.top
  // Le sommet du crane monte quand le regard se leve : l'assise le suit, bornee
  // pour ne pas sortir de la tete par le haut ni descendre sur les yeux.
  const assise = clamp(
    body.top * (1 - CASQUE_ASSISE) + head.y * CASQUE_SUIVI * crane,
    body.top * CASQUE_HAUT,
    body.top * CASQUE_BAS
  )
  const corde = body.chordAt(assise)
  // La calotte est calee sur la corde du crane, puis retouchee : la taille
  // d'ensemble et la largeur propre se multiplient, l'une emmenant tout l'objet
  // (les autres pieces se mesurent sur elle), l'autre la calotte seule.
  const demi =
    Math.min(
      Math.max(corde ? ((corde.x1 - corde.x0) / 2) * CASQUE_LARGEUR : 0, CASQUE_MINI * crane),
      ((body.right - body.left) / 2) * CASQUE_MAXI
    ) *
    k('taille') *
    k('largeur')
  // Et il glisse du cote ou la tete penche. L'ecart est borne : au-dela, le
  // casque depasserait du crane au lieu d'etre porte de travers.
  const ecart = clamp(head.x * CASQUE_SUIVI, -CASQUE_ECART, CASQUE_ECART) * crane
  const cx = (corde ? (corde.x0 + corde.x1) / 2 : 0) + ecart
  const hauteur = demi * CASQUE_COQUE * k('hauteur')
  /*
   * Deux rotations, et deux pivots differents : l'inclinaison AUTOMATIQUE suit
   * l'axe de la tete et tourne autour du centre de la boule, pour que le casque
   * glisse sur la sphere en restant chausse ; celle qu'on REGLE tourne autour de
   * son assise, parce qu'un curseur d'inclinaison doit faire basculer l'objet
   * sur place et non le promener autour du corps.
   *
   * Le decalage regle vient en dernier : c'est une translation franche du casque
   * fini, donc previsible — le curseur deplace ce qu'on voit, sans rechausser
   * l'objet ailleurs.
   */
  const pose = (pts: Point[]) =>
    bouge(
      pivot(pivot(pts, 0, 0, head.lean * CASQUE_ROULIS), cx, assise, k('angle')),
      k('x'),
      k('y')
    )

  // La calotte, sa nervure eclairee, et la visiere qui reste dans son ombre.
  return [
    { pts: pose(dome(cx, assise, demi, hauteur)), role: 'corps' },
    { pts: pose(dome(cx, assise, demi * CASQUE_NERVURE_L * k('nervure'), hauteur)), role: 'clair' },
    {
      pts: pose(
        ellipse(
          cx,
          assise,
          demi * (1 + CASQUE_DEBORD * k('visiere')),
          demi * CASQUE_EPAISSEUR * k('epaisseur')
        )
      ),
      role: 'sombre'
    }
  ]
}

/* ----------------------------------------------------------------- gilet */

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
/**
 * Le gilet suit la tete DANS LE MEME SENS qu'elle, et pas a l'envers.
 *
 * A l'envers etait pourtant le plus juste : peint sur la meme boule que le
 * casque, il devrait descendre quand le sommet monte, comme n'importe quel
 * decor d'une sphere qui tourne. Sauf que les etats qui baissent le regard
 * (« yeux ecarquilles », le clin d'oeil) le faisaient alors REMONTER jusqu'au
 * visage, et les yeux se retrouvaient poses au milieu de l'orange. Un vetement
 * qui monte sur la figure ne se lit plus comme un vetement.
 *
 * Il se comporte donc comme un habit pendu au corps plutot que comme un decal :
 * il accompagne le mouvement au lieu de le contrarier. Le gilet n'a de toute
 * facon aucun contour propre — le corps le decoupe — donc rien ne trahit
 * l'entorse a la sphere.
 */
const GILET_SUIVI = 0.18
const GILET_ROULIS = 0.4
/**
 * Debattement, en unites de rayon de boule. DISSYMETRIQUE, parce que la gene
 * l'est : vers le bas il n'y a rien a heurter, vers le haut il y a les yeux.
 */
const GILET_MONTEE = 0.06
const GILET_DESCENTE = 0.16

/**
 * Curseurs du gilet. Moins nombreux que ceux du casque, et c'est la forme de
 * l'objet qui le veut : decoupe par le corps, il n'a ni taille propre ni contour
 * a elargir — ce qui se regle, c'est la ou il tombe et ce qu'on y voit.
 */
const GILET_KNOBS: AccessoryKnob[] = [
  { id: 'col', base: 0, min: -0.25, max: 0.35, step: 0.005 },
  { id: 'bandes', base: 1, min: 0, max: 2.2, step: 0.01 },
  { id: 'x', base: 0, min: -0.4, max: 0.4, step: 0.005 },
  { id: 'y', base: 0, min: -0.3, max: 0.5, step: 0.005 },
  { id: 'angle', base: 0, min: -45, max: 45, step: 1 }
]

/** Un pan et ses bandes ; `cote` vaut -1 a gauche, +1 a droite. */
function pan(cote: number, bas: number, col: number, bandes: number): AccessoryPart[] {
  const x = (v: number) => cote * v
  /** Demi-largeur d'une bande, retouchee autour de son milieu. */
  const bande = (a: number, b: number): [number, number] => {
    const milieu = (a + b) / 2
    const demi = ((b - a) / 2) * bandes
    return [milieu - demi, milieu + demi]
  }
  const bretelle = bande(GILET_BRETELLE[0], GILET_BRETELLE[1])
  const ceintureHaut = GILET_CEINTURE[0] * bas
  const ceintureBas = GILET_CEINTURE[1] * bas
  return [
    {
      pts: [
        { x: x(GILET_DEHORS), y: GILET_EPAULE + col },
        { x: x(GILET_COL_X), y: GILET_COL + col },
        { x: x(GILET_OUVERTURE), y: GILET_V + col },
        { x: x(GILET_OUVERTURE), y: GILET_BAS },
        { x: x(GILET_DEHORS), y: GILET_BAS }
      ],
      role: 'corps',
      clipped: true
    },
    {
      pts: rect(x(bretelle[0]), GILET_BRETELLE_Y + col, x(bretelle[1]), ceintureBas),
      role: 'bande',
      clipped: true
    },
    {
      pts: rect(
        x(GILET_OUVERTURE),
        ceintureHaut - (ceintureBas - ceintureHaut) * (bandes - 1) * 0.5,
        x(GILET_DEHORS),
        ceintureBas + (ceintureBas - ceintureHaut) * (bandes - 1) * 0.5
      ),
      role: 'bande',
      clipped: true
    }
  ]
}

function gilet(body: BodyMetrics, head: HeadTilt, tweaks?: AccessoryTweaks): AccessoryPart[] {
  const k = reglages(GILET_KNOBS, tweaks)
  const col = k('col')
  const bandes = k('bandes')
  const dx = clamp(head.x * GILET_SUIVI, -GILET_DESCENTE, GILET_DESCENTE) + k('x')
  const dy = clamp(head.y * GILET_SUIVI, -GILET_MONTEE, GILET_DESCENTE) + k('y')
  const angle = head.roll * GILET_ROULIS + k('angle')
  return [...pan(-1, body.bottom, col, bandes), ...pan(1, body.bottom, col, bandes)].map(
    (part) => ({
      ...part,
      pts: pivot(bouge(part.pts, dx, dy), 0, 0, angle)
    })
  )
}

/* ------------------------------------------------------------- catalogue */

export const ACCESSORIES: BotAccessory[] = [
  // Jaune de securite, et sa version neon.
  //
  // 1.32 au repos : le pire cas est le squircle, dont le sommet plat porte la
  // calotte la plus large, donc la plus haute (1.30 avec la derive du regard).
  // Tete franchement penchee, il monte a 1.46 — hors cadre fixe, mais dans le
  // viewBox de l'ecran, et c'est celui-la qui sert des que le bot bouge.
  {
    id: 'casque',
    slot: 'tete',
    livery: '#f2b21a',
    fluo: '#e8ff1f',
    knobs: CASQUE_KNOBS,
    parts: casque
  },
  // Rien ne depasse : tout est decoupe par le corps.
  { id: 'gilet', slot: 'torse', livery: '#f4661d', fluo: '#ff6a12', knobs: GILET_KNOBS, parts: gilet }
]

// Map indexee par `string` : les appelants interrogent avec une valeur relue du
// localStorage ou d'une prop, donc non validee.
export const ACCESSORY_BY_ID = new Map<string, BotAccessory>(ACCESSORIES.map((a) => [a.id, a]))

/**
 * Encombrement d'un objet, en unites de rayon de boule : la distance maximale
 * au centre atteinte par ce qui n'est PAS decoupe par le corps.
 *
 * MESURE sur le dessin et non declaree dans le catalogue, et c'est ce qui la
 * rend juste : la taille du casque se regle a la main, donc aucune constante
 * ecrite d'avance ne peut la borner. Le cadre d'export s'y ajuste (`demiCadre`,
 * `src/ui/export.ts`) — sans elle, un casque agrandi se ferait rogner en
 * silence sur l'image livree.
 *
 * Prise DANS LA POSE DE REPOS, parce que c'est ce qu'un export fixe contient :
 * il rend `idle`, ou seule la derive du regard bouge encore (0.06 rayon, que la
 * marge du cadre absorbe). Une tete franchement penchee ne se voit qu'a l'ecran
 * ou dans l'export d'un CYCLE, et ces deux-la tournent sur le viewBox large.
 */
export function accessoryReach(
  acc: BotAccessory,
  radii: number[],
  tweaks?: AccessoryTweaks,
  head: HeadTilt = REST_TILT
): number {
  const body = bodyMetrics(toPoints({ radii, rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 }, 1))
  let max = 0
  for (const part of acc.parts(body, head, tweaks)) {
    if (part.clipped) continue
    for (const p of part.pts) max = Math.max(max, Math.hypot(p.x, p.y))
  }
  return max
}

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
