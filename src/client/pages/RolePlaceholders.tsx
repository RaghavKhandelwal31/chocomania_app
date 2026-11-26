import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { OwnerOrdersPage } from "./OwnerOrdersPage";

export function OwnerHomePlaceholder() {
  return <OwnerOrdersPage />;
}

export { WorkerProductionPage as WorkerHomePlaceholder } from "./WorkerProductionPage";

export { ViewerHomePlaceholder } from "./ViewerHandoffPage";
