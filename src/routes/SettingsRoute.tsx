import { useEffect, useId, useRef, useState } from 'react'
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD, FIELD, INPUT } from '../components/classes'
import ThemeToggle from '../components/ThemeToggle'
import { formatEuros } from '../game/announce'
import { BONUS_PRIZE } from '../game/setup'
import { useSettings } from '../hooks/useSettings'
import { testMistralKey } from '../llm'
import type { KeyTestResult } from '../llm'
import { clearAllData, loadMistralKey } from '../storage/persist'
import { AIM_SPEEDS } from '../storage/settings'

/** Libellés affichés du réglage de vitesse de l'arc de visée, dans l'ordre de `AIM_SPEEDS`. */
const AIM_SPEED_LABELS: Record<(typeof AIM_SPEEDS)[number], string> = {
  slow: 'Lente',
  normal: 'Normale',
  fast: 'Rapide',
  extreme: 'Très rapide',
}

/** Millisecondes de repos imposées entre deux essais de clé. */
const TEST_COOLDOWN_MS = 2_000

/**
 * Indice d'une clé enregistrée : ses 4 derniers caractères seulement, précédés
 * de points de suspension. Assez pour qu'un utilisateur reconnaisse laquelle
 * de ses clés est enregistrée ; pas assez pour qu'une capture d'écran ou un
 * partage d'écran la révèle. Ne jamais élargir cette fenêtre.
 */
function keyHint(key: string): string {
  return `…${key.slice(-4)}`
}

/** Raison d'échec d'un test de clé, extraite de la branche `ok: false` de `KeyTestResult`. */
type KeyTestFailureReason = Extract<KeyTestResult, { readonly ok: false }>['reason']

/** Phrase d'échec, un cas par raison — le `switch` doit rester exhaustif sans `default`. */
function testFailureMessage(reason: KeyTestFailureReason): string {
  switch (reason) {
    case 'unauthorized':
      return 'Clé refusée par Mistral : vérifiez qu’elle est correcte et toujours active.'
    case 'network':
      return 'Service Mistral injoignable : vérifiez votre connexion et réessayez.'
    case 'timeout':
      return 'Mistral n’a pas répondu à temps. Réessayez dans un instant.'
    case 'bad-response':
      return 'Réponse inattendue de Mistral. Réessayez, ou changez de modèle.'
  }
}

/**
 * Réglages : apparence, mode de lancer de la roue, clé d'API Mistral (pour
 * tester l'accès au service), et remise à zéro des données. Les réglages de
 * partie (manches, adversaires, niveau des bots) vivent sur l'accueil et ne
 * sont pas dupliqués ici.
 */
export default function SettingsRoute() {
  const { settings, hasMistralKey, update, setMistralKey, forgetMistralKey } = useSettings()

  const apiKeyId = useId()
  const modelId = useId()
  const throwModeId = useId()
  const aimSpeedId = useId()

  // Indice de la clé enregistrée : relu depuis le stockage au moment voulu,
  // jamais gardé plus que ces 4 caractères — la clé complète ne doit exister
  // dans aucun état React de cet écran.
  const [hint, setHint] = useState<string | null>(() => {
    const key = loadMistralKey()
    return key === null ? null : keyHint(key)
  })

  const [draftKey, setDraftKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyMessage, setKeyMessage] = useState('')

  const [testing, setTesting] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const [testMessage, setTestMessage] = useState('')
  // Le minuteur de cooldown doit survivre aux rendus sans en déclencher, une
  // ref convient donc mieux qu'un état pour ce seul identifiant.
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [confirmingClear, setConfirmingClear] = useState(false)

  // Le minuteur de cooldown est le seul travail en attente que cet écran laisse
  // derrière lui : sans ce nettoyage, il continuerait de courir après un
  // changement d'écran, pour rien.
  useEffect(() => {
    return () => {
      if (cooldownTimer.current !== null) clearTimeout(cooldownTimer.current)
    }
  }, [])

  function handleSaveKey() {
    const trimmed = draftKey.trim()
    if (trimmed === '') return
    setMistralKey(trimmed)
    // Vidé immédiatement : aucune raison de garder la clé dans un état React
    // une fois écrite, cet état finit dans les outils de développement.
    setDraftKey('')
    setShowKey(false)
    setHint(keyHint(trimmed))
    setKeyMessage('Clé enregistrée sur cet appareil.')
    // Un résultat de test portant sur la clé précédente n'a plus de sens et
    // masquerait le message ci-dessus, l'emplacement de compte rendu étant unique.
    setTestMessage('')
  }

  function handleForgetKey() {
    forgetMistralKey()
    setHint(null)
    setKeyMessage('Clé effacée.')
    setTestMessage('')
  }

  async function handleTestKey() {
    // Sortie tôt, pas d'attribut `disabled` : le bouton reste focalisable
    // pendant le test et le lecteur d'écran garde son contexte.
    if (testing || cooldown) return
    const trimmed = draftKey.trim() !== '' ? draftKey.trim() : loadMistralKey()
    if (trimmed === null || trimmed === '') {
      setTestMessage('Saisissez une clé avant de la tester.')
      return
    }

    setTesting(true)
    setTestMessage('Test en cours…')
    const result = await testMistralKey({ apiKey: trimmed, model: settings.mistralModel })
    setTesting(false)
    setTestMessage(result.ok ? 'Clé valide : Mistral a répondu.' : testFailureMessage(result.reason))

    // Cooldown démarré après la réponse, pas avant : le temps de l'appel
    // compte de toute façon, et un martèlement pendant l'attente ne doit pas
    // repartir pour un tour de plus.
    setCooldown(true)
    if (cooldownTimer.current !== null) clearTimeout(cooldownTimer.current)
    cooldownTimer.current = setTimeout(() => {
      setCooldown(false)
      cooldownTimer.current = null
    }, TEST_COOLDOWN_MS)
  }

  function handleRequestClear() {
    setConfirmingClear(true)
  }

  function handleCancelClear() {
    setConfirmingClear(false)
  }

  /*
   * Effacement suivi d'un **rechargement de la page**, et non d'un simple
   * message. `clearAllData` écrit dans le stockage sans rien dire aux
   * providers, qui gardent en mémoire les réglages, les énigmes perso et la
   * partie en cours : le premier `update` ou `replace` qui suivrait les
   * réécrirait tous depuis leur état React, et l'effacement serait annulé en
   * silence — pire que de n'avoir rien fait, l'utilisateur croyant ses données
   * supprimées. Repartir de zéro est le seul état dont on puisse répondre.
   *
   * `forgetMistralKey` avant le rechargement : si celui-ci est refusé (jsdom
   * dans les tests, navigateur bridé), l'écran ne doit au moins pas continuer
   * d'annoncer une clé qui n'existe plus.
   */
  function handleConfirmClear() {
    clearAllData()
    forgetMistralKey()
    setConfirmingClear(false)
    setHint(null)
    setDraftKey('')
    setKeyMessage('')
    setTestMessage('')
    window.location.reload()
  }

  const testDisabled = testing || cooldown

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-semibold text-fg">Apparence</h2>
        <div className={FIELD}>
          <span className="text-fg">Thème</span>
          <ThemeToggle />
        </div>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Lancer de la roue</h2>
        <div className={FIELD}>
          <label htmlFor={throwModeId} className="text-fg">
            Lancer simple (sans arc de visée)
          </label>
          <input
            id={throwModeId}
            type="checkbox"
            checked={settings.throwMode === 'simple'}
            onChange={(event) =>
              update({ throwMode: event.target.checked ? 'simple' : 'gauge' })
            }
            className="size-5 accent-primary"
          />
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Un seul clic lance la roue, l’angle visé est tiré au hasard.
        </p>

        <div className={FIELD}>
          <label htmlFor={aimSpeedId} className="text-fg">
            Vitesse de l’arc de visée
          </label>
          <select
            id={aimSpeedId}
            value={settings.aimSpeed}
            onChange={(event) => {
              const speed = AIM_SPEEDS.find((candidate) => candidate === event.target.value)
              if (speed !== undefined) update({ aimSpeed: speed })
            }}
            className={INPUT}
          >
            {AIM_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {AIM_SPEED_LABELS[speed]}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Plus l’arc va vite, plus la visée est difficile. Sans effet en mode « lancer simple ».
        </p>
      </section>

      {/*
        « Résoudre » ne consulte plus aucun juge depuis l'étape B : c'est une
        simple comparaison de chaînes (`src/game/compare.ts`), déterministe,
        sans réseau. Le seul usage restant de cette clé est le verdict de la
        question bonus de la manche finale — une question par partie, jouée
        uniquement si le gagnant de cette manche choisit d'y répondre.
      */}
      <section className={CARD}>
        <h2 className="font-semibold text-fg">Clé d’API Mistral</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {hasMistralKey
            ? `Une clé est enregistrée sur cet appareil (${hint ?? '…'}). Elle sert à juger la question bonus de la manche finale (${formatEuros(BONUS_PRIZE)} fixes), et au bouton « Tester la clé » ci-dessous.`
            : `Aucune clé enregistrée. Le jeu se joue entièrement sans : cette clé ne fait qu’ouvrir la question bonus de la manche finale (${formatEuros(BONUS_PRIZE)} fixes), et sert à « Tester la clé » ci-dessous.`}
        </p>

        {/* Avertissement volontairement visible, pas une note en petits
            caractères : c'est le seul endroit où l'utilisateur apprend que la
            clé est en clair et que son stockage PWA/Safari diverge sur iOS. */}
        <p className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-sm text-fg">
          La clé est stockée <strong>en clair</strong> sur cet appareil : quiconque ouvre les
          outils de développement du navigateur peut la lire. Les appels à Mistral sont
          facturés sur votre compte : utilisez de préférence une clé dédiée, révocable, avec un
          plafond de dépense. Sur iOS, une application installée depuis l’écran d’accueil a un
          stockage <strong>distinct</strong> de celui de Safari : une clé saisie dans l’un
          n’existe pas dans l’autre.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={apiKeyId} className="text-fg">
            Clé d’API Mistral
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={apiKeyId}
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              data-1p-ignore
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              className={`${INPUT} min-h-11 flex-1 text-base`}
              placeholder="Collez votre clé"
            />
            <button
              type="button"
              onClick={() => setShowKey((current) => !current)}
              className={`${BUTTON_GHOST} min-h-11`}
            >
              {showKey ? 'Masquer' : 'Afficher'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleSaveKey} className={`${BUTTON_PRIMARY} min-h-11`}>
              Enregistrer la clé
            </button>
            <button
              type="button"
              aria-disabled={testDisabled}
              onClick={() => {
                void handleTestKey()
              }}
              className={`${BUTTON_GHOST} min-h-11`}
            >
              Tester la clé
            </button>
            <button type="button" onClick={handleForgetKey} className={`${BUTTON_GHOST} min-h-11`}>
              Effacer la clé
            </button>
          </div>

          {/* Emplacement unique de compte rendu, partagé par l'enregistrement et
              le test : le dernier des deux à parler prime. `polite`, rien ici
              n'est urgent. Pas de `role="status"`, le layout racine en porte
              déjà un. */}
          <p aria-live="polite" aria-atomic="true" className="text-sm text-fg-muted">
            {testMessage === '' ? keyMessage : testMessage}
          </p>

          <div className={FIELD}>
            <label htmlFor={modelId} className="text-fg">
              Modèle
            </label>
            {/* Champ texte plutôt qu'un `<select>` : figer la liste des modèles
                Mistral dans notre code la ferait vieillir mal, ce catalogue
                évoluant hors de notre contrôle. */}
            <input
              id={modelId}
              type="text"
              value={settings.mistralModel}
              onChange={(event) => update({ mistralModel: event.target.value })}
              className={`${INPUT} min-h-11 text-base`}
            />
          </div>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Données</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Efface les réglages, la clé d’API, la partie en cours et vos énigmes personnelles.
          Pensez à exporter vos énigmes depuis l’éditeur si vous ne l’avez pas déjà fait.
        </p>

        {!confirmingClear && (
          <button
            type="button"
            onClick={handleRequestClear}
            className={`${BUTTON_GHOST} mt-2 min-h-11`}
          >
            Effacer toutes les données
          </button>
        )}

        {confirmingClear && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-fg">
              Confirmer : réglages, clé d’API, partie en cours et énigmes personnelles seront
              définitivement supprimés de cet appareil.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConfirmClear}
                className={`${BUTTON_PRIMARY} min-h-11`}
              >
                Confirmer l’effacement
              </button>
              <button type="button" onClick={handleCancelClear} className={`${BUTTON_GHOST} min-h-11`}>
                Annuler
              </button>
            </div>
          </div>
        )}

      </section>
    </div>
  )
}
