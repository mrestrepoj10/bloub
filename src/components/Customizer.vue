<script setup lang="ts">
import { computed } from 'vue'
import { ACCESSORIES, toggleAccessory, type AccessoryId } from '@/bot/accessories'
import { EXPRESSIONS } from '@/bot/expressions'
import { FINISHES, FINISH_BY_ID, isCustomAccent, resolveAccent } from '@/bot/finishes'
import BotTile from '@/components/BotTile.vue'
import { COLORS, SHAPES } from '@/bot/skins'
import { t } from '@/i18n'

const shape = defineModel<string>('shape', { required: true })
const color = defineModel<string>('color', { required: true })
const expression = defineModel<string>('expression', { required: true })
const accessories = defineModel<string[]>('accessories', { required: true })
const finish = defineModel<string>('finish', { required: true })
const accent = defineModel<string>('accent', { required: true })

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
