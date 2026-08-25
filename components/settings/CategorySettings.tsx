"use client";

// Administrarea categoriilor. Adaugare si redenumire, nimic altceva.
//
// NU EXISTA STERGERE, si nu din lipsa de timp. Cheia straina de la products
// catre categories este on delete restrict, deci o categorie folosita nu poate
// fi stearsa la nivel de baza de date. Un buton care esueaza mereu este mai rau
// decat un buton care nu exista, asa ca numarul de produse este aratat pe fiecare
// rand si explica singur de ce categoria nu pleaca nicaieri.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Input,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import type { Category } from "@/lib/data/products";
import { createCategory, renameCategory } from "@/lib/data/product-actions";
import { plural } from "@/lib/data/format";

export function CategorySettings({
  categories,
  canWrite,
}: {
  categories: Category[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  async function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await createCategory(name);
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    setName("");
    setPending(false);
    router.refresh();
  }

  async function onRename(id: string) {
    setError(null);
    setPending(true);
    const result = await renameCategory(id, editingName);
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    setEditingId(null);
    setPending(false);
    router.refresh();
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title="Categorii"
        hint="Fiecare produs aparține exact unei categorii."
        right={
          <span className="text-[12.5px] text-rc-muted" data-testid="category-count">
            {plural(categories.length, "categorie", "categorii")}
          </span>
        }
      />

      {canWrite ? (
        <form onSubmit={onAdd} className="px-5 py-4 border-b border-rc-line flex items-end gap-2">
          <label className="flex-1">
            <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">
              Categorie nouă
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Învelitori"
              data-testid="category-name"
            />
          </label>
          <Button type="submit" disabled={pending} data-testid="category-add">
            {pending ? "Se adaugă..." : "Adaugă"}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="category-error"
          className="mx-5 mt-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
        >
          {error}
        </p>
      ) : null}

      <Table>
        <thead>
          <tr>
            <Th>Categorie</Th>
            <Th align="right">Produse</Th>
            {canWrite ? <Th align="right">Acțiuni</Th> : null}
          </tr>
        </thead>
        <tbody data-testid="category-rows">
          {categories.map((c) => (
            <tr key={c.id} data-testid="category-row" data-name={c.name}>
              <Td>
                {editingId === c.id ? (
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    data-testid="category-rename-input"
                    autoFocus
                  />
                ) : (
                  <span className="text-[13.5px] font-medium text-rc-black">{c.name}</span>
                )}
              </Td>
              <Td align="right">
                <span className="rc-num text-[13px] text-rc-muted">{c.productCount}</span>
              </Td>
              {canWrite ? (
                <Td align="right">
                  {editingId === c.id ? (
                    <span className="inline-flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => onRename(c.id)}
                        disabled={pending}
                        data-testid="category-rename-save"
                      >
                        Salvează
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Renunță
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditingName(c.name);
                      }}
                      data-testid="category-rename"
                    >
                      Redenumește
                    </Button>
                  )}
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Table>

      {categories.length === 0 ? (
        <p
          className="px-5 py-10 text-center text-[13px] text-rc-muted"
          data-testid="category-empty"
        >
          Nicio categorie încă. Adaugă prima categorie ca să poți crea produse.
        </p>
      ) : null}
    </Card>
  );
}
