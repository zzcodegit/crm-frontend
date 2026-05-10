import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import UserEdit from "./pages/UserEdit";
import GroupMembers from "./pages/GroupMembers";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import References from "./pages/References";
import RefBook from "./pages/RefBook";
import ProductsRef from "./pages/ProductsRef";
import ProductCharacteristicsRef from "./pages/ProductCharacteristicsRef";
import LensCatalog from "./pages/LensCatalog";
import LensCatalogPdfPage from "./pages/LensCatalogPdfPage";
import Drive from "./pages/Drive";
import DriveFileView from "./pages/DriveFileView";
import DrivePublicLink from "./pages/DrivePublicLink";
import LensDetail from "./pages/LensDetail";
import Pricelist from "./pages/Pricelist";
import PricelistRx from "./pages/PricelistRx";
import PricelistMkl from "./pages/PricelistMkl";
import PricelistDetail from "./pages/PricelistDetail";
import PricelistCreate from "./pages/PricelistCreate";
import PricelistEdit from "./pages/PricelistEdit";
import Reports from "./pages/Reports";
import ReportsExpenses from "./pages/ReportsExpenses";
import ReportsEncashment from "./pages/ReportsEncashment";
import ReportsCentralCash from "./pages/ReportsCentralCash";
import ReportsAnalyticsPoint from "./pages/ReportsAnalyticsPoint";
import ReportsAnalyticsConsultant from "./pages/ReportsAnalyticsConsultant";
import ReportsDebtsSummary from "./pages/ReportsDebtsSummary";
import ReportsWithholding from "./pages/ReportsWithholding";
import ReportNew from "./pages/ReportNew";
import Training from "./pages/Training";
import TrainingArticleForm from "./pages/TrainingArticleForm";
import TrainingArticleView from "./pages/TrainingArticleView";
import TrainingCourseBuilder from "./pages/TrainingCourseBuilder";
import TrainingCoursePlayer from "./pages/TrainingCoursePlayer";
import NormativeActs from "./pages/NormativeActs";
import NormativeActForm from "./pages/NormativeActForm";
import NormativeActView from "./pages/NormativeActView";
import NormativeActReport from "./pages/NormativeActReport";
import NormativeActsReport from "./pages/NormativeActsReport";
import Manufacturers from "./pages/Manufacturers";
import ManufacturerForm from "./pages/ManufacturerForm";
import Features from "./pages/Features";
import FeatureForm from "./pages/FeatureForm";
import PricelistGroups from "./pages/PricelistGroups";
import PricelistRxGroups from "./pages/PricelistRxGroups";
import PricelistMklGroups from "./pages/PricelistMklGroups";
import PricelistGroupForm from "./pages/PricelistGroupForm";
import Colors from "./pages/Colors";
import ColorForm from "./pages/ColorForm";
import Warehouses from "./pages/Warehouses";
import WarehouseForm from "./pages/WarehouseForm";
import ChatMessenger from "./pages/ChatMessenger";
import SettingsPermissions from "./pages/SettingsPermissions";
import CustomFieldsSettings from "./pages/CustomFieldsSettings";
import PricelistPublications from "./pages/PricelistPublications";
import CustomFieldReference from "./pages/CustomFieldReference";
import Tasks from "./pages/Tasks";
import SupplyTickets from "./pages/SupplyTickets";
import ScheduleManagement from "./pages/ScheduleManagement";
import ScheduleConfirmationsReport from "./pages/ScheduleConfirmationsReport";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-500 bg-slate-50 dark:bg-slate-900 dark:text-slate-400">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
        <span>Загрузка…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/drive/share/:token" element={<DrivePublicLink />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="drive" element={<Drive />} />
        <Route path="drive/view/:id" element={<DriveFileView />} />
        <Route path="lens-catalog" element={<AdminOnly><LensCatalog /></AdminOnly>} />
        <Route path="lens-catalog/pdf" element={<AdminOnly><LensCatalogPdfPage /></AdminOnly>} />
        <Route path="lens-catalog/:id" element={<AdminOnly><LensDetail /></AdminOnly>} />
        <Route path="pricelist" element={<Pricelist />} />
        <Route path="pricelist/new" element={<AdminOnly><PricelistCreate /></AdminOnly>} />
        <Route path="pricelist/:id/edit" element={<AdminOnly><PricelistEdit /></AdminOnly>} />
        <Route path="pricelist/:id" element={<PricelistDetail />} />
        <Route path="pricelist-rx" element={<PricelistRx />} />
        <Route path="pricelist-rx/new" element={<AdminOnly><PricelistCreate /></AdminOnly>} />
        <Route path="pricelist-rx/:id/edit" element={<AdminOnly><PricelistEdit /></AdminOnly>} />
        <Route path="pricelist-rx/:id" element={<PricelistDetail />} />
        <Route path="pricelist-mkl" element={<PricelistMkl />} />
        <Route path="pricelist-mkl/new" element={<AdminOnly><PricelistCreate /></AdminOnly>} />
        <Route path="pricelist-mkl/:id/edit" element={<AdminOnly><PricelistEdit /></AdminOnly>} />
        <Route path="pricelist-mkl/:id" element={<PricelistDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/expenses" element={<AdminOnly><ReportsExpenses /></AdminOnly>} />
        <Route path="reports/encashment" element={<AdminOnly><ReportsEncashment /></AdminOnly>} />
        <Route path="reports/central-cash" element={<AdminOnly><ReportsCentralCash /></AdminOnly>} />
        <Route path="reports/analytics/point" element={<AdminOnly><ReportsAnalyticsPoint /></AdminOnly>} />
        <Route path="reports/analytics/consultant" element={<AdminOnly><ReportsAnalyticsConsultant /></AdminOnly>} />
        <Route path="reports/debts-summary" element={<AdminOnly><ReportsDebtsSummary /></AdminOnly>} />
        <Route path="reports/withholding" element={<AdminOnly><ReportsWithholding /></AdminOnly>} />
        <Route path="reports/my-debts-stats" element={<ReportsDebtsSummary consultantSelfView />} />
        <Route path="reports/:id/edit" element={<AdminOnly><ReportNew /></AdminOnly>} />
        <Route path="reports/new" element={<ReportNew />} />
        <Route path="schedule-management" element={<AdminOnly><ScheduleManagement /></AdminOnly>} />
        <Route path="schedule-confirmations" element={<AdminOnly><ScheduleConfirmationsReport /></AdminOnly>} />
        <Route path="supply-tickets" element={<SupplyTickets />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="training/course/new" element={<AdminOnly><TrainingCourseBuilder /></AdminOnly>} />
        <Route path="training/course/:id/edit" element={<AdminOnly><TrainingCourseBuilder /></AdminOnly>} />
        <Route path="training/course/:id" element={<TrainingCoursePlayer />} />
        <Route path="training" element={<Training />} />
        <Route path="training/new" element={<AdminOnly><TrainingArticleForm /></AdminOnly>} />
        <Route path="training/:id/edit" element={<AdminOnly><TrainingArticleForm /></AdminOnly>} />
        <Route path="training/:id" element={<TrainingArticleView />} />
        <Route path="normative-acts" element={<NormativeActs />} />
        <Route path="normative-acts/report" element={<AdminOnly><NormativeActsReport /></AdminOnly>} />
        <Route path="normative-acts/new" element={<AdminOnly><NormativeActForm /></AdminOnly>} />
        <Route path="normative-acts/:id/edit" element={<AdminOnly><NormativeActForm /></AdminOnly>} />
        <Route path="normative-acts/:id/report" element={<AdminOnly><NormativeActReport /></AdminOnly>} />
        <Route path="normative-acts/:id" element={<NormativeActView />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/users" element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="settings/groups/:groupId" element={<AdminOnly><GroupMembers /></AdminOnly>} />
        <Route path="settings/users/:id" element={<AdminOnly><UserEdit /></AdminOnly>} />
        <Route path="settings/references" element={<AdminOnly><References /></AdminOnly>} />
        <Route path="settings/references/manufacturers" element={<AdminOnly><Manufacturers /></AdminOnly>} />
        <Route path="settings/references/manufacturers/:id" element={<AdminOnly><ManufacturerForm /></AdminOnly>} />
        <Route path="settings/references/features" element={<AdminOnly><Features /></AdminOnly>} />
        <Route path="settings/references/features/:id" element={<AdminOnly><FeatureForm /></AdminOnly>} />
        <Route path="settings/references/products" element={<AdminOnly><ProductsRef /></AdminOnly>} />
        <Route path="settings/references/product-characteristics" element={<AdminOnly><ProductCharacteristicsRef /></AdminOnly>} />
        <Route path="settings/references/colors" element={<AdminOnly><Colors /></AdminOnly>} />
        <Route path="settings/references/colors/:id" element={<AdminOnly><ColorForm /></AdminOnly>} />
        <Route path="settings/references/pricelist-groups" element={<AdminOnly><PricelistGroups /></AdminOnly>} />
        <Route path="settings/references/pricelist-groups/:id" element={<AdminOnly><PricelistGroupForm /></AdminOnly>} />
        <Route path="settings/references/pricelist-rx-groups" element={<AdminOnly><PricelistRxGroups /></AdminOnly>} />
        <Route path="settings/references/pricelist-rx-groups/:id" element={<AdminOnly><PricelistGroupForm /></AdminOnly>} />
        <Route path="settings/references/pricelist-mkl-groups" element={<AdminOnly><PricelistMklGroups /></AdminOnly>} />
        <Route path="settings/references/pricelist-mkl-groups/:id" element={<AdminOnly><PricelistGroupForm /></AdminOnly>} />
        <Route path="settings/references/warehouses" element={<AdminOnly><Warehouses /></AdminOnly>} />
        <Route path="settings/references/warehouses/:id" element={<AdminOnly><WarehouseForm /></AdminOnly>} />
        <Route path="settings/references/custom-field/:id" element={<AdminOnly><CustomFieldReference /></AdminOnly>} />
        <Route path="settings/references/:refKey" element={<AdminOnly><RefBook /></AdminOnly>} />
        <Route path="settings/permissions" element={<AdminOnly><SettingsPermissions /></AdminOnly>} />
        <Route path="settings/custom-fields" element={<AdminOnly><CustomFieldsSettings /></AdminOnly>} />
        <Route path="settings/pricelist-publications" element={<AdminOnly><PricelistPublications /></AdminOnly>} />
        <Route path="settings/portal-tasks" element={<Navigate to="/tasks" replace />} />
        <Route path="chat" element={<ChatMessenger />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
