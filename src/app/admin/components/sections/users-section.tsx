"use client";

import { useState, type FormEvent } from "react";
import { Coins, Loader2, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUsersPayload } from "@/lib/db/services/admin-users";
import { useAdminResource } from "../../lib/use-admin-resource";
import { DangerAction } from "../danger-action";
import { DataState, RefreshButton, SectionCard } from "../ui-bits";

type ListedUser = AdminUsersPayload["users"][number];

async function mutate(method: string, body: unknown) {
  const response = await fetch("/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(result?.error || "Åtgärden kunde inte genomföras.");
  }
  return result;
}

export function UsersSection() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, loading, error, reload } = useAdminResource<AdminUsersPayload>(
    `/api/admin/users?q=${encodeURIComponent(query)}&offset=${offset}`,
    { errorMessage: "Kunde inte hämta användarna." },
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [grant, setGrant] = useState<{ user: ListedUser; requestId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setFormError(null);
    try {
      if (grant) {
        await mutate("PATCH", {
          userId: grant.user.id,
          amount: Number(fields.get("credits")),
          requestId: grant.requestId,
        });
        setGrant(null);
        toast.success("Krediterna har lagts till.");
      } else {
        await mutate("POST", {
          email: fields.get("email"),
          name: fields.get("name"),
          password: fields.get("password"),
          credits: Number(fields.get("credits")),
        });
        setCreateOpen(false);
        setQuery("");
        setSearch("");
        setOffset(0);
        toast.success("Kontot är skapat och kan logga in direkt.");
      }
      await reload();
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "Åtgärden misslyckades.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Användare"
        icon={Users}
        description="Skapa konton som kan logga in direkt. Inget mejl skickas. Startsaldo bokförs i kredithistoriken."
        action={
          <Button
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Lägg till användare
          </Button>
        }
      >
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setOffset(0);
            setQuery(search.trim());
          }}
        >
          <div className="min-w-0 flex-1">
            <Label htmlFor="user-search">Sök namn eller e-post</Label>
            <Input
              id="user-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={120}
            />
          </div>
          <Button type="submit" variant="outline">
            <Search className="mr-2 h-4 w-4" />
            Sök
          </Button>
          <RefreshButton onClick={() => void reload()} loading={loading} />
        </form>
        <div className="mt-4">
          <DataState
            loading={loading}
            error={error}
            isEmpty={!data?.users.length}
            onRetry={() => void reload()}
            emptyTitle="Inga användare hittades"
            emptyDescription="Prova en annan sökning eller lägg till en användare."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Konto</TableHead>
                  <TableHead>Krediter</TableHead>
                  <TableHead>Projekt</TableHead>
                  <TableHead>Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-medium">{user.name || user.email}</p>
                      <p className="text-muted-foreground text-xs">{user.email}</p>
                      <p className="text-muted-foreground text-xs">
                        {user.emailVerified ? "Verifierad" : "Ej verifierad"}
                        {user.freeGenerationAvailable ? " · En gratisgenerering kvar" : ""}
                      </p>
                    </TableCell>
                    <TableCell className="tabular-nums">{user.credits}</TableCell>
                    <TableCell className="tabular-nums">{user.projectCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setFormError(null);
                            setGrant({ user, requestId: crypto.randomUUID() });
                          }}
                          aria-label={`Ge krediter till ${user.email}`}
                        >
                          <Coins className="mr-1 h-3.5 w-3.5" />
                          Ge krediter
                        </Button>
                        <DangerAction
                          label="Radera"
                          title="Radera användaren?"
                          confirmWord={user.email}
                          description={user.email}
                          impact="Kontot och dess testkredithistorik raderas permanent. Konton med projekt eller betalningshistorik skyddas."
                          disabled={busy || !!user.deletionProtection || user.projectCount > 0}
                          onConfirm={async () => {
                            setBusy(true);
                            try {
                              await mutate("DELETE", { userId: user.id, confirmEmail: user.email });
                              toast.success("Kontot har raderats.");
                              await reload();
                              return true;
                            } catch (failure) {
                              toast.error(
                                failure instanceof Error
                                  ? failure.message
                                  : "Raderingen misslyckades.",
                              );
                              return false;
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      </div>
                      {user.deletionProtection && (
                        <p className="text-muted-foreground mt-1 max-w-xs text-xs">
                          {user.deletionProtection}
                        </p>
                      )}
                      {user.projectCount > 0 && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Flytta eller radera projekten innan kontot kan raderas.
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataState>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Föregående
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !data?.hasMore}
              onClick={() => setOffset(offset + 25)}
            >
              Nästa
            </Button>
          </div>
        </div>
      </SectionCard>
      <Dialog
        open={createOpen || !!grant}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setCreateOpen(false);
            setGrant(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{grant ? "Tilldela krediter" : "Lägg till användare"}</DialogTitle>
            <DialogDescription>
              {grant
                ? grant.user.email
                : "Kontot får direkt åtkomst utan verifieringsmejl. Dela lösenordet med användaren."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {!grant && (
              <>
                <div>
                  <Label htmlFor="new-user-email">E-post</Label>
                  <Input
                    id="new-user-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    required
                    maxLength={254}
                    disabled={busy}
                  />
                </div>
                <div>
                  <Label htmlFor="new-user-name">Namn (valfritt)</Label>
                  <Input id="new-user-name" name="name" maxLength={120} disabled={busy} />
                </div>
                <div>
                  <Label htmlFor="new-user-password">Lösenord</Label>
                  <Input
                    id="new-user-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    maxLength={256}
                    disabled={busy}
                  />
                  <p className="text-muted-foreground mt-1 text-xs">
                    Minst 6 tecken. Lösenordet sparas bara som hash och kan inte visas senare.
                  </p>
                </div>
              </>
            )}
            <div>
              <Label htmlFor="user-credits">
                {grant ? "Krediter att lägga till" : "Startsaldo i krediter"}
              </Label>
              <Input
                id="user-credits"
                name="credits"
                type="number"
                defaultValue={100}
                required
                min={grant ? 1 : 0}
                max={100000}
                step={1}
                disabled={busy}
              />
              <p className="text-muted-foreground mt-1 text-xs">
                100 krediter är ett testsaldo. Antalet genereringar beror på modell och förbrukning.
                {!grant && " Ingen extra gratisgenerering läggs till."}
              </p>
            </div>
            {formError && (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {grant ? "Lägg till krediter" : "Skapa konto"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
