import { Suspense } from 'react';
import { Loading } from '@/components/states';
import Question from '@/features/entry/question';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Question />
    </Suspense>
  );
}
