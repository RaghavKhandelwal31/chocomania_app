import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { ForcePasswordChangePage } from "./pages/ForcePasswordChangePage";
import { AdminPage } from "./pages/AdminPage";
import { OrderFormPage } from "./pages/OrderFormPage";
import { OwnerHomePage } from "./pages/OwnerHomePage";
import { OwnerOrdersPage } from "./pages/OwnerOrdersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerProfilePage } from "./pages/CustomerProfilePage";
import { DuesPage } from "./pages/DuesPage";
import { ReportsPlaceholderPage } from "./pages/ReportsPlaceholderPage";
import { WorkerProductionPage } from "./pages/WorkerProductionPage";
import { ViewerHomePlaceholder } from "./pages/ViewerHandoffPage";

function AuthenticatedRouter() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFFDF9] text-xl font-bold text-[#4A2511]">
        {t("common.loading")}
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (user.mustChangePassword) {
    return <ForcePasswordChangePage />;
  }

  if (user.role === "viewer") {
    return (
      <AppShell>
        <Routes>
          <Route path="*" element={<ViewerHomePlaceholder />} />
        </Routes>
      </AppShell>
    );
  }

  if (user.role === "worker") {
    return (
      <AppShell>
        <Routes>
          <Route path="/production" element={<WorkerProductionPage />} />
          <Route path="*" element={<Navigate to="/production" replace />} />
        </Routes>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OwnerHomePage />} />
        <Route path="/orders" element={<OwnerOrdersPage />} />
        <Route path="/orders/new" element={<OrderFormPage />} />
        <Route path="/orders/:id/edit" element={<OrderFormPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerProfilePage />} />
        <Route path="/dues" element={<DuesPage />} />
        <Route path="/reports" element={<ReportsPlaceholderPage />} />
        {user.role === "admin" && <Route path="/admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
