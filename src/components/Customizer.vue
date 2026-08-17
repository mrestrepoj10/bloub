<script setup lang="ts">
import { computed } from 'vue'
import {
  ACCESSORIES,
  isTweaked,
  knobValue,
  toggleAccessory,
  type AccessoryId,
  type AccessoryKnob,
  type TweakMap
} from '@/bot/accessories'
import { EXPRESSIONS } from '@/bot/expressions'
import { FINISHES, FINISH_BY_ID, isCustomAccent, resolveAccent } from '@/bot/finishes'
import BotTile from '@/components/BotTile.vue'
import { COLORS, SHAPES } from '@/bot/skins'
import { nombre, t } from '@/i18n'

const shape = defineModel<string>('shape', { required: true })
const color = defineModel<string>('color', { required: true })
const expression = defineModel<string>('expression', { required: true })
const accessories = defineModel<string[]>('accessories', { required: true })
const finish = defineModel<string>('finish', { required: true })
const accent = defineModel<string>('accent', { required: true })
const tweaks = defineModel<TweakMap>('tweaks', { required: true })

/**
 * Les vignettes sont figees a la meme date que la pose de repos : elles montrent
 * la forme et le visage tels qu'ils apparaitront, pas un aplat abstrait.
 */
const PREVIEW_AT = 1

/**
 * La grille des objets est la seule a BASCULER : on n'en porte pas forcement, et
 * on en porte parfois deux. Recliquer sur une vignette retenue retire donc
 * l'objet, la ou une forme ou une couleur ne peut que se remplacer.
 *
 * La vignette montre le bot avec CE seul objet, sans les autres : c'est ce que
 * le clic pose, pas l'etat ou il mene.
 */
function basculer(id: AccessoryId) {
  accessories.value = toggleAccessory(accessories.value, id)
}

/**
 * Finition et couleur d'accent sont des reglages DE L'OBJET : sans objet porte,
 * elles n'ont rien a peindre — la vignette d'une finition montrerait une boule
 * nue, identique dans les quatre cases. Elles paraissent donc avec le premier
 * objet plutot que de rester la, inertes, a faire deviner ce qui les commande.
 *
 * Meme regle d'un cran plus loin pour le nuancier : seule la finition « accent »
 * tire sa teinte d'un choix (`tinted`), les trois autres la tiennent de l'objet
 * ou du bot. L'afficher partout donnerait une commande sans effet trois fois sur
 * quatre.
 */
const equipe = computed(() => accessories.value.length > 0)
const teinte = computed(() => equipe.value && FINISH_BY_ID.get(finish.value)?.tinted === true)

/** La pipette renvoie toujours un `#rrggbb` ; le nuancier, un id de palette. */
function pipette(event: Event) {
  accent.value = (event.target as HTMLInputElement).value
}

/* --------------------------------------------------------- reglages fins */

/**
 * Les objets portes, dans l'ordre du catalogue : chacun amene ses propres
 * curseurs, donc la liste des reglages suit ce qu'on porte au lieu d'etre ecrite
 * une fois pour toutes.
 */
const portes = computed(() => ACCESSORIES.filter((a) => accessories.value.includes(a.id)))

const valeur = (acc: AccessoryId, knob: AccessoryKnob) => knobValue(knob, tweaks.value[acc])

/**
 * Une valeur egale au repos est RETIREE plutot qu'ecrite : le stockage ne garde
 * que ce qui a vraiment ete retouche, et `isTweaked` sait alors si le bouton de
 * remise a zero a quelque chose a faire.
 *
 * L'objet est remplace au lieu d'etre modifie sur place — c'est ce qui reveille
 * le `v-model` du parent, qui l'ecrit ensuite dans le stockage.
 */
function regle(acc: AccessoryId, knob: AccessoryKnob, event: Event) {
  const v = Number((event.target as HTMLInputElement).value)
  const objet: Record<string, number> = { ...tweaks.value[acc] }
  if (v === knob.base) delete objet[knob.id]
  else objet[knob.id] = v
  const suite: TweakMap = { ...tweaks.value }
  if (Object.keys(objet).length) suite[acc] = objet
  else delete suite[acc]
  tweaks.value = suite
}

function remetAZero(acc: AccessoryId) {
  const suite = { ...tweaks.value }
  delete suite[acc]
  tweaks.value = suite
}

const retouche = (acc: AccessoryId) => isTweaked(tweaks.value[acc])

/**
 * Un facteur s'affiche en multiple (`1,15`), un decalage tel quel avec son
 * signe : ce sont deux grandeurs differentes, et les confondre ferait lire
 * « 0,10 » comme un dixieme de la taille normale.
 */
function affiche(knob: AccessoryKnob, v: number) {
  return knob.base === 1 ? nombre(v, 2) : `${v > 0 ? '+' : ''}${nombre(v, knob.step < 1 ? 2 : 0)}`
}
</script>

<template>
  <div>
    <h2 class="text-sm font-semibold">{{ t('panel.shape') }}</h2>
    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <BotTile
        v-for="s in SHAPES"
        :key="s.id"
        :label="t(`shapes.${s.id}`)"
        :selected="s.id === shape"
        :shape="s.id"
        :color="color"
        :expression="expression"
        :accessories="accessories"
        :finish="finish"
        :accent="accent"
        :tweaks="tweaks"
        :frozen-at="PREVIEW_AT"
        @click="shape = s.id"
      />
    </div>

    <h2 class="mt-5 text-sm font-semibold">{{ t('panel.expression') }}</h2>
    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <BotTile
        v-for="e in EXPRESSIONS"
        :key="e.id"
        :label="t(`expressions.${e.id}`)"
        :selected="e.id === expression"
        :shape="shape"
        :color="color"
        :expression="e.id"
        :accessories="accessories"
        :finish="finish"
        :accent="accent"
        :tweaks="tweaks"
        :frozen-at="PREVIEW_AT"
        @click="expression = e.id"
      />
    </div>

    <h2 class="mt-5 text-sm font-semibold">{{ t('panel.accessories') }}</h2>
    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <BotTile
        v-for="a in ACCESSORIES"
        :key="a.id"
        :label="t(`accessories.${a.id}`)"
        :selected="accessories.includes(a.id)"
        :shape="shape"
        :color="color"
        :expression="expression"
        :accessories="[a.id]"
        :finish="finish"
        :accent="accent"
        :tweaks="tweaks"
        :frozen-at="PREVIEW_AT"
        @click="basculer(a.id)"
      />
    </div>

    <template v-if="equipe">
      <h2 class="mt-5 text-sm font-semibold">{{ t('panel.finish') }}</h2>
      <div class="mt-2 grid grid-cols-4 gap-1.5">
        <BotTile
          v-for="f in FINISHES"
          :key="f.id"
          :label="t(`finishes.${f.id}`)"
          :selected="f.id === finish"
          :shape="shape"
          :color="color"
          :expression="expression"
          :accessories="accessories"
          :finish="f.id"
          :accent="accent"
          :tweaks="tweaks"
          :frozen-at="PREVIEW_AT"
          @click="finish = f.id"
        />
      </div>
    </template>

    <template v-if="teinte">
      <h2 class="mt-5 text-sm font-semibold">{{ t('panel.accent') }}</h2>
      <div class="mt-2 grid grid-cols-6 gap-1.5">
        <button
          v-for="c in COLORS"
          :key="c.id"
          type="button"
          class="flex aspect-square cursor-pointer items-center justify-center rounded-full border-2 transition"
          :class="
            c.id === accent ? 'border-[var(--ink)]' : 'border-transparent hover:border-[var(--line)]'
          "
          :aria-label="t(`colors.${c.id}`)"
          :aria-pressed="c.id === accent"
          @click="accent = c.id"
        >
          <span
            class="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
            :style="{ background: c.hex }"
          />
        </button>

        <!--
          Pipette : un `input type="color"` natif, deguise en pastille. Natif et
          non un selecteur maison — c'est ce qui donne la roue du systeme, au
          clavier comme au doigt, sans une ligne de dependance de plus.

          L'input est DANS le label et non a cote : toute la pastille devient
          cliquable sans avoir a lui inventer un `id` unique. Il est transparent
          plutot que masque, parce qu'un `display:none` empeche le navigateur
          d'ancrer sa roue au bon endroit.
        -->
        <label
          class="relative flex aspect-square cursor-pointer items-center justify-center rounded-full border-2 transition"
          :class="
            isCustomAccent(accent)
              ? 'border-[var(--ink)]'
              : 'border-transparent hover:border-[var(--line)]'
          "
          :title="t('panel.custom')"
        >
          <!-- la pastille montre la teinte libre choisie, ou la roue tant qu'il
               n'y en a pas -->
          <span
            class="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
            :style="{
              background: isCustomAccent(accent)
                ? resolveAccent(accent)
                : 'conic-gradient(#e8483f,#f0b429,#3ecf8e,#3b93f0,#8b5cf6,#e152b0,#e8483f)'
            }"
          />
          <input
            type="color"
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            :value="resolveAccent(accent)"
            :aria-label="t('panel.custom')"
            @input="pipette"
          />
        </label>
      </div>
    </template>

    <!--
      Reglages fins, un bloc par objet porte. Ils viennent APRES la finition :
      on choisit d'abord quoi porter et de quelle couleur, on ajuste ensuite.
      Chaque curseur est un `<input type="range">` natif, comme la loupe de la
      piste — il apporte le clavier, le pas et l'annonce vocale, et seule son
      apparence est reprise.
    -->
    <template v-for="acc in portes" :key="`reglages-${acc.id}`">
      <div class="mt-5 flex items-baseline justify-between gap-2">
        <h2 class="text-sm font-semibold">
          {{ t('panel.tweaks', { objet: t(`accessories.${acc.id}`) }) }}
        </h2>
        <!-- rien a defaire tant que rien n'a bouge : le bouton parait avec la
             premiere retouche plutot que de rester la, inerte -->
        <button
          v-if="retouche(acc.id)"
          type="button"
          class="cursor-pointer text-xs text-[var(--muted)] underline underline-offset-2 transition hover:text-[var(--ink)]"
          @click="remetAZero(acc.id)"
        >
          {{ t('panel.reset') }}
        </button>
      </div>

      <div class="mt-2 flex flex-col gap-1.5">
        <label
          v-for="knob in acc.knobs"
          :key="knob.id"
          class="flex items-center gap-2 text-xs text-[var(--muted)]"
        >
          <span class="w-20 shrink-0 truncate">{{ t(`knobs.${knob.id}`) }}</span>
          <input
            type="range"
            class="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--ink)]"
            :min="knob.min"
            :max="knob.max"
            :step="knob.step"
            :value="valeur(acc.id, knob)"
            :aria-label="`${t(`accessories.${acc.id}`)} — ${t(`knobs.${knob.id}`)}`"
            :aria-valuetext="affiche(knob, valeur(acc.id, knob))"
            @input="regle(acc.id, knob, $event)"
          />
          <!-- largeur fixe et chiffres tabulaires : la barre ne doit pas bouger
               pendant qu'on la tire -->
          <span class="w-9 shrink-0 text-right tabular-nums">
            {{ affiche(knob, valeur(acc.id, knob)) }}
          </span>
        </label>
      </div>
    </template>

    <h2 class="mt-5 text-sm font-semibold">{{ t('panel.color') }}</h2>
    <div class="mt-2 grid grid-cols-6 gap-1.5">
      <button
        v-for="c in COLORS"
        :key="c.id"
        type="button"
        class="flex aspect-square cursor-pointer items-center justify-center rounded-full border-2 transition"
        :class="
          c.id === color ? 'border-[var(--ink)]' : 'border-transparent hover:border-[var(--line)]'
        "
        :aria-label="t(`colors.${c.id}`)"
        :aria-pressed="c.id === color"
        @click="color = c.id"
      >
        <!-- liseré interne : sinon la pastille creme disparait sur fond clair -->
        <span
          class="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
          :style="{ background: c.hex }"
        />
      </button>
    </div>
  </div>
</template>
