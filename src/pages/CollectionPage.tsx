import { Collection } from '../components/Collection';

export function CollectionPage() {
  return (
    <section className="page" aria-labelledby="collection-title">
      <h1 id="collection-title" className="page-title">
        📖 말랑 도감
      </h1>
      <p className="page-subtitle">만난 말랑이를 눌러 파트너로 정할 수 있어요.</p>
      <Collection />
    </section>
  );
}
