/**
 * Cles de `localStorage`, en un seul endroit.
 *
 * Le prefixe porte le nom du produit : c'est une constante partagee et pas une
 * chaine recopiee a chaque appel, sinon le prochain renommage en oubliera une et
 * l'utilisateur perdra ses reglages sans que rien ne le signale.
 *
 * Aucune migration depuis l'ancien prefixe : le renommage a ete fait avant toute
 * mise en ligne, il n'y a pas d'installation a rattraper.
 */
const PREFIXE = 'bloub:'

/** Tout ce que l'application persiste. */
const NOMS = ['cycles', 'cycle', 'forme', 'couleur', 'expression', 'accessoires', 'langue'] as const

export type NomStocke = (typeof NOMS)[number]

/** `cle('cycles')` -> `'bloub:cycles'`. */
export function cle(nom: NomStocke): string {
  return `${PREFIXE}${nom}`
}
