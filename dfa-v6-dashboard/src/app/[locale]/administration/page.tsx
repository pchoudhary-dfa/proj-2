"use client";
import { useSearchParams } from "next/navigation";
import Translations from "@/components/administration/translations/Translations";
import UserManagement from "@/components/administration/users/UserManagement";
import TransactionLogs from "@/components/administration/transactionLogs/TransactionLogs";
import Settings from "@/components/administration/settings/Settings";

export default function AdministrationPage() {
  const searchParams = useSearchParams();
  const section = searchParams.get('section');
  if (section === 'translations') {
    return <Translations />;
  } else if (section === 'user-management') {
    return <UserManagement />;
  } else if (section === 'transaction-logs') {
    return <TransactionLogs />;
  } else if (section === 'settings') {
    return <Settings />;
  } else {
    return <div>No section selected</div>;
  } 
}