import { useParams, Navigate, useLocation } from "react-router-dom";
import PricelistCreate from "./PricelistCreate";
import { pricelistBasePathFromPathname } from "../utils/pricelistRoutes";

/**
 * Страница редактирования позиции прайслиста.
 * Рендерит ту же форму, что и создание, с editId из URL.
 */
export default function PricelistEdit() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const basePath = pricelistBasePathFromPathname(location.pathname);
  const editId = id ? parseInt(id, 10) : NaN;
  if (!id || Number.isNaN(editId)) return <Navigate to={basePath} replace />;
  return <PricelistCreate editId={editId} />;
}
