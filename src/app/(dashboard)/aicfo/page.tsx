import { AicfoChat } from "./_components/AicfoChat";

export default function AicfoPage() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI CFO</h1>
        <p className="text-muted-foreground text-sm">
          Analizá tus gastos, presupuesto, inversiones y patrimonio conversando
          con tu CFO personal.
        </p>
      </div>
      <AicfoChat />
    </div>
  );
}
