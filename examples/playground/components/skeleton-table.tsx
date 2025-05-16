import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonTable() {
  return (
    <div className="border rounded-lg shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">
                <Skeleton className="h-4 w-8" />
              </th>
              <th className="p-3 text-left">
                <Skeleton className="h-4 w-24" />
              </th>
              <th className="p-3 text-left">
                <Skeleton className="h-4 w-32" />
              </th>
            </tr>
          </thead>
          <tbody>
            {[...Array(3)].map((_, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">
                  <Skeleton className="h-4 w-12" />
                </td>
                <td className="p-3">
                  <Skeleton className="h-4 w-48" />
                </td>
                <td className="p-3">
                  <Skeleton className="h-4 w-40" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}