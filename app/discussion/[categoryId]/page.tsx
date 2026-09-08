import { Suspense } from 'react';
import Discussion from '@/features/discussion/discussion';
import { Loading } from '@/components/states';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Discussion />
    </Suspense>
  );
}
