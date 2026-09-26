import { useEffect } from 'react';
import { Collection } from '../components/Collection';
import { SaveTransfer } from '../components/SaveTransfer';
import { writeCoachFlags } from '../lib/coachFlags';

export function CollectionPage() {
  // 홈 "처음 안내"의 마지막 단계(도감 보기)를 마친다
  useEffect(() => {
    writeCoachFlags({ collectionSeen: true });
  }, []);

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
