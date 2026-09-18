"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { PageButton } from "@/components/page-button";
import { RowActions } from "@/components/row-actions";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import { useConfirm } from "@/hooks/use-confirm";
import { useAccounts, useDeleteAccount } from "@/hooks/useAccounts";
import { useShortcut } from "@/lib/keyboard";
import { ACCOUNT_TYPE_LABELS } from "@/types/accounts";
import type { Account } from "@/types/accounts";
import { AccountDialog } from "./AccountDialog";

export function AccountsTable() {
  const { data: accounts, isLoading, isError, error, refetch } = useAccounts();
  const deleteMutation = useDeleteAccount();
  const confirm = useConfirm();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const handleCreate = () => {
    setEditingAccount(null);
    setDialogOpen(true);
  };
  useShortcut("n", handleCreate);

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setDialogOpen(true);
  };

  const handleDelete = async (account: Account) => {
    // FKs: transaction legs (kept by soft-deleted transactions), investments
    // and sales block the delete; recurring templates cascade.
    const confirmed = await confirm({
      title: `¿Borrar la cuenta "${account.name}"?`,
      description:
        "Se borran también sus recurrentes y sus metas quedan sin cuenta; no se puede si tiene inversiones o movimientos, borrados incluidos.",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(account.id);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const renderContent = () => {
    if (isLoading) return <StateCard variant="loading" className="min-h-64" />;
    // A failed refresh keeps what is on screen (QueryProvider says it failed).
    if (isError && error && !accounts) {
      return <StateCard variant="error" error={error} onRetry={() => refetch()} className="min-h-64" />;
    }
    if (!accounts || accounts.length === 0) {
      return (
        <StateCard
          variant="empty"
          icon={Wallet}
          title="Sin cuentas"
          description="Creá la primera para empezar."
          action={
            <PageButton variant="outline" icon={Plus} onClick={handleCreate}>
              Nueva cuenta
            </PageButton>
          }
          className="min-h-64"
        />
      );
    }
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => {
              // An optimistic row has no id on the server yet.
              const saving = account.id.startsWith("temp-");
              return (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">
                    {saving ? (
                      <TruncatedText className="max-w-60">{account.name}</TruncatedText>
                    ) : (
                      <Link href={`/accounts/${account.id}`} className="block max-w-60 hover:underline">
                        <TruncatedText>{account.name}</TruncatedText>
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>{ACCOUNT_TYPE_LABELS[account.account_type]}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{account.currency}</Badge>
                  </TableCell>
                  <TableCell>
                    {account.is_active ? (
                      "Activa"
                    ) : (
                      <span className="text-muted-foreground">Inactiva</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      actions={[
                        { label: "Editar", icon: Pencil, onSelect: () => handleEdit(account), disabled: saving },
                        {
                          label: "Borrar",
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => void handleDelete(account),
                          disabled: saving,
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <>
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Cuentas</PageHeaderTitle>
          <PageHeaderDescription>Bancos, brokers, wallets y efectivo.</PageHeaderDescription>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <PageButton icon={Plus} kbd="N" onClick={handleCreate}>
            Nueva cuenta
          </PageButton>
        </PageHeaderActions>
      </PageHeader>

      {renderContent()}

      <AccountDialog
        account={editingAccount}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
