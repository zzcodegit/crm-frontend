import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PublishedWeeksPanel from "../components/PublishedWeeksPanel";
import WorkScheduleBoard from "../components/WorkScheduleBoard";

export default function ScheduleManagement() {
  const [searchParams] = useSearchParams();
  const weekParam = searchParams.get("week");
  const [publishedListRefresh, setPublishedListRefresh] = useState(0);
  const [boardReloadKey, setBoardReloadKey] = useState(0);

  const handlePublishedChange = useCallback(() => {
    setPublishedListRefresh((k) => k + 1);
  }, []);

  const handleWeekDeletedFromList = useCallback(() => {
    setBoardReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="animate-slide-in min-w-0">
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <Link
          to="/schedule-confirmations"
          className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }}
        >
          Подтверждения консультантов
        </Link>
      </div>
      <PublishedWeeksPanel refreshKey={publishedListRefresh} onWeekDeleted={handleWeekDeletedFromList} />
      <WorkScheduleBoard
        mode="admin"
        reloadKey={boardReloadKey}
        initialWeekMonday={weekParam}
        onPublishedChange={handlePublishedChange}
      />
    </div>
  );
}
