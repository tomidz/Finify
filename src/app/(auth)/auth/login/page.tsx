import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const supabase = await createClient();
  // getUser() y no getClaims(): con una sesión revocada los claims del JWT
  // siguen validando localmente, y esta página rebotaba a "/" para que el
  // layout la mandara de vuelta acá.
  let hasUser = false;
  try {
    const { data } = await supabase.auth.getUser();
    hasUser = Boolean(data.user);
  } catch {
    hasUser = false;
  }

  if (hasUser) {
    redirect("/");
  }

  const { expired } = await searchParams;

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl shadow-sm">
          <Wallet className="size-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Finify</h1>
          <p className="text-muted-foreground text-sm">
            Tus finanzas personales, en un solo lugar.
          </p>
        </div>
      </div>
      {expired === "1" && (
        <div
          role="status"
          className="border-border bg-muted/50 text-muted-foreground rounded-md border px-3 py-2 text-center text-sm"
        >
          Tu sesión expiró. Ingresá de nuevo.
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>
            Ingresá con tu email y contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
