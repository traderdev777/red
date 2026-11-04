import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 md:px-8" aria-busy="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-28" label="Loading scan" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
