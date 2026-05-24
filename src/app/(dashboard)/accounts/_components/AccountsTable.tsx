"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts, useDeleteAccount } from "@/hooks/useAccounts";
import { ACCOUNT_TYPE_LABELS } from "@/types/accounts";
import type { Account } from "@/types/accounts";
import { AccountDialog } from "./AccountDialog";

export function AccountsTable() {
  const { data: accounts, isLoading, isError, error, refetch } = useAccounts();
  const deleteMutation = useDeleteAccount();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Delete confirmation state
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);

  const handleCreate = () => {
    setEditingAccount(null);
    setDialogOpen(true);
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingAccount) return;
    try {
      await deleteMutation.mutateAsync(deletingAccount.id);
      setDeletingAccount(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">Error al cargar las cuentas</p>
        <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => refetch()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1 size-4" />
          Nueva cuenta
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!accounts || accounts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm">
                      No hay cuentas. Creá tu primera cuenta para empezar.
                    </p>
                    <Button onClick={handleCreate} variant="outline" size="sm">
                      <Plus className="mr-1 size-4" />
                      Crear cuenta
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="hover:underline"
                    >
                      {account.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {ACCOUNT_TYPE_LABELS[account.account_type]}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {account.account_type === "crypto_wallet"
                        ? "Multi"
                        : account.currency}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={account.is_active ? "default" : "outline"}
                    >
                      {account.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar cuenta"
                        onClick={() => handleEdit(account)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar cuenta"
                        onClick={() => setDeletingAccount(account)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <AccountDialog
        account={editingAccount}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingAccount}
        onOpenChange={(open) => !open && setDeletingAccount(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar cuenta</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar la cuenta{" "}
              <span className="font-semibold">{deletingAccount?.name}</span>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingAccount(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
