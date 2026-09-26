import { Collection } from '../components/Collection';
import { SaveTransfer } from '../components/SaveTransfer';

export function CollectionPage() {
  return (
    <section className="page" aria-labelledby="collection-title">
      <h1 id="collection-title" className="page-title">
        말랑 도감
      </h1>
      <p className="page-subtitle">말랑이를 누르면 자세히 보고 파트너로 데려갈 수 있어요.</p>
      <Collection />
      <SaveTransfer />
    </section>
  );
}
