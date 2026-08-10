// @vitest-environment jsdom
import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { RegisterSWOptions } from 'virtual:pwa-register/react'
import UpdatePrompt from './UpdatePrompt'
import { UPDATE_MESSAGE } from './UpdateBanner'
import LiveRegions from '../LiveRegions'
import { AnnouncerProvider } from '../../context/AnnouncerProvider'

/**
 * Double de test de `useRegisterSW`, à l'image du `fetchImpl` que
 * `createMistralJudge` reçoit dans `src/llm/mistral.ts` : `UpdatePrompt` ne
 * voit jamais la différence entre ce hook et le vrai, seul son type compte.
 *
 * `update` reste un espion accessible après le montage, et
 * `declencherNeedRefresh` simule la détection d'une nouvelle version — un
 * évènement que le vrai hook déclenche depuis l'intérieur du service worker,
 * hors de portée d'un test sans navigateur réel.
 *
 * `update` est renvoyé à part de `registration`, jamais lu via
 * `registration.update` : accéder à une méthode d'une interface DOM sans
 * l'appeler expose à `typescript/unbound-method` (perte de `this` en
 * théorie), même quand ce `this` n'existe pas ici.
 */
function creerRegisterSWDeTest(
  options: {
    readonly enregistrer?: boolean
    /**
     * Implémentation brute de `update()`, hors `vi.fn()` : un mock Vitest
     * observe lui-même la promesse qu'il renvoie pour tenir `mock.results`,
     * ce qui la rend « gérée » aux yeux de Node — un rejet non rattrapé par
     * `UpdatePrompt` deviendrait alors invisible. Le test qui vérifie
     * l'absence de gestionnaire fournit sa propre implémentation, sans
     * `vi.fn()`, pour que seul le `.catch` de production compte.
     */
    readonly updateImpl?: () => Promise<void>
  } = {},
) {
  const enregistrer = options.enregistrer ?? true
  const update = options.updateImpl ?? vi.fn(async () => {})
  const registration = { update } as unknown as ServiceWorkerRegistration
  const updateServiceWorker = vi.fn(async () => {})
  let declencher: (() => void) | undefined

  function useRegisterSWDeTest(swOptions?: RegisterSWOptions) {
    const [needRefresh, setNeedRefresh] = useState(false)
    // Latest ref : `swOptions` change de référence à chaque rendu
    // d'`UpdatePrompt`, qui ne le mémoïse pas plus que le vrai hook ne
    // l'exige. L'effet ne s'exécute qu'au montage, comme le ferait un vrai
    // enregistrement de service worker.
    const swOptionsRef = useRef(swOptions)
    swOptionsRef.current = swOptions

    useEffect(() => {
      declencher = () => setNeedRefresh(true)
      if (enregistrer) swOptionsRef.current?.onRegisteredSW?.('sw.js', registration)
      return () => {
        declencher = undefined
      }
    }, [])

    return {
      needRefresh: [needRefresh, setNeedRefresh] as [boolean, typeof setNeedRefresh],
      offlineReady: [false, () => {}] as [boolean, () => void],
      updateServiceWorker,
    }
  }

  return {
    hook: useRegisterSWDeTest,
    registration,
    update,
    updateServiceWorker,
    declencherNeedRefresh() {
      declencher?.()
    },
  }
}

function monterAvecLesRegions(
  useRegisterSW: NonNullable<ComponentProps<typeof UpdatePrompt>>['useRegisterSW'],
) {
  return render(
    <AnnouncerProvider>
      <LiveRegions />
      <UpdatePrompt useRegisterSW={useRegisterSW} />
    </AnnouncerProvider>,
  )
}

function definirVisibilite(etat: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: etat, configurable: true })
}

/**
 * `tsconfig.app.json` ne charge pas les types Node (seul `tsconfig.node.json`
 * le fait, pour la config Vite) : `process` y est un global sans type.
 * `globalThis.process` existe bel et bien à l'exécution — ces tests tournent
 * dans le vrai processus Node derrière jsdom — une interface minimale, plutôt
 * qu'une dépendance de types pour un seul test, suffit à le typer.
 */
interface EmetteurDeRejetsNonGeres {
  on: (evenement: 'unhandledRejection', ecouteur: (raison: unknown) => void) => void
  off: (evenement: 'unhandledRejection', ecouteur: (raison: unknown) => void) => void
}

function processusNode(): EmetteurDeRejetsNonGeres {
  return (globalThis as unknown as { process: EmetteurDeRejetsNonGeres }).process
}

describe('UpdatePrompt', () => {
  it('annonce la mise à jour dans la région de statut quand needRefresh passe à vrai', () => {
    const fake = creerRegisterSWDeTest()
    monterAvecLesRegions(fake.hook)

    // Avant tout déclenchement, la région de statut ne porte aucun message :
    // sans ça, une annonce systématique au montage passerait ce test alors
    // qu'elle spammerait le lecteur d'écran dès l'ouverture de l'application.
    expect(screen.getByRole('status')).toHaveTextContent('')

    act(() => {
      fake.declencherNeedRefresh()
    })

    expect(screen.getByRole('status')).toHaveTextContent(UPDATE_MESSAGE)
  })

  it('rappelle update() sur le registre au retour au premier plan, jamais quand l’onglet se cache', () => {
    const fake = creerRegisterSWDeTest()
    monterAvecLesRegions(fake.hook)

    definirVisibilite('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fake.update).not.toHaveBeenCalled()

    definirVisibilite('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fake.update).toHaveBeenCalledTimes(1)
  })

  it('ne plante pas quand le registre du service worker n’a jamais été fourni', () => {
    // `enregistrer: false` : `onRegisteredSW` n'est jamais appelé, exactement
    // le cas où l'enregistrement du service worker est encore en cours.
    const fake = creerRegisterSWDeTest({ enregistrer: false })
    monterAvecLesRegions(fake.hook)

    // Un `TypeError` non rattrapé dans un gestionnaire d'évènement se
    // rapporte comme une erreur globale, au même titre qu'une exception non
    // capturée dans un script — c'est ce canal qui révèle la régression si la
    // garde `registration === undefined` disparaît.
    const surErreur = vi.fn()
    window.addEventListener('error', surErreur)

    definirVisibilite('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    window.removeEventListener('error', surErreur)
    expect(surErreur).not.toHaveBeenCalled()
  })

  it('avale silencieusement l’échec de update() hors ligne, sans le journaliser', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let appels = 0
    // Le rejet simule une tentative de mise à jour hors ligne.
    const fake = creerRegisterSWDeTest({
      updateImpl: () => {
        appels += 1
        return Promise.reject(new Error('hors ligne'))
      },
    })
    monterAvecLesRegions(fake.hook)

    // Les tests tournent dans le vrai processus Node derrière jsdom : c'est
    // `process` qui rapporte une promesse rejetée sans gestionnaire, pas
    // `window` (jsdom ne câble pas cet évènement navigateur tout seul).
    // Ce canal, et pas une assertion sur la valeur de retour, révèle un
    // `.catch` disparu de `UpdatePrompt` — le test ne consomme jamais
    // lui-même la promesse renvoyée par `update()`.
    const surRejetNonGere = vi.fn()
    processusNode().on('unhandledRejection', surRejetNonGere)

    definirVisibilite('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(appels).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    processusNode().off('unhandledRejection', surRejetNonGere)
    expect(surRejetNonGere).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })
})
