// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadJson } from './download'

describe('downloadJson', () => {
  const createObjectURL = vi.fn(() => 'blob:fake-url')
  const revokeObjectURL = vi.fn()
  let clickSpy: ReturnType<typeof vi.spyOn>

  let clickedDownloadAttr: string | null = null

  beforeEach(() => {
    // jsdom n'implémente pas ces deux méthodes : on les remplace par des espions.
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    clickedDownloadAttr = null
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedDownloadAttr = this.download
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
  })

  /** Un tour de boucle réel : c'est le délai que s'accorde `downloadJson` avant de révoquer. */
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('crée une URL et clique une ancre portant le bon nom de fichier', () => {
    downloadJson('mes-enigmes.json', '{"a":1}')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(clickedDownloadAttr).toBe('mes-enigmes.json')
  })

  it('ne révoque l’URL qu’au tour de boucle suivant, sinon Safari annule le téléchargement', async () => {
    downloadJson('mes-enigmes.json', '{"a":1}')

    expect(revokeObjectURL).not.toHaveBeenCalled()
    await tick()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('ne lève pas et révoque quand même si le clic échoue', async () => {
    clickSpy.mockImplementation(() => {
      throw new Error('échec simulé')
    })

    expect(() => downloadJson('mes-enigmes.json', '{}')).not.toThrow()
    await tick()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('ne fait rien si URL.createObjectURL n’existe pas', () => {
    // @ts-expect-error simule un environnement sans cette API
    URL.createObjectURL = undefined

    expect(() => downloadJson('mes-enigmes.json', '{}')).not.toThrow()
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
