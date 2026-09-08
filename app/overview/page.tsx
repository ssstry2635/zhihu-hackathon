import { Suspense } from 'react';
import Overview from '@/features/overview/overview';
import { Loading } from '@/components/states';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Overview />
    </Suspense>
  );
}
