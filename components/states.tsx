import Link from 'next/link';
import {AlertCircle} from 'lucide-react';
import {Skeleton} from '@/components/ui/skeleton';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription,EmptyContent} from '@/components/ui/empty';
export function Loading({label='正在载入讨论材料…'}:{label?:string}){return <div className="loading-state" role="status"><p>{label}</p><Skeleton className="h-10 w-2/3"/><Skeleton className="h-40 w-full"/><Skeleton className="h-32 w-full"/></div>}
export function ErrorState({message}:{message:string}){return <Empty className="state-card"><EmptyHeader><AlertCircle/><EmptyTitle>暂时无法打开</EmptyTitle><EmptyDescription>{message}</EmptyDescription></EmptyHeader><EmptyContent><Link className="button primary" href="/">返回问题现场</Link></EmptyContent></Empty>}
export function EmptyDiscussion(){return <Empty className="empty-discussion"><EmptyHeader><EmptyTitle>这里还缺少你的经历</EmptyTitle><EmptyDescription>围绕上面的问题，补充一个具体例子或适用条件。</EmptyDescription></EmptyHeader></Empty>}
