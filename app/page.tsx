import { redirect } from "next/navigation";

// A tela inicial do sistema é o painel "Hoje" (§3, item 3).
export default function Home() {
  redirect("/hoje");
}
