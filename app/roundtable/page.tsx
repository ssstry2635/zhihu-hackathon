import { Suspense } from 'react';
import Roundtable from '@/features/roundtable/roundtable';
import { Loading } from '@/components/states';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Roundtable />
    </Suspense>
  );
}
