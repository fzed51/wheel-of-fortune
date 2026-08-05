import { CARD } from '../components/classes'

/** Règles. Coquille : le texte définitif et l'aide à l'installation viennent en dernier. */
export default function HowToPlayRoute() {
  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-semibold text-fg">En bref</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          <li>Tournez la roue, puis proposez une consonne.</li>
          <li>Chaque occurrence rapporte la valeur du segment.</li>
          <li>Une voyelle s’achète et ne rapporte rien.</li>
          <li>Banqueroute vide la cagnotte de la manche, Passe fait passer la main.</li>
          <li>Résoudre demande une clé d’IA, réglable dans les Réglages.</li>
        </ul>
      </section>

      <p className="text-fg-muted">Le texte complet des règles arrive en fin de parcours.</p>
    </div>
  )
}
