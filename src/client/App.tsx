import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { ForcePasswordChangePage } from "./pages/ForcePasswordChangePage";
import { AdminPage } from "./pages/AdminPage";
import { OrderFormPage } from "./pages/OrderFormPage";
import { OwnerOrdersPage } from "./pages/OwnerOrdersPage";
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
        <Route path="/" element={<OwnerOrdersPage />} />
        <Route path="/orders" element={<OwnerOrdersPage />} />
        <Route path="/orders/new" element={<OrderFormPage />} />
        <Route path="/orders/:id/edit" element={<OrderFormPage />} />
        <Route path="/customers" element={<OwnerOrdersPage />} />
        <Route path="/dues" element={<OwnerOrdersPage />} />
        <Route path="/reports" element={<OwnerOrdersPage />} />
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
