import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 md:px-8" aria-busy="true">
      <Skeleton className="h-10 w-64" label="Loading" />
      <Skeleton className="h-14 w-full max-w-3xl" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
